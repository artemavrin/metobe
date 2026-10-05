import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseSmtpEnv } = await import("./smtp");

describe("an install's SMTP_URL as the mail settings keep it", () => {
  it("takes the login, the password and the sender", () => {
    expect(
      parseSmtpEnv(
        "smtps://robot%40kaminsoft.ru:p%40ss@smtp.yandex.ru",
        '"Kaminsoft" <robot@kaminsoft.ru>'
      )
    ).toEqual({
      address: "robot@kaminsoft.ru",
      name: "Kaminsoft",
      password: "p@ss",
      preset: "yandex",
      smtp: { host: "smtp.yandex.ru", port: 465, security: "ssl" },
      username: "robot@kaminsoft.ru",
    });
  });

  it("reads 587 as STARTTLS and 465 as SSL", () => {
    expect(parseSmtpEnv("smtp://u:p@mail.corp.ru").smtp).toEqual({
      host: "mail.corp.ru",
      port: 587,
      security: "starttls",
    });
    expect(parseSmtpEnv("smtp://u:p@mail.corp.ru:465").smtp.security).toBe(
      "ssl"
    );
  });

  it("keeps a relay without a login as it is", () => {
    expect(
      parseSmtpEnv("smtp://127.0.0.1:1025", "Metobe <no-reply@metobe.local>")
    ).toEqual({
      address: "no-reply@metobe.local",
      name: "Metobe",
      password: null,
      preset: "custom",
      smtp: { host: "127.0.0.1", port: 1025, security: "none" },
      username: null,
    });
  });

  it("sends from the login when there is no sender", () => {
    const mail = parseSmtpEnv("smtp://noreply%40corp.ru:x@mail.corp.ru:25");
    expect(mail.address).toBe("noreply@corp.ru");
    expect(mail.name).toBe("Metobe");
    expect(parseSmtpEnv("smtp://relay:25", "").address).toBe("no-reply@relay");
  });

  it("refuses anything that is not SMTP", () => {
    expect(() => parseSmtpEnv("https://mail.corp.ru")).toThrow(/smtp:\/\//u);
  });
});

// Against Mailpit from the dev stack (SMTP 1025, API 8025): a server that lets anyone in, as a relay inside the
// network. Where it does not run — CI — skipped.
const { problemOf, smtpTransport } = await import("./smtp");

const mailpitUp = await fetch("http://127.0.0.1:8025/api/v1/info")
  .then((r) => r.ok)
  .catch(() => false);

describe.skipIf(!mailpitUp)("a relay without a login (Mailpit)", () => {
  const relay = { host: "127.0.0.1", port: 1025, security: "none" as const };
  const at = { host: "127.0.0.1", servername: "localhost" };

  it("lets the service in and takes its letter", async () => {
    const subject = `relay ${crypto.randomUUID()}`;
    const transport = smtpTransport(relay, null, at);
    try {
      await transport.verify();
      await transport.sendMail({
        from: { address: "no-reply@metobe.local", name: "Metobe" },
        subject,
        text: "hi",
        to: "admin@metobe.local",
      });
    } finally {
      transport.close();
    }
    const found = (await fetch(
      `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`
    ).then((r) => r.json())) as {
      messages: { From: { Address: string; Name: string } }[];
    };
    expect(found.messages[0]?.From).toEqual({
      Address: "no-reply@metobe.local",
      Name: "Metobe",
    });
  });

  it("says a closed port does not answer", async () => {
    const transport = smtpTransport({ ...relay, port: 1999 }, null, at);
    const refused = await transport.verify().catch((error: unknown) => error);
    transport.close();
    expect(problemOf(refused)).toBe("unreachable");
  });
});
