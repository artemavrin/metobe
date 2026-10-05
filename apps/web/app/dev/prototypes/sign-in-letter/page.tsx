import { randomInt } from "node:crypto";

import { buildLoginLink } from "@metobe/core/login-link";
import { getServiceMail } from "@metobe/core/mail";
import { headers } from "next/headers";
import { render } from "react-email";

import { deviceOf, shownIp } from "@/lib/device";
import { getPrefs } from "@/lib/prefs";
import { getSettingsViewer } from "@/lib/settings-access";

import { button } from "./letters/button";
import { code } from "./letters/code";
import { context } from "./letters/context";
import type { LetterData, LetterDef, Locale } from "./letters/kit";
import { note } from "./letters/note";
import { Prototype } from "./prototype";
import type { Inbox, Rendered, VariantId } from "./prototype";

// «Письмо со входом» (React Email): the letter the sign-in code comes in. Four answers — the code first, the button
// first, a plain note, the request in context — on the real data of this request: your name and address, the
// service's sender from /settings/mail, a fresh code with its real link, your browser, now in your time zone. Each is
// rendered by React Email on the server, shown in a mail client's reading pane, in both languages and as text.

const LETTERS: Record<VariantId, LetterDef> = { button, code, context, note };
const LOCALES: Locale[] = ["ru", "en"];
/** The text part as a person would type it: headings as they are, no rules drawn in dashes. */
const TEXT = {
  selectors: [
    { options: { uppercase: false }, selector: "h1" },
    { format: "skip", selector: "hr" },
  ],
};

/** The user's last letters in the dev Mailpit, for the client's list around ours; nothing when it does not run. */
const inboxOf = async (email: string): Promise<Inbox> => {
  try {
    const r = await fetch(
      `http://127.0.0.1:8025/api/v1/search?limit=6&query=${encodeURIComponent(`to:${email}`)}`,
      { cache: "no-store" }
    );
    const body = (await r.json()) as {
      messages: { Created: string; From: { Name: string; Address: string }; Snippet: string; Subject: string }[];
    };
    return body.messages.map((m) => ({
      at: m.Created,
      from: m.From.Name || m.From.Address,
      snippet: m.Snippet,
      subject: m.Subject,
    }));
  } catch {
    return [];
  }
};

const SignInLetterPage = async () => {
  const [{ user }, prefs, mail, h] = await Promise.all([getSettingsViewer(), getPrefs(), getServiceMail(), headers()]);
  if (!user) {
    return <p className="p-8">Войдите, чтобы увидеть письмо на своих данных.</p>;
  }
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { browser, system } = deviceOf(h.get("user-agent"));
  const ip = shownIp(h.get("x-forwarded-for")?.split(",")[0]);
  const now = new Date();
  const timeZone = prefs.timeZone ?? undefined;
  const dataOf = (locale: Locale): LetterData => ({
    code: otp,
    email: user.email,
    host: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").host,
    link: buildLoginLink(user.email, otp),
    locale,
    minutes: 10,
    name: user.name.trim().split(/\s+/u)[0] || null,
    request: {
      at: new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "long",
        timeZone,
      }).format(now),
      device: browser && system ? `${browser} ${locale === "ru" ? "на" : "on"} ${system}` : (browser ?? system),
      ip,
    },
  });
  const rendered = {} as Rendered;
  await Promise.all(
    (Object.keys(LETTERS) as VariantId[]).flatMap((id) =>
      LOCALES.map(async (locale) => {
        const def = LETTERS[id];
        const d = dataOf(locale);
        const { Letter } = def;
        const [html, text] = await Promise.all([render(<Letter d={d} />), render(<Letter d={d} />, { htmlToTextOptions: TEXT, plainText: true })]);
        rendered[id] ??= {} as Rendered[VariantId];
        rendered[id][locale] = { html, preview: def.preview(d), subject: def.subject(d), text };
      })
    )
  );
  return (
    <Prototype
      inbox={await inboxOf(user.email)}
      letters={rendered}
      sender={{ address: mail?.address ?? "no-reply@metobe.local", name: mail?.name ?? "Metobe" }}
      sentAt={now.toISOString()}
      timeZone={timeZone ?? null}
    />
  );
};

export default SignInLetterPage;
