import {
  Body,
  Container,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

import { C, FONT, LetterHead, MONO, Mark, PAGE_DARK, minutesOf } from "./kit";
import type { LetterData, LetterDef } from "./kit";

// «Код»: the code is the letter. Read on a phone, typed on a laptop — the case the code exists for (D17); the link
// stays one quiet line under it for the same device.

const T = {
  en: {
    heading: "Your sign-in code",
    ignore:
      "If you did not ask for a code, ignore this letter: no one gets in without it.",
    link: "Or sign in with a link on this device",
    preview: (d: LetterData) =>
      `${d.code} — your Metobe code. It works for ${minutesOf(d)}.`,
    subject: (d: LetterData) => `${d.code} — your Metobe sign-in code`,
    use: (d: LetterData) =>
      `Type it on the sign-in page. It works for ${minutesOf(d)} and only once.`,
  },
  ru: {
    heading: "Ваш код для входа",
    ignore:
      "Если вы не запрашивали код, просто проигнорируйте письмо: без него в аккаунт не войти.",
    link: "Или войдите по ссылке на этом устройстве",
    preview: (d: LetterData) =>
      `${d.code} — код для входа в Metobe. Действует ${minutesOf(d)}.`,
    subject: (d: LetterData) => `${d.code} — код для входа в Metobe`,
    use: (d: LetterData) =>
      `Введите его на странице входа. Код действует ${minutesOf(d)} и сработает один раз.`,
  },
};

const DARK = `
${PAGE_DARK}
.card { background: #171717 !important; border-color: #262626 !important; }
.t { color: #fafafa !important; }
.m { color: #a3a3a3 !important; }
.code { background: #262626 !important; color: #fafafa !important; }
.hr { border-color: #262626 !important; }
.a { color: #93c5fd !important; }
`;

const Letter = ({ d }: { d: LetterData }) => {
  const t = T[d.locale];
  return (
    <Html lang={d.locale}>
      <LetterHead dark={DARK} />
      <Preview>{t.preview(d)}</Preview>
      <Body
        className="page"
        style={{ background: C.page, fontFamily: FONT, margin: 0, padding: "32px 12px" }}
      >
        <Container
          className="card"
          style={{
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            maxWidth: 480,
            padding: "36px 36px 28px",
          }}
        >
          <Mark />
          <Heading
            as="h1"
            className="t"
            style={{
              color: C.text,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: "30px",
              margin: "28px 0 16px",
            }}
          >
            {t.heading}
          </Heading>
          <Section
            className="code"
            style={{
              background: C.page,
              borderRadius: 12,
              padding: "22px 0",
              textAlign: "center",
            }}
          >
            <Text
              className="t"
              style={{
                color: C.text,
                fontFamily: MONO,
                fontSize: 40,
                fontWeight: 600,
                // Spaced, not split: a space inside the code would break pasting it.
                letterSpacing: "10px",
                lineHeight: "44px",
                margin: 0,
                paddingLeft: 10,
              }}
            >
              {d.code}
            </Text>
          </Section>
          <Text
            className="m"
            style={{ color: C.muted, fontSize: 14, lineHeight: "22px", margin: "16px 0 0" }}
          >
            {t.use(d)}
          </Text>
          <Hr className="hr" style={{ borderColor: C.border, margin: "24px 0" }} />
          <Text style={{ fontSize: 14, lineHeight: "22px", margin: 0 }}>
            <Link className="a" href={d.link} style={{ color: C.blue, textDecoration: "none" }}>
              {t.link} →
            </Link>
          </Text>
          <Text
            className="m"
            style={{ color: C.muted, fontSize: 12, lineHeight: "18px", margin: "20px 0 0" }}
          >
            {t.ignore}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const code: LetterDef = {
  Letter,
  preview: (d) => T[d.locale].preview(d),
  subject: (d) => T[d.locale].subject(d),
};
