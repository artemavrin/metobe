// Access to the internal calculator (a private HTML file outside this repo). Read-only: its script is cut at
// `dotPlot` and evaluated in a sandbox, so what runs is the calculator's own `replay()`, not a copy of it.
import fs from "node:fs";
import vm from "node:vm";
import type { ModelPrice } from "./forecast.ts";

export const CALCULATOR_PATH =
  process.env.S26_CALCULATOR ?? `${process.env.HOME}/dev/ai/metobe-private/seat-economics.html`;

export type CalcState = {
  price: number;
  vat: number;
  fx: number;
  markup: number;
  infra: number;
  l5: number | null;
  lw: number | null;
  weekMode: "calendar" | "rolling";
  model: string;
  growth: number;
  memory: boolean;
};

export type CalcUser = {
  u: number;
  spent: number;
  blocked: number;
  stopped: number;
  chats: number;
  hit5: number;
  hitW: number;
  weeks: number;
  maxW: number;
  max5: number;
};

export type Calculator = {
  /** Events as `[user, t ms, chat, usd, rub, tin, tc, tout]`, in the calculator's own order. */
  events: [number, number, number, number, number, number, number, number][];
  users: string[];
  start: number;
  end: number;
  models: Record<string, ModelPrice & { label: string }>;
  memoryUsd: number;
  tenureDays: number[];
  firstAt: number[];
  defaults: CalcState;
  replay: (s: CalcState, limited: boolean) => { users: CalcUser[] };
};

/** Another dataset in the calculator's own format; the time of an event is `start + minutes × 60 s`. */
export type CalcData = { start: string; end: string; users: string[]; ev: number[][] };

export function openCalculator(
  data?: CalcData,
  models?: Record<string, ModelPrice & { label: string }>,
  path = CALCULATOR_PATH,
): Calculator {
  const html = fs.readFileSync(path, "utf8");
  const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  let code = script.slice(0, script.indexOf("function dotPlot"));
  if (data) code = code.replace(/^const DATA = .*$/m, "const DATA = __DATA__;");
  if (models) code = code.replace(/^const MODELS = .*$/m, "const MODELS = __MODELS__;");
  const ctx = vm.createContext({
    Date,
    Math,
    Infinity,
    Set,
    Map,
    Array,
    Number,
    Object,
    String,
    __DATA__: data,
    __MODELS__: models,
  });
  const out = vm.runInContext(
    `${code}\n({ replay, state, DATA, MODELS, EV, tenureDays, firstAt, T0, END })`,
    ctx,
  ) as {
    replay: Calculator["replay"];
    state: CalcState;
    DATA: { ev: Calculator["events"]; users: string[] };
    MODELS: Calculator["models"];
    EV: {
      u: number;
      t: number;
      chat: boolean;
      usd: number;
      rub: number;
      tin: number;
      tc: number;
      tout: number;
    }[];
    tenureDays: number[];
    firstAt: number[];
    T0: number;
    END: number;
  };
  const memoryUsd = Number(/c \+= ([\d.]+) \* usdRate/.exec(code)?.[1]);
  if (!Number.isFinite(memoryUsd)) throw new Error("memory add-on not found in the calculator");
  return {
    // Same order as `DATA.ev`; times already in ms.
    events: out.EV.map((e) => [e.u, e.t, e.chat ? 1 : 0, e.usd, e.rub, e.tin, e.tc, e.tout]),
    users: out.DATA.users,
    start: out.T0,
    end: out.END,
    models: out.MODELS,
    memoryUsd,
    tenureDays: out.tenureDays,
    firstAt: out.firstAt,
    defaults: { ...out.state },
    replay: out.replay,
  };
}
