// S3 (Yandex AI Studio) and S7 (Ollama) share one question: does an OpenAI-compatible endpoint behind
// @ai-sdk/openai-compatible stream, call tools in both modes and close a multi-step tool loop?
//
//   BASE_URL=… API_KEY=… MODEL=… [HEADERS='{"OpenAI-Project":"…"}'] pnpm spike
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, isStepCount, streamText, tool } from "ai";
import { z } from "zod";

import { yandexFetch } from "./yandex-fetch";

const { BASE_URL, API_KEY = "", MODEL, HEADERS = "{}", NAME = "compatible", FIX } = process.env;
if (!BASE_URL || !MODEL) {
  console.error("BASE_URL and MODEL are required");
  process.exit(1);
}

const provider = createOpenAICompatible({ apiKey: API_KEY, baseURL: BASE_URL, fetch: FIX === "yandex" ? yandexFetch : undefined, headers: JSON.parse(HEADERS), name: NAME });
const model = provider.chatModel(MODEL);

// Deterministic tool, so the final answer can be checked for the value it returned.
const weather = tool({
  description: "Current weather in a city",
  execute: async ({ city }) => ({ city, temperatureC: 17, conditions: "light rain" }),
  inputSchema: z.object({ city: z.string().describe("City name") }),
});
const ASK = "Какая сейчас погода в Москве? Используй инструмент weather.";

type Case = { name: string; run: () => Promise<string> };
const cases: Case[] = [
  {
    name: "text",
    run: async () => (await generateText({ model, prompt: "Ответь одним словом: столица Франции?" })).text.trim(),
  },
  {
    name: "stream text",
    run: async () => {
      // Stream errors go to onError, not into the text stream — collect them so an empty stream fails the case.
      let failure: unknown;
      const result = streamText({ model, onError: ({ error }) => (failure = error), prompt: "Посчитай от 1 до 5 через запятую." });
      let chunks = 0;
      let text = "";
      for await (const delta of result.textStream) {
        chunks += 1;
        text += delta;
      }
      if (failure) throw failure;
      if (!text.trim()) throw new Error("empty stream");
      return `${chunks} chunks: ${text.trim()}`;
    },
  },
  {
    name: "tool call",
    run: async () => {
      const r = await generateText({ model, prompt: ASK, toolChoice: "required", tools: { weather } });
      const call = r.toolCalls[0];
      if (!call) throw new Error(`no tool call, text: ${r.text}`);
      return `${call.toolName}(${JSON.stringify(call.input)})`;
    },
  },
  {
    name: "stream + tool call",
    run: async () => {
      const result = streamText({ model, onError: () => undefined, prompt: ASK, toolChoice: "required", tools: { weather } });
      const parts: string[] = [];
      for await (const part of result.fullStream) {
        if (part.type === "tool-input-delta") parts.push("Δ");
        if (part.type === "tool-call") parts.push(`${part.toolName}(${JSON.stringify(part.input)})`);
        if (part.type === "text-delta" && part.text.trim()) parts.push(`text:${JSON.stringify(part.text)}`);
        if (part.type === "error") throw part.error;
      }
      const call = parts.find((p) => p.startsWith("weather("));
      if (!call) throw new Error(`no tool call in stream: ${parts.join(" ")}`);
      const leaked = parts.filter((p) => p.startsWith("text:"));
      return `${parts.filter((p) => p === "Δ").length} input deltas, ${call}${leaked.length ? `, text ${leaked.join(" ")}` : ""}`;
    },
  },
  {
    name: "tool loop (stream)",
    run: async () => {
      let failure: unknown;
      const result = streamText({ model, onError: ({ error }) => (failure = error), prompt: ASK, stopWhen: isStepCount(4), tools: { weather } });
      let text = "";
      for await (const delta of result.textStream) text += delta;
      if (failure) throw failure;
      const steps = (await result.steps).length;
      if (!/17/.test(text)) throw new Error(`answer does not use the tool result: ${text.slice(0, 200)}`);
      return `${steps} steps: ${text.trim().replace(/\s+/g, " ").slice(0, 90)}`;
    },
  },
];

console.log(`${NAME} · ${MODEL}${FIX ? ` · fix=${FIX}` : ""}\n`);
let failed = 0;
for (const c of cases) {
  const started = Date.now();
  try {
    const out = await c.run();
    console.log(`${c.name.padEnd(22)} ok    ${String(Date.now() - started).padStart(5)} ms  ${out}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`${c.name.padEnd(22)} FAIL  ${String(Date.now() - started).padStart(5)} ms  ${message.replace(/\s+/g, " ").slice(0, 220)}`);
  }
}
process.exit(failed ? 1 : 0);
