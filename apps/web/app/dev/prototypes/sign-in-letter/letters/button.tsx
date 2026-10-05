import {
  Body,
  Button,
  Container,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

import { C, FONT, LetterHead, MONO, Mark, PAGE_DARK, minutesOf } from "./kit";
import type { LetterData, LetterDef } from "./kit";

// «Кнопка»: one action — the button signs in on the device the letter is open on. The code waits below for the
// other case, smaller, under a question that says when it is needed.

const T = {
  en: {
    button: "Sign in to Metobe",
    codeAsk: "Opened this on your phone but signing in on a computer? Type the code:",
    footer: (d: LetterData) =>
      `You asked to sign in to Metobe at ${d.host}. Not you? Ignore this letter.`,
    heading: "Sign in to Metobe",
    hello: (d: LetterData) => (d.name ? `Hello, ${d.name}!` : "Hello!"),
    intro: "Press the button to sign in on this device.",
    preview: (d: LetterData) =>
      `Press “Sign in” — the link works for ${minutesOf(d)}. Code: ${d.code}`,
    subject: () => "Sign in to Metobe",
    ttl: (d: LetterData) => `The link works for ${minutesOf(d)}, once.`,
  },
  ru: {
    button: "Войти в Metobe",
    codeAsk: "Открыли письмо на телефоне, а входите с компьютера? Введите код:",
    footer: (d: LetterData) =>
      `Вы запросили вход в Metobe на ${d.host}. Если это были не вы, просто проигнорируйте письмо.`,
    heading: "Вход в Metobe",
    hello: (d: LetterData) => (d.name ? `Здравствуйте, ${d.name}!` : "Здравствуйте!"),
    intro: "Нажмите кнопку, чтобы войти на этом устройстве.",
    preview: (d: LetterData) =>
      `Нажмите «Войти» — ссылка действует ${minutesOf(d)}. Код: ${d.code}`,
    subject: () => "Вход в Metobe",
    ttl: (d: LetterData) => `Ссылка действует ${minutesOf(d)} и сработает один раз.`,
  },
};

const DARK = `
${PAGE_DARK}
.card { background: #171717 !important; border-color: #262626 !important; }
.t { color: #fafafa !important; }
.m { color: #a3a3a3 !important; }
.pill { background: #262626 !important; border-color: #333333 !important; color: #fafafa !important; }
.hr { border-color: #262626 !important; }
`;

const Letter = ({ d }: { d: LetterData }) => {
  const t = T[d.locale];
  return (
    <Html lang={d.locale}>
      <LetterHead dark={DARK} />
      <Preview>{t.preview(d)}</Preview>
      <Body
        className="page"
        style={{ background: C.page, fontFamily: FONT, margin: 0, padding: "40px 12px" }}
      >
        <Container style={{ maxWidth: 520 }}>
          <Section style={{ padding: "0 4px 20px" }}>
            <Mark />
          </Section>
          <Section
            className="card"
            style={{
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "40px 40px 36px",
            }}
          >
            <Heading
              as="h1"
              className="t"
              style={{
                color: C.text,
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: "32px",
                margin: "0 0 12px",
              }}
            >
              {t.heading}
            </Heading>
            <Text className="t" style={{ color: C.text, fontSize: 15, lineHeight: "24px", margin: 0 }}>
              {t.hello(d)} {t.intro}
            </Text>
            <Button
              href={d.link}
              style={{
                background: C.blue,
                borderRadius: 10,
                color: C.white,
                fontSize: 15,
                fontWeight: 600,
                margin: "28px 0 12px",
                padding: "14px 28px",
              }}
            >
              {t.button}
            </Button>
            <Text className="m" style={{ color: C.muted, fontSize: 13, lineHeight: "20px", margin: 0 }}>
              {t.ttl(d)}
            </Text>
            <Hr className="hr" style={{ borderColor: C.border, margin: "28px 0 20px" }} />
            <Text className="m" style={{ color: C.muted, fontSize: 13, lineHeight: "20px", margin: "0 0 10px" }}>
              {t.codeAsk}
            </Text>
            <Text
              className="pill"
              style={{
                background: C.page,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                display: "inline-block",
                fontFamily: MONO,
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "4px",
                lineHeight: "24px",
                margin: 0,
                padding: "8px 10px 8px 14px",
              }}
            >
              {d.code}
            </Text>
          </Section>
          <Text
            className="m"
            style={{ color: C.muted, fontSize: 12, lineHeight: "18px", margin: "20px 4px 0" }}
          >
            {t.footer(d)}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const button: LetterDef = {
  Letter,
  preview: (d) => T[d.locale].preview(d),
  subject: (d) => T[d.locale].subject(),
};
