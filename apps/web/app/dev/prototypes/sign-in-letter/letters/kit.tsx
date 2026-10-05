import { Head } from "react-email";
import type { ReactNode } from "react";

// What every variant of the sign-in letter stands on: the data the letter really has when it is sent (the code, the
// link, who asked and from where), the product's colours as mail clients take them (hex, no variables), the system
// font stack, the mark, and a dark scheme for the clients that honour prefers-color-scheme (Apple Mail, iOS).

export type Locale = "ru" | "en";

export interface LetterData {
  locale: Locale;
  /** The recipient's first name; null — an account without one yet. */
  name: string | null;
  email: string;
  code: string;
  link: string;
  /** Where the service answers, as people read it: `metobe.kaminsoft.ru`. */
  host: string;
  minutes: number;
  /** Who asked for the code: the browser and system of the request, its address (when worth showing), when. */
  request: { device: string | null; ip: string | null; at: string };
}

export interface LetterDef {
  subject: (d: LetterData) => string;
  /** The line a client shows after the subject in the list. */
  preview: (d: LetterData) => string;
  Letter: (props: { d: LetterData }) => ReactNode;
}

export const C = {
  blue: "#1d4ed8",
  blueSoft: "#eff6ff",
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

/** The page's dark background: React Email's Body repeats its background on the cell inside it, for Gmail. */
export const PAGE_DARK =
  "body, .page, .page > table > tbody > tr > td { background: #0a0a0a !important; }";

/**
 * The head of every variant: both schemes allowed, the dark one drawn by classes where a client honours it, and a
 * card's sides narrower on a phone (React Email puts a Section's and a Container's padding on the cell inside).
 */
export const LetterHead = ({ dark }: { dark: string }) => (
  <Head>
    <meta content="light dark" name="color-scheme" />
    <meta content="light dark" name="supported-color-schemes" />
    <style>{`@media (max-width: 480px) { .card > tbody > tr > td { padding-left: 22px !important; padding-right: 22px !important; } }
@media (prefers-color-scheme: dark) {${dark}}`}</style>
  </Head>
);

/** The mark and the name, as the sign-in page shows them: the brand square with the initial. */
export const Mark = ({ size = 28 }: { size?: number }) => (
  <table cellPadding={0} cellSpacing={0} role="presentation">
    <tbody>
      <tr>
        <td
          className="mark"
          data-skip-in-text="true"
          style={{
            background: C.blue,
            borderRadius: Math.round(size * 0.28),
            color: C.white,
            fontFamily: FONT,
            fontSize: Math.round(size * 0.46),
            fontWeight: 600,
            height: size,
            lineHeight: `${size}px`,
            textAlign: "center",
            width: size,
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

/** «10 минут» / «10 minutes». */
export const minutesOf = (d: LetterData) =>
  d.locale === "ru" ? `${d.minutes} минут` : `${d.minutes} minutes`;
