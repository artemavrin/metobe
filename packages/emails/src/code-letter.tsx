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

import { C, FONT, LetterHead, MONO, Mark, renderLetter } from "./kit";

// A letter whose point is a code (prototype «Код», /dev/prototypes/sign-in-letter): read on a phone, typed on a
// laptop — the case the code exists for (D17). The code stands large under the heading, the link for the same device
// is one quiet line under it, and the last line says what to do when it was not you. The words come translated.

export interface CodeLetterProps {
  locale: string;
  /** The line a client shows after the subject in the list. */
  preview: string;
  heading: string;
  code: string;
  /** Where to type it and how long it works. */
  use: string;
  /** Signing in on the device the letter is open on; null — the code is the only way. */
  link: { href: string; label: string } | null;
  ignore: string;
}

const DARK = `
.card { background: #171717 !important; border-color: #262626 !important; }
.t { color: #fafafa !important; }
.m { color: #a3a3a3 !important; }
.code { background: #262626 !important; }
.hr { border-color: #262626 !important; }
.a { color: #93c5fd !important; }
`;

const CodeLetter = ({
  locale,
  preview,
  heading,
  code,
  use,
  link,
  ignore,
}: CodeLetterProps) => (
  <Html lang={locale}>
    <LetterHead dark={DARK} />
    <Preview>{preview}</Preview>
    <Body
      className="page"
      style={{
        background: C.page,
        fontFamily: FONT,
        margin: 0,
        padding: "32px 12px",
      }}
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
          {heading}
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
            {code}
          </Text>
        </Section>
        <Text
          className="m"
          style={{
            color: C.muted,
            fontSize: 14,
            lineHeight: "22px",
            margin: "16px 0 0",
          }}
        >
          {use}
        </Text>
        {link && (
          <>
            <Hr
              className="hr"
              style={{ borderColor: C.border, margin: "24px 0" }}
            />
            <Text style={{ fontSize: 14, lineHeight: "22px", margin: 0 }}>
              <Link
                className="a"
                href={link.href}
                style={{ color: C.blue, textDecoration: "none" }}
              >
                {link.label} →
              </Link>
            </Text>
          </>
        )}
        <Text
          className="m"
          style={{
            color: C.muted,
            fontSize: 12,
            lineHeight: "18px",
            margin: "20px 0 0",
          }}
        >
          {ignore}
        </Text>
      </Container>
    </Body>
  </Html>
);

/** The letter's HTML and text part. */
export const codeLetter = (props: CodeLetterProps) =>
  renderLetter(<CodeLetter {...props} />);
