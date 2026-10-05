import {
  Body,
  Button,
  Container,
  Heading,
  Html,
  Preview,
  Text,
} from "react-email";

import { C, FONT, LetterHead, Mark, renderLetter } from "./kit";

// A letter that takes someone in (D17): who invites, to what, one button with the link, how long it works, and what to
// do when it was not expected. The words come translated.

export interface InviteLetterProps {
  locale: string;
  /** The line a client shows after the subject in the list. */
  preview: string;
  heading: string;
  /** Who invites and in what role. */
  text: string;
  button: { href: string; label: string };
  ttl: string;
  ignore: string;
}

const DARK = `
.card { background: #171717 !important; border-color: #262626 !important; }
.t { color: #fafafa !important; }
.m { color: #a3a3a3 !important; }
`;

const InviteLetter = ({
  locale,
  preview,
  heading,
  text,
  button,
  ttl,
  ignore,
}: InviteLetterProps) => (
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
            margin: "28px 0 12px",
          }}
        >
          {heading}
        </Heading>
        <Text
          className="t"
          style={{
            color: C.text,
            fontSize: 15,
            lineHeight: "24px",
            margin: 0,
          }}
        >
          {text}
        </Text>
        <Button
          href={button.href}
          style={{
            background: C.blue,
            borderRadius: 10,
            color: C.white,
            fontSize: 15,
            fontWeight: 600,
            margin: "24px 0 12px",
            padding: "14px 28px",
          }}
        >
          {button.label}
        </Button>
        <Text
          className="m"
          style={{
            color: C.muted,
            fontSize: 13,
            lineHeight: "20px",
            margin: 0,
          }}
        >
          {ttl}
        </Text>
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
export const inviteLetter = (props: InviteLetterProps) =>
  renderLetter(<InviteLetter {...props} />);
