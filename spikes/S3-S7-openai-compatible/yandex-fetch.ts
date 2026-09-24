// Normalises Yandex AI Studio's OpenAI-compatible stream (found in S3, Alice AI):
// - with tool_choice "auto" a tool-call stream ends without a finish_reason chunk → add one before [DONE];
// - with "required" the service token [TOOL_CALL_END] leaks into content → drop it;
// - tool call ids equal the function name → make them unique per response.
export const yandexFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (!res.body || !res.headers.get("content-type")?.includes("text/event-stream")) return res;
  let finished = false;
  let sawToolCall = false;
  let lastId = "";
  let buffer = "";
  const encoder = new TextEncoder();
  const fix = (line: string): string => {
    if (!line.startsWith("data: ")) return line;
    const data = line.slice(6).trim();
    if (data === "[DONE]") {
      const tail = !finished && sawToolCall ? `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls", index: 0 }], id: lastId, object: "chat.completion.chunk" })}\n\n` : "";
      return `${tail}${line}`;
    }
    const chunk = JSON.parse(data);
    lastId = chunk.id ?? lastId;
    for (const choice of chunk.choices ?? []) {
      if (choice.finish_reason) finished = true;
      if (choice.delta?.content?.includes("[TOOL_CALL_END]")) choice.delta.content = choice.delta.content.replaceAll("[TOOL_CALL_END]", "");
      for (const call of choice.delta?.tool_calls ?? []) {
        sawToolCall = true;
        if (call.id) call.id = `${call.id}_${chunk.id}_${call.index}`;
      }
    }
    return `data: ${JSON.stringify(chunk)}`;
  };
  const body = res.body.pipeThrough(new TextDecoderStream()).pipeThrough(
    new TransformStream<string, Uint8Array>({
      flush(controller) {
        if (buffer) controller.enqueue(encoder.encode(fix(buffer)));
      },
      transform(text, controller) {
        buffer += text;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        controller.enqueue(encoder.encode(lines.map(fix).join("\n") + "\n"));
      },
    })
  );
  return new Response(body, { headers: res.headers, status: res.status, statusText: res.statusText });
};
