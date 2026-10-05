import { Body, Container, Html, Link, Preview, Text } from "react-email";

import { FONT, LetterHead, minutesOf } from "./kit";
import type { LetterData, LetterDef } from "./kit";

// «Записка»: a letter as a person would write it — no card, no colours, no mark; the client's own type and theme.
// Looks the same in Outlook, in Gmail's dark mode and as plain text, and has nothing a spam filter frowns at.

const T = {
  en: {
    code: "Your Metobe sign-in code:",
    hello: (d: LetterData) => (d.name ? `Hello, ${d.name}!` : "Hello!"),
    ignore: "If you were not signing in, there is nothing to do.",
    or: "Type it on the sign-in page, or just open the link:",
    preview: (d: LetterData) => `Sign-in code: ${d.code}`,
    sign: "— Metobe",
    subject: (d: LetterData) => `Metobe sign-in code: ${d.code}`,
    ttl: (d: LetterData) => `The code and the link work for ${minutesOf(d)}.`,
  },
  ru: {
    code: "Код для входа в Metobe:",
    hello: (d: LetterData) => (d.name ? `Здравствуйте, ${d.name}!` : "Здравствуйте!"),
    ignore: "Если вы не пытались войти, ничего делать не нужно.",
    or: "Введите его на странице входа или просто откройте ссылку:",
    preview: (d: LetterData) => `Код для входа: ${d.code}`,
    sign: "— Metobe",
    subject: (d: LetterData) => `Код для входа в Metobe: ${d.code}`,
    ttl: (d: LetterData) => `Код и ссылка действуют ${minutesOf(d)}.`,
  },
};

// Nothing to redraw: no backgrounds are set, so a dark client keeps its own.
const DARK = "";

const P = { fontSize: 15, lineHeight: "24px", margin: "0 0 16px" };

const Letter = ({ d }: { d: LetterData }) => {
  const t = T[d.locale];
  return (
    <Html lang={d.locale}>
      <LetterHead dark={DARK} />
      <Preview>{t.preview(d)}</Preview>
      <Body style={{ fontFamily: FONT, margin: 0, padding: "24px 16px" }}>
        <Container style={{ margin: 0, maxWidth: 560 }}>
          <Text style={P}>{t.hello(d)}</Text>
          <Text style={P}>
            {t.code} <b style={{ fontSize: 17, letterSpacing: "1px" }}>{d.code}</b>
          </Text>
          <Text style={{ ...P, margin: "0 0 4px" }}>{t.or}</Text>
          <Text style={{ ...P, wordBreak: "break-all" }}>
            <Link href={d.link} style={{ textDecoration: "underline" }}>
              {d.link}
            </Link>
          </Text>
          <Text style={P}>
            {t.ttl(d)} {t.ignore}
          </Text>
          <Text style={{ ...P, margin: 0 }}>{t.sign}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const note: LetterDef = {
  Letter,
  preview: (d) => T[d.locale].preview(d),
  subject: (d) => T[d.locale].subject(d),
};
