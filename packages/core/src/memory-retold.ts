// An assistant's answer that retells what a tool read (Г1.6а, MEMORY-PLAN §7.1): «Ольга прислала договор — письмо
// пришло вчера». It goes to the writer after the person's message, as <answer>; what it may do is the «пересказ
// ассистента» row of the table of voices (`memory-evidence.ts`): settle an open commitment as «ждёт проверки», nothing
// else. Here — only which answer counts. No database here.

/** Longer answers are cut: what a tool showed is said in the first lines. */
export const RETOLD_MAX = 2000;

/** The chat's tools that read something outside: the mail, the web. Every MCP tool is a reading one too. */
const READING_TOOLS = new Set([
  "email_search",
  "email_read",
  "web_search",
  "web_fetch",
]);

/** What of a message part this needs: its type, the text, a tool's name and state. */
export interface AnswerPart {
  type: string;
  text?: string;
  toolName?: string;
  state?: string;
}

const readsOutside = (part: AnswerPart) => {
  if (part.state !== "output-available") {
    return false;
  }
  if (part.type === "dynamic-tool") {
    return true;
  }
  return part.type.startsWith("tool-") && READING_TOOLS.has(part.type.slice(5));
};

/**
 * The answer's words, when it retells what a reading tool returned: the text after the first such result, cut at
 * `RETOLD_MAX`. Null — no tool read anything, or nothing was said after it (advice, a plan, the memory's own tools
 * and the widgets do not count).
 */
export const retoldOf = (parts: AnswerPart[]) => {
  const first = parts.findIndex(readsOutside);
  if (first === -1) {
    return null;
  }
  const text = parts
    .slice(first + 1)
    .flatMap((p) =>
      p.type === "text" && p.text?.trim() ? [p.text.trim()] : []
    )
    .join("\n")
    .trim();
  return text ? text.slice(0, RETOLD_MAX) : null;
};
