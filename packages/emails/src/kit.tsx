import type { ReactElement } from "react";
import { Head, render } from "react-email";

// What every letter of the service stands on: the product's colours as mail clients take them (hex, no variables),
// the system fonts, the mark, the head with a dark scheme for the clients that honour prefers-color-scheme (Apple
// Mail, iOS), and the render into HTML with a text part that reads as typed.

export const C = {
  blue: "#1d4ed8",
  border: "#e5e5e5",
  muted: "#737373",
  page: "#f5f5f5",
  text: "#0a0a0a",
  white: "#ffffff",
};

export const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const MONO =
  "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/**
 * The dark scheme's page: React Email's Body repeats its background on the cell inside it, for Gmail; a card's padding
 * likewise sits on the cell inside its table.
 */
const BASE_CSS = `@media (max-width: 480px) { .card > tbody > tr > td { padding-left: 22px !important; padding-right: 22px !important; } }
@media (prefers-color-scheme: dark) { body, .page, .page > table > tbody > tr > td { background: #0a0a0a !important; } %DARK% }`;

/** Both schemes allowed; `dark` — the letter's own rules for a dark client. */
export const LetterHead = ({ dark }: { dark: string }) => (
  <Head>
    <meta content="light dark" name="color-scheme" />
    <meta content="light dark" name="supported-color-schemes" />
    <style>{BASE_CSS.replace("%DARK%", dark)}</style>
  </Head>
);

/** The mark and the name, as the sign-in page shows them; the initial stays out of the text part. */
export const Mark = () => (
  <table cellPadding={0} cellSpacing={0} role="presentation">
    <tbody>
      <tr>
        <td
          data-skip-in-text="true"
          style={{
            background: C.blue,
            borderRadius: 8,
            color: C.white,
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 600,
            height: 28,
            lineHeight: "28px",
            textAlign: "center",
            width: 28,
          }}
        >
          M
        </td>
        <td
          className="t"
          style={{
            color: C.text,
            fontFamily: FONT,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            paddingLeft: 10,
          }}
        >
          Metobe
        </td>
      </tr>
    </tbody>
  </table>
);

/** The text part as a person would type it: headings as they are, no rules drawn in dashes. */
const TEXT = {
  selectors: [
    { options: { uppercase: false }, selector: "h1" },
    { format: "skip", selector: "hr" },
  ],
};

/** A letter as it goes: HTML for the clients that draw it, and the text part for the rest. */
export const renderLetter = async (letter: ReactElement) => {
  const [html, text] = await Promise.all([
    render(letter),
    render(letter, { htmlToTextOptions: TEXT, plainText: true }),
  ]);
  return { html, text };
};
