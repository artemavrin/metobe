import { once } from "node:events";
import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it, vi } from "vitest";

// Against a real mail server: GreenMail (docker `greenmail/standalone`, plain SMTP on 3025 and IMAP on 3143, user
// anna@example.com). Where it does not run — CI — these are skipped; the network layer has its own tests.
vi.mock("server-only", () => ({}));
// Straight to the local server: the SSRF check would rightly refuse 127.0.0.1.
vi.mock("./net", () => ({
  mailEndpoint: () =>
    Promise.resolve({ host: "127.0.0.1", servername: "localhost" }),
}));

const {
  MailError,
  letterHtml,
  readVia,
  searchVia,
  sendVia,
  verifyMailServers,
} = await import("./mailboxes");

/** Whether GreenMail's IMAP answers here. */
const reachable = async () => {
  const socket = connect(3143, "127.0.0.1");
  try {
    await once(socket, "connect");
    return true;
  } catch {
    return false;
  } finally {
    socket.destroy();
  }
};
const up = await reachable();

const smtp = { host: "localhost", port: 3025, security: "none" as const };
const imap = { host: "localhost", port: 3143, security: "none" as const };
const auth = { password: "Correct-Horse-9", username: "anna@example.com" };

describe.skipIf(!up)("a mailbox against a real mail server", () => {
  it("takes the right login on both servers", async () => {
    await expect(verifyMailServers(smtp, imap, auth)).resolves.toBeUndefined();
  });

  it("says a wrong password is the login's fault", async () => {
    const refused = await verifyMailServers(smtp, imap, {
      ...auth,
      password: "wrong",
    }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(MailError);
    expect(refused).toMatchObject({ problem: "auth" });
  });

  it("says a closed port does not answer", async () => {
    const closed = await verifyMailServers(
      { ...smtp, port: 3999 },
      imap,
      auth
    ).catch((error: unknown) => error);
    expect(closed).toMatchObject({ problem: "unreachable", server: "smtp" });
  });

  it("sends a letter, finds it by its words and reads it", async () => {
    // A Latin mark to search by: GreenMail does not search UTF-8 text (real servers do).
    const mark = `svodka-${Date.now()}`;
    const subject = `Сводка ${mark}`;
    await sendVia(smtp, auth, "anna@example.com", {
      subject,
      text: "Отгрузки за неделю: 14 паллет СТ-1180.",
      to: ["anna@example.com"],
    });
    let found = await searchVia(imap, auth, { text: mark });
    // The server files it a moment later.
    for (let i = 0; i < 10 && found.total === 0; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- waiting for the letter to arrive
      await sleep(200);
      // oxlint-disable-next-line no-await-in-loop -- as above
      found = await searchVia(imap, auth, { text: mark });
    }
    expect(found.total).toBe(1);
    expect(found.letters[0]).toMatchObject({ subject, unread: true });
    const letter = await readVia(imap, auth, {
      uid: found.letters[0]?.uid ?? 0,
    });
    expect(letter).toMatchObject({ subject, truncated: false });
    expect(letter.text).toContain("14 паллет");
  }, 20_000);
});

describe("a letter's HTML", () => {
  it("is made from the model's Markdown", () => {
    const html = letterHtml(
      "Коллеги,\n\n**Дни рождения** в октябре:\n\n- Анна — 3-го\n- Олег — 17-го"
    );
    expect(html).toContain("<strong>Дни рождения</strong>");
    expect(html).toContain("<li>Анна — 3-го</li>");
  });

  it("shows raw HTML in the model's words as text", () => {
    const html = letterHtml('<img src="https://evil.example/x.png">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
