// Mock of OpenAI chat completions and Anthropic messages, streaming only.
// OpenAI: first turn with tools answers with a tool call, the turn after the tool result answers with text.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8080);
const name = process.env.MOCK_NAME ?? "mock";

const sse = (res) => {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  return (data, event) => res.write(`${event ? `event: ${event}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
};

const openai = (body, res) => {
  const send = sse(res);
  const base = { id: "chatcmpl-1", object: "chat.completion.chunk", created: 0, model: body.model };
  const hasToolResult = body.messages.some((m) => m.role === "tool");
  if (body.tools?.length && !hasToolResult) {
    send({ ...base, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: body.tools[0].function.name, arguments: "" } }] } }] });
    send({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] } }] });
    send({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"Moscow"}' } }] } }] });
    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
  } else {
    for (const word of [`[${name}] `, "hello ", "from ", "openai"]) {
      send({ ...base, choices: [{ index: 0, delta: { content: word } }] });
    }
    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 } });
  }
  send("[DONE]");
  res.end();
};

const anthropic = (body, res) => {
  const send = sse(res);
  send({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } }, "message_start");
  send({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, "content_block_start");
  for (const word of [`[${name}] `, "hello ", "from ", "anthropic"]) {
    send({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: word } }, "content_block_delta");
  }
  send({ type: "content_block_stop", index: 0 }, "content_block_stop");
  send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } }, "message_delta");
  send({ type: "message_stop" }, "message_stop");
  res.end();
};

export const startMock = (listenPort = port, host = "0.0.0.0") =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      console.log(`[${name}] ${req.method} ${req.url} host=${req.headers.host}`);
      const body = raw ? JSON.parse(raw) : {};
      if (req.url.endsWith("/chat/completions")) return openai(body, res);
      if (req.url.endsWith("/messages")) return anthropic(body, res);
      res.writeHead(404).end();
    });
    server.listen(listenPort, host, () => resolve(server));
  });

if (import.meta.url === `file://${process.argv[1]}`) {
  await startMock();
  console.log(`[${name}] listening on ${port}`);
}
