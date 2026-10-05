import {
  Body,
  Button,
  Container,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

import { C, FONT, LetterHead, MONO, Mark, PAGE_DARK, minutesOf } from "./kit";
import type { LetterData, LetterDef } from "./kit";

// «Контекст»: the letter says who asked — the account, the browser and system of the request, when, from which
// address — so a code nobody asked for is recognised at a glance, and says what to do then: nothing.

const T = {
  en: {
    account: "Account",
    at: "When",
    button: "Sign in with a link",
    device: "Device",
    heading: "Code to sign in to Metobe",
    ip: "Address",
    notYou: "Not you?",
    notYouText: (d: LetterData) =>
      `Do nothing: no one gets in without the code, and it stops working in ${minutesOf(d)}.`,
    preview: (d: LetterData) =>
      `${d.code} · requested${d.request.device ? ` from ${d.request.device}` : ""} at ${d.request.at}`,
    request: "The request",
    subject: (d: LetterData) => `${d.code} — Metobe sign-in code`,
    unknown: "Unknown browser",
    use: (d: LetterData) => `Type it on the sign-in page within ${minutesOf(d)}.`,
  },
  ru: {
    account: "Аккаунт",
    at: "Когда",
    button: "Войти по ссылке",
    device: "Устройство",
    heading: "Код для входа в Metobe",
    ip: "Адрес",
    notYou: "Это были не вы?",
    notYouText: (d: LetterData) =>
      `Ничего не делайте: без кода войти нельзя, а через ${minutesOf(d)} он перестанет действовать.`,
    preview: (d: LetterData) =>
      `${d.code} · запрос${d.request.device ? ` из ${d.request.device}` : ""}, ${d.request.at}`,
    request: "Запрос",
    subject: (d: LetterData) => `${d.code} — код для входа в Metobe`,
    unknown: "Неизвестный браузер",
    use: (d: LetterData) => `Введите его на странице входа в течение ${minutesOf(d)}.`,
  },
};

const DARK = `
${PAGE_DARK}
.card { background: #171717 !important; border-color: #262626 !important; }
.t { color: #fafafa !important; }
.m { color: #a3a3a3 !important; }
.code { color: #fafafa !important; }
.rows td { border-color: #262626 !important; }
.btn { background: #171717 !important; border-color: #404040 !important; color: #fafafa !important; }
.warn { background: #1c1917 !important; border-color: #3f2d12 !important; }
.warn-t { color: #fcd34d !important; }
`;

/** One line of the request: a label on the left, the value on the right. */
const Line = ({ label, value, last = false }: { label: string; value: string; last?: boolean }) => (
  <tr>
    <td
      className="m"
      style={{
        borderBottom: last ? "none" : `1px solid ${C.border}`,
        color: C.muted,
        fontSize: 13,
        padding: "10px 0",
        width: 120,
      }}
    >
      {label}
    </td>
    <td
      className="t"
      style={{
        borderBottom: last ? "none" : `1px solid ${C.border}`,
        color: C.text,
        fontSize: 13,
        padding: "10px 0",
        wordBreak: "break-all",
      }}
    >
      {value}
    </td>
  </tr>
);

const Letter = ({ d }: { d: LetterData }) => {
  const t = T[d.locale];
  const lines = [
    { label: t.account, value: d.email },
    { label: t.device, value: d.request.device ?? t.unknown },
    { label: t.at, value: d.request.at },
    ...(d.request.ip ? [{ label: t.ip, value: d.request.ip }] : []),
  ];
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
            maxWidth: 520,
            padding: "32px 32px 28px",
          }}
        >
          <Mark />
          <Heading
            as="h1"
            className="t"
            style={{ color: C.text, fontSize: 20, fontWeight: 600, lineHeight: "28px", margin: "24px 0 4px" }}
          >
            {t.heading}
          </Heading>
          <Text className="m" style={{ color: C.muted, fontSize: 14, lineHeight: "22px", margin: 0 }}>
            {t.use(d)}
          </Text>
          <Section style={{ margin: "20px 0 0" }}>
            <Text
              className="code"
              style={{
                color: C.text,
                display: "inline-block",
                fontFamily: MONO,
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: "6px",
                lineHeight: "40px",
                margin: "0 20px 0 0",
                verticalAlign: "middle",
              }}
            >
              {d.code}
            </Text>
            <Button
              className="btn"
              href={d.link}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontSize: 14,
                fontWeight: 500,
                padding: "9px 14px",
                verticalAlign: "middle",
              }}
            >
              {t.button}
            </Button>
          </Section>
          <Text
            className="m"
            style={{
              color: C.muted,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              margin: "28px 0 2px",
              textTransform: "uppercase",
            }}
          >
            {t.request}
          </Text>
          <table cellPadding={0} cellSpacing={0} className="rows" role="presentation" style={{ width: "100%" }}>
            <tbody>
              {lines.map((l, i) => (
                <Line key={l.label} label={l.label} last={i === lines.length - 1} value={l.value} />
              ))}
            </tbody>
          </table>
          <Section
            className="warn"
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 10,
              margin: "20px 0 0",
              padding: "12px 14px",
            }}
          >
            <Text className="warn-t" style={{ color: "#92400e", fontSize: 13, lineHeight: "20px", margin: 0 }}>
              <b>{t.notYou}</b> {t.notYouText(d)}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export const context: LetterDef = {
  Letter,
  preview: (d) => T[d.locale].preview(d),
  subject: (d) => T[d.locale].subject(d),
};
