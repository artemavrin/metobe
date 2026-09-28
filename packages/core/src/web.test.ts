import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Plain fetch instead of the proxy routes: the transport has its own tests.
vi.mock("./net", () => ({
  fetchFor: () => Promise.resolve(fetch),
  fetchThrough: () => Promise.resolve(fetch),
}));
// The address as the admin left it: the test server's.
vi.mock("./web-settings", () => ({
  searxngUrl: () => Promise.resolve(process.env.SEARXNG_URL),
}));

const { checkSearxng, fetchPage, searchWeb } = await import("./web");

/** Ё and ё in windows-1251; the rest of Cyrillic sits in one run from 0xC0. */
const YO: Record<number, number> = { 0x4_01: 0xa8, 0x4_51: 0xb8 };

/** The text in windows-1251, as older Russian sites serve it. */
const cp1251 = (text: string) =>
  Buffer.from(
    [...text].map((ch) => {
      const code = ch.codePointAt(0) ?? 63;
      if (code < 128) {
        return code;
      }
      if (code >= 0x4_10 && code <= 0x4_4f) {
        return code - 0x3_50;
      }
      return YO[code] ?? 63;
    })
  );

let hits = 0;
let busy = 0;
let busiest = 0;
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/search") {
    hits += 1;
    busy += 1;
    busiest = Math.max(busiest, busy);
    const q = url.searchParams.get("q") ?? "";
    setTimeout(() => {
      busy -= 1;
      res.setHeader("content-type", "application/json");
      if (q === "пусто") {
        res.end(
          JSON.stringify({
            results: [],
            unresponsive_engines: [["duckduckgo", "CAPTCHA"]],
          })
        );
        return;
      }
      res.end(
        JSON.stringify({
          results: [
            {
              content: "Курсы ЦБ",
              title: "ЦБ РФ",
              url: "https://www.cbr.ru/currency/?utm_source=x",
            },
            {
              content: "То же",
              title: "ЦБ РФ",
              url: "https://cbr.ru/currency",
            },
            { content: "", title: "Без ссылки" },
            {
              content: "Другое",
              publishedDate: "2026-09-27",
              title: "Банки.ру",
              url: "https://banki.ru/",
            },
          ],
        })
      );
    }, 30);
    return;
  }
  if (url.pathname === "/no-json/search") {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  if (url.pathname === "/page") {
    res.setHeader("content-type", "text/html; charset=windows-1251");
    const html =
      "<html><head><title>Налоговый вычет</title></head><body><nav>Меню Меню</nav><article><h1>Налоговый вычет</h1><p>Вычет за лечение оформляют через личный кабинет налогоплательщика. Нужны справка об оплате и договор.</p><p>Срок — три года после года расходов.</p></article></body></html>";
    res.end(cp1251(html));
    return;
  }
  res.setHeader("content-type", "application/pdf");
  res.end("%PDF-1.4");
});

let base = "";
beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SEARXNG_URL = base;
});
afterAll(() => {
  server.close();
});

describe("searching the web", () => {
  it("gives each page once, with its snippet, dropping results without a link", async () => {
    const out = await searchWeb({ query: "курс доллара" });
    expect(out.results.map((r) => r.url)).toEqual([
      "https://www.cbr.ru/currency/?utm_source=x",
      "https://banki.ru/",
    ]);
    expect(out.results[1]).toMatchObject({
      published: "2026-09-27",
      snippet: "Другое",
    });
  });

  it("answers the same question from its cache", async () => {
    const before = hits;
    await searchWeb({ query: "курс доллара" });
    await searchWeb({ query: "  КУРС ДОЛЛАРА " });
    expect(hits).toBe(before);
  });

  it("says why when there is nothing, and asks again next time", async () => {
    const out = await searchWeb({ query: "пусто" });
    expect(out.results).toEqual([]);
    expect(out.note).toContain("did not answer");
    const before = hits;
    await searchWeb({ query: "пусто" });
    expect(hits).toBe(before + 1);
  });

  it("asks SearXNG at most twice at once", async () => {
    busiest = 0;
    await Promise.all(
      ["a", "b", "c", "d", "e"].map((q) => searchWeb({ query: q }))
    );
    expect(busiest).toBe(2);
  });
});

describe("checking a SearXNG", () => {
  it("says it works, how fast and how much it found", async () => {
    const check = await checkSearxng(`${base}/`);
    expect(check).toMatchObject({ found: 4, ok: true });
    expect(check.ok && check.ms).toBeGreaterThanOrEqual(0);
  });

  it("names a SearXNG with JSON turned off", async () => {
    expect(await checkSearxng(`${base}/no-json`)).toMatchObject({
      ok: false,
      reason: "json-off",
    });
  });

  it("says why nothing answers there", async () => {
    const closed = createServer();
    closed.listen(0, "127.0.0.1");
    await once(closed, "listening");
    const { port } = closed.address() as AddressInfo;
    closed.close();
    await once(closed, "close");
    const check = await checkSearxng(`http://127.0.0.1:${port}`);
    expect(check).toMatchObject({ ok: false, reason: "unreachable" });
    expect(!check.ok && check.detail).toMatch(/ECONNREFUSED/u);
  });
});

describe("reading a page", () => {
  it("gives the main text as Markdown, decoded from the page's charset", async () => {
    const page = await fetchPage(`${base}/page`);
    expect(page.title).toBe("Налоговый вычет");
    expect(page.content).toContain("личный кабинет налогоплательщика");
    expect(page.content).not.toContain("Меню Меню");
    expect(page.truncated).toBe(false);
  });

  it("says it cannot read a PDF yet", async () => {
    await expect(fetchPage(`${base}/file.pdf`)).rejects.toThrow(
      "cannot read application/pdf yet"
    );
  });

  it("says why a page could not be opened, as a plain error the model can read", async () => {
    // A port nobody listens on any more: fetch fails with a TypeError whose reason is only in its cause.
    const closed = createServer();
    closed.listen(0, "127.0.0.1");
    await once(closed, "listening");
    const { port } = closed.address() as AddressInfo;
    closed.close();
    await once(closed, "close");
    const failure = await fetchPage(`http://127.0.0.1:${port}/`).catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(TypeError);
    expect(String(failure)).toMatch(/could not open the page: .*ECONNREFUSED/u);
  });

  it("reads only http and https", async () => {
    await expect(fetchPage("file:///etc/passwd")).rejects.toThrow(
      "only http and https"
    );
  });
});
