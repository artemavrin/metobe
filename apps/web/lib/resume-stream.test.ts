import { setTimeout as sleep } from "node:timers/promises";

import type { UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { catchUp, recordStream, resumeStream } = await import("./resume-stream");

const chunk = (text: string) =>
  ({ delta: text, id: "t", type: "text-delta" }) as UIMessageChunk;
const texts = (chunks: UIMessageChunk[]) =>
  chunks
    .filter((c) => c.type !== "data-clock")
    .map((c) => (c.type === "text-delta" ? c.delta : c.type));

/** A source the test writes to by hand, like a model writing an answer. */
const source = () => {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>;
  const stream = new ReadableStream<UIMessageChunk>({
    start(c) {
      controller = c;
    },
  });
  return { controller, stream };
};

const readAll = (stream: ReadableStream<UIMessageChunk>) => {
  const reader = stream.getReader();
  const out: UIMessageChunk[] = [];
  const step = async (): Promise<UIMessageChunk[]> => {
    const { done, value } = await reader.read();
    if (done) {
      return out;
    }
    out.push(value);
    return step();
  };
  return step();
};

const tick = () => sleep(5);

describe("resuming an answer", () => {
  it("gives a late reader what was written, then the rest as it comes, then ends", async () => {
    const { controller, stream } = source();
    recordStream("chat-late", stream);
    controller.enqueue(chunk("one "));
    controller.enqueue(chunk("two "));
    await tick();
    const late = resumeStream("chat-late");
    expect(late).not.toBeNull();
    const reading = readAll(late as ReadableStream<UIMessageChunk>);
    await tick();
    controller.enqueue(chunk("three"));
    controller.close();
    // What was written by then arrives joined; the rest as it comes.
    expect(texts(await reading)).toEqual(["one two ", "three"]);
  });

  it("lets two readers each have the whole answer", async () => {
    const { controller, stream } = source();
    recordStream("chat-two", stream);
    controller.enqueue(chunk("a"));
    await tick();
    const first = readAll(
      resumeStream("chat-two") as ReadableStream<UIMessageChunk>
    );
    const second = readAll(
      resumeStream("chat-two") as ReadableStream<UIMessageChunk>
    );
    controller.enqueue(chunk("b"));
    controller.close();
    expect(texts(await first)).toEqual(["a", "b"]);
    expect(texts(await second)).toEqual(["a", "b"]);
  });

  it("has nothing for a chat with no answer being written", () => {
    expect(resumeStream("chat-none")).toBeNull();
  });

  it("gives nothing to a reader who comes after the answer is saved", async () => {
    const { controller, stream } = source();
    const saved = recordStream("chat-saved", stream);
    controller.enqueue(chunk("done"));
    controller.close();
    await tick();
    saved();
    expect(resumeStream("chat-saved")).toBeNull();
  });

  it("still ends a reader who was there when the answer was saved", async () => {
    const { controller, stream } = source();
    const saved = recordStream("chat-mid", stream);
    controller.enqueue(chunk("x"));
    await tick();
    const reading = readAll(
      resumeStream("chat-mid") as ReadableStream<UIMessageChunk>
    );
    controller.close();
    await tick();
    saved();
    expect(texts(await reading)).toEqual(["x"]);
  });

  it("does not forget a newer answer of the same chat", () => {
    const older = source();
    const forgetOlder = recordStream("chat-new", older.stream);
    const newer = source();
    recordStream("chat-new", newer.stream);
    forgetOlder();
    expect(resumeStream("chat-new")).not.toBeNull();
  });

  it("lets go of a reader who leaves", async () => {
    const { controller, stream } = source();
    recordStream("chat-leave", stream);
    controller.enqueue(chunk("a"));
    await tick();
    const reader = (
      resumeStream("chat-leave") as ReadableStream<UIMessageChunk>
    ).getReader();
    await reader.read();
    await reader.cancel();
    controller.enqueue(chunk("b"));
    controller.close();
    await tick();
    // The answer goes on without them: a new reader still gets all of it (joined, the answer being over).
    expect(
      texts(
        await readAll(
          resumeStream("chat-leave") as ReadableStream<UIMessageChunk>
        )
      )
    ).toEqual(["ab"]);
  });
});

const reasoning = (id: string, delta: string) =>
  ({ delta, id, type: "reasoning-delta" }) as UIMessageChunk;
const marker = (type: string) => ({ id: "t", type }) as UIMessageChunk;
const input = (id: string, part: string) =>
  ({
    inputTextDelta: part,
    toolCallId: id,
    type: "tool-input-delta",
  }) as UIMessageChunk;

const text = (id: string, delta: string) =>
  ({ delta, id, type: "text-delta" }) as UIMessageChunk;

describe("what a late reader gets of what is written", () => {
  it("joins the words of a text that follow each other into one", () => {
    const joined = catchUp([
      marker("text-start"),
      text("t", "Он"),
      text("t", "и "),
      text("t", "тут"),
    ]);
    expect(joined).toHaveLength(2);
    expect(joined[1]).toMatchObject({
      delta: "Они тут",
      id: "t",
      type: "text-delta",
    });
  });

  it("joins a reasoning, and keeps a text and a reasoning apart", () => {
    const joined = catchUp([
      reasoning("r", "думаю "),
      reasoning("r", "ещё"),
      text("t", "ответ"),
    ]);
    expect(joined.map((c) => c.type)).toEqual([
      "reasoning-delta",
      "text-delta",
    ]);
    expect(joined[0]).toMatchObject({ delta: "думаю ещё" });
  });

  it("joins the input of a tool call, one call at a time", () => {
    const joined = catchUp([
      input("a", '{"q'),
      input("a", '":1}'),
      input("b", "{}"),
    ]);
    expect(joined).toHaveLength(2);
    expect(joined[0]).toMatchObject({
      inputTextDelta: '{"q":1}',
      toolCallId: "a",
    });
  });

  it("does not join across another chunk, another part, or a delta with metadata of its own", () => {
    expect(
      catchUp([text("t", "a"), marker("text-end"), text("t", "b")])
    ).toHaveLength(3);
    expect(catchUp([text("t1", "a"), text("t2", "b")])).toHaveLength(2);
    const withMeta = {
      delta: "b",
      id: "t",
      providerMetadata: { x: { y: 1 } },
      type: "text-delta",
    } as UIMessageChunk;
    expect(catchUp([text("t", "a"), withMeta])).toHaveLength(2);
  });

  it("keeps every word and the order", () => {
    const joined = catchUp([
      text("t", "1"),
      text("t", "2"),
      marker("text-end"),
      text("u", "3"),
    ]);
    const all = joined
      .map((c) => (c.type === "text-delta" ? c.delta : "|"))
      .join("");
    expect(all).toBe("12|3");
  });

  it("gives a late reader the written part joined, then the rest one chunk at a time", async () => {
    const { controller, stream } = source();
    recordStream("chat-joined", stream);
    controller.enqueue(text("t", "раз "));
    controller.enqueue(text("t", "два "));
    await tick();
    const reading = readAll(
      resumeStream("chat-joined") as ReadableStream<UIMessageChunk>
    );
    await tick();
    controller.enqueue(text("t", "три "));
    controller.enqueue(text("t", "четыре"));
    controller.close();
    expect(texts(await reading)).toEqual(["раз два ", "три ", "четыре"]);
  });
});

const clock = (now: number) =>
  ({ data: now, transient: true, type: "data-clock" }) as UIMessageChunk;

describe("the server's clock for a reader who comes late", () => {
  it("leaves out the clocks of the past and adds his own after all of it", () => {
    const joined = catchUp([clock(1), text("t", "а"), clock(2)]);
    expect(joined.map((c) => c.type)).toEqual(["text-delta"]);
  });

  it("gives the late reader a fresh clock right after what was written", async () => {
    const { controller, stream } = source();
    recordStream("chat-clock", stream);
    controller.enqueue(clock(1));
    controller.enqueue(text("t", "слово"));
    await tick();
    const before = Date.now();
    const reading = readAll(
      resumeStream("chat-clock") as ReadableStream<UIMessageChunk>
    );
    controller.close();
    const got = await reading;
    expect(got.map((c) => c.type)).toEqual(["text-delta", "data-clock"]);
    const fresh = got[1] as { data: number };
    expect(fresh.data).toBeGreaterThanOrEqual(before);
  });
});
