import type {
  ModelLabel,
  ModelPayload,
  ModelToolView,
} from "@metobe/contracts/chat";

// What the model saw (PII-GUARD-PLAN З5, P31): a message's text as it went to the model or came from it, cut into
// plain text and the labels that stood for hidden values. A label finds its value in the record's `labels`:
// `[[EMAIL_e1f2a3]]` exactly; a person's label by its trailing id, since the model writes case forms the record may
// not have («Персоне_Женщине_7f3a01» for «Персона_Женщина_7f3a01»).

/** A label in the text: as the model had it, one key per hidden value, and the value when the record knows it. */
export interface LabelPiece {
  label: string;
  key: string;
  value: string;
}

export type Piece = string | LabelPiece;

const LABEL =
  /\[\[[A-Z][A-Z0-9_]*_[0-9a-fA-F]+\]\]|[Пп]ерсон[а-яё]*_[А-ЯЁа-яё]+_[0-9a-fA-F]+/gu;
const PERSON = /^[Пп]ерсон[а-яё]*_[А-ЯЁа-яё]+_(?<id>[0-9a-fA-F]+)$/u;

const personId = (label: string) =>
  PERSON.exec(label)?.groups?.id?.toLowerCase();

/** One key per hidden value: a person's label by its id, any other by itself. */
export const labelKey = (label: string) => {
  const id = personId(label);
  return id ? `person:${id}` : label;
};

/** The record's labels as a lookup: a label in the text → its value, or nothing when the record does not know it. */
export const labelLookup = (labels: ModelLabel[]) => {
  const exact = new Map<string, ModelLabel>();
  const people = new Map<string, ModelLabel>();
  for (const l of labels) {
    exact.set(l.label, l);
    const id = personId(l.label);
    if (id && !people.has(id)) {
      people.set(id, l);
    }
  }
  return (label: string): ModelLabel | undefined => {
    const id = personId(label);
    return exact.get(label) ?? (id ? people.get(id) : undefined);
  };
};

/** Every label-shaped run in a text, known or not. */
export const findLabels = (text: string) =>
  [...text.matchAll(LABEL)].map((m) => ({ at: m.index, label: m[0] }));

/** Text → pieces: plain text and the labels the record knows; a label it does not know stays plain text. */
export const splitLabels = (text: string, labels: ModelLabel[]): Piece[] => {
  const find = labelLookup(labels);
  const pieces: Piece[] = [];
  let last = 0;
  let plain = "";
  for (const { at, label } of findLabels(text)) {
    const known = find(label);
    if (!known) {
      continue;
    }
    plain += text.slice(last, at);
    if (plain) {
      pieces.push(plain);
      plain = "";
    }
    pieces.push({ key: labelKey(label), label, value: known.value });
    last = at + label.length;
  }
  plain += text.slice(last);
  if (plain) {
    pieces.push(plain);
  }
  return pieces;
};

// The app puts what it remembers in front of the person's message (memory-read.ts, `<memory>…</memory>`): the model
// gets both, but only the rest is the person's words.
const MEMORY = /^\s*<memory>\n?(?<memory>[\s\S]*?)\n?<\/memory>\s*/u;

/** A message as the model got it → what the app added from memory (without its tags) and the person's own words. */
export const splitMemory = (text: string) => {
  const m = MEMORY.exec(text);
  return m
    ? { memory: m.groups?.memory ?? "", own: text.slice(m[0].length) }
    : { memory: null, own: text };
};

/** How many different values the texts hide. */
export const countHidden = (texts: string[], labels: ModelLabel[]) => {
  const find = labelLookup(labels);
  const keys = new Set<string>();
  for (const text of texts) {
    for (const { label } of findLabels(text)) {
      if (find(label)) {
        keys.add(labelKey(label));
      }
    }
  }
  return keys.size;
};

/** What the model wrote to a tool, readable: JSON laid out like the chat's own input, anything else as it came. */
export const inputText = (input: unknown) => {
  if (typeof input !== "string") {
    return JSON.stringify(input, null, 2);
  }
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
};

/** The calls of one step of the work as the model saw them, in the step's order; those the record has. */
export const toolViews = (
  payload: ModelPayload | undefined,
  toolCallIds: string[]
): ModelToolView[] => {
  const all = new Map(
    (payload?.steps ?? []).flatMap((s) =>
      s.tools.map((t) => [t.toolCallId, t] as const)
    )
  );
  return toolCallIds.flatMap((id) => {
    const view = all.get(id);
    return view ? [view] : [];
  });
};

/** The texts of a step of the work as the model saw them: what it sent and what it got, laid out for reading. */
export const toolTexts = (views: ModelToolView[]) =>
  views.flatMap((v) => [
    ...(v.input === undefined ? [] : [inputText(v.input)]),
    ...(v.output === undefined ? [] : [v.output]),
  ]);

/**
 * The answer's words as the model wrote them, one text per block of words in the answer: the steps after the last
 * one that called a tool of the work (`workIds`), split where a step put a widget (a table, a chart) after its words —
 * as the chat splits the answer's words around them.
 */
export const answerTexts = (
  payload: ModelPayload | undefined,
  workIds: ReadonlySet<string>
) => {
  const steps = payload?.steps ?? [];
  let lastWork = -1;
  for (const [i, step] of steps.entries()) {
    if (step.tools.some((t) => workIds.has(t.toolCallId))) {
      lastWork = i;
    }
  }
  const texts: string[] = [];
  let words = "";
  for (const step of steps.slice(lastWork + 1)) {
    words += step.text ?? "";
    if (step.tools.length > 0 && words.trim()) {
      texts.push(words.trim());
      words = "";
    }
  }
  if (words.trim()) {
    texts.push(words.trim());
  }
  return texts;
};

/** The tag a label is drawn with inside the answer's markdown. */
export const LABEL_TAG = "model-label";

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const UNTOUCHED = new Set(["code", "pre"]);

const wrapLabels = (node: HastNode) => {
  if (
    !node.children ||
    (node.type === "element" && UNTOUCHED.has(node.tagName ?? ""))
  ) {
    return;
  }
  node.children = node.children.flatMap((child): HastNode[] => {
    if (child.type !== "text" || !child.value) {
      wrapLabels(child);
      return [child];
    }
    const text = child.value;
    const found = findLabels(text);
    if (found.length === 0) {
      return [child];
    }
    const out: HastNode[] = [];
    let last = 0;
    for (const { at, label } of found) {
      if (at > last) {
        out.push({ type: "text", value: text.slice(last, at) });
      }
      out.push({
        children: [{ type: "text", value: label }],
        properties: {},
        tagName: LABEL_TAG,
        type: "element",
      });
      last = at + label.length;
    }
    if (last < text.length) {
      out.push({ type: "text", value: text.slice(last) });
    }
    return out;
  });
};

/** A rehype step: every label-shaped run outside code becomes a `<model-label>`, drawn as a chip. */
export const rehypeLabels = () => (tree: HastNode) => {
  wrapLabels(tree);
};
