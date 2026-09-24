// Normalises Yandex AI Studio's OpenAI-compatible stream (spike S3, Alice AI), wrapping any fetch:
// - with tool_choice "auto" a tool-call stream ends without a finish_reason chunk → add one before [DONE];
// - with "required" the service token [TOOL_CALL_END] leaks into content → drop it;
// - tool call ids equal the function name → make them unique per response.
// Other Yandex models pass through untouched. History is stored as fixed here and never rewritten, which keeps
// Yandex's prompt cache hitting (S3: the call id is not part of the prompt).

interface Chunk {
  id?: string;
  choices?: {
    finish_reason?: string | null;
    delta?: {
      content?: string | null;
      tool_calls?: { id?: string; index: number }[];
    };
  }[];
}

const TOOL_END = "[TOOL_CALL_END]";

export const yandexFetch =
  (base: typeof fetch): typeof fetch =>
  async (input, init) => {
    const res = await base(input, init);
    if (
      !(
        res.body &&
        res.headers.get("content-type")?.includes("text/event-stream")
      )
    ) {
      return res;
    }
    let finished = false;
    let sawToolCall = false;
    let lastId = "";
    let buffer = "";
    const encoder = new TextEncoder();

    const fixLine = (line: string): string => {
      if (!line.startsWith("data: ")) {
        return line;
      }
      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        if (finished || !sawToolCall) {
          return line;
        }
        const closing = {
          choices: [{ delta: {}, finish_reason: "tool_calls", index: 0 }],
          id: lastId,
          object: "chat.completion.chunk",
        };
        return `data: ${JSON.stringify(closing)}\n\n${line}`;
      }
      const chunk = JSON.parse(data) as Chunk;
      lastId = chunk.id ?? lastId;
      for (const choice of chunk.choices ?? []) {
        if (choice.finish_reason) {
          finished = true;
        }
        if (choice.delta?.content?.includes(TOOL_END)) {
          choice.delta.content = choice.delta.content.replaceAll(TOOL_END, "");
        }
        for (const call of choice.delta?.tool_calls ?? []) {
          sawToolCall = true;
          if (call.id) {
            call.id = `${call.id}_${chunk.id}_${call.index}`;
          }
        }
      }
      return `data: ${JSON.stringify(chunk)}`;
    };

    const body = res.body.pipeThrough(new TextDecoderStream()).pipeThrough(
      new TransformStream<string, Uint8Array>({
        flush(controller) {
          if (buffer) {
            controller.enqueue(encoder.encode(fixLine(buffer)));
          }
        },
        transform(text, controller) {
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          controller.enqueue(
            encoder.encode(`${lines.map(fixLine).join("\n")}\n`)
          );
        },
      })
    );
    return new Response(body, {
      headers: res.headers,
      status: res.status,
      statusText: res.statusText,
    });
  };
