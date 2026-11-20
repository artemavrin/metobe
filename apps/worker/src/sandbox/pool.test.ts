import { describe, expect, it } from "vitest";

import { createDocker } from "./docker";
import type { Docker } from "./docker";
import { createPool, inWorkspace } from "./pool";
import type { PoolConfig } from "./pool";

const config: PoolConfig = {
  agingSeconds: 60,
  command: ["sleep", "infinity"],
  fileBytes: 1024 * 1024,
  idleSeconds: 300,
  image: "python:3.13-slim",
  leaseSeconds: 180,
  memoryMb: 1024,
  outputBytes: 4096,
  perUser: 1,
  runtime: "runc",
  total: 2,
  waitSeconds: { chat: 0.3, task: 0.3 },
};

const fakeDocker = () => {
  let n = 0;
  const removed: string[] = [];
  const running = new Set<string>();
  const docker = {
    create: () => {
      n += 1;
      return Promise.resolve({ Id: `c${n}` });
    },
    exec: () =>
      Promise.resolve({
        exitCode: 0,
        stderr: Buffer.alloc(0),
        stdout: Buffer.from("ok"),
        truncated: false,
      }),
    imageExists: () => Promise.resolve(true),
    info: () => Promise.resolve({ Runtimes: { runc: {} } }),
    inspect: (id: string) =>
      Promise.resolve({
        State: { OOMKilled: false, Running: running.has(id) },
      }),
    listByLabel: () => Promise.resolve([]),
    pull: () => Promise.resolve(),
    remove: (id: string) => {
      removed.push(id);
      running.delete(id);
      return Promise.resolve();
    },
    start: (id: string) => {
      running.add(id);
      return Promise.resolve(null);
    },
  } as unknown as Docker;
  return { docker, removed, running };
};

const chat = (key: string, userId = "u1") => ({
  class: "chat" as const,
  key,
  userId,
});

describe("pool", () => {
  it("gives a chat its box back after the answer, with its files", async () => {
    const { docker } = fakeDocker();
    const pool = createPool(docker, config);
    const first = await pool.acquire(chat("a"));
    expect(first.fresh).toBe(true);
    await pool.release(first.boxId, true);
    const again = await pool.acquire(chat("a"));
    expect(again).toEqual({ boxId: first.boxId, fresh: false });
  });

  it("drops a box at once when it is not kept (an edit, a task's run)", async () => {
    const { docker, removed } = fakeDocker();
    const pool = createPool(docker, config);
    const first = await pool.acquire(chat("a"));
    await pool.release(first.boxId, false);
    expect(removed).toEqual(["c1"]);
    const again = await pool.acquire(chat("a"));
    expect(again.fresh).toBe(true);
  });

  it("drops the person's idle box in another chat: one person, one box", async () => {
    const { docker, removed } = fakeDocker();
    const pool = createPool(docker, config);
    const a = await pool.acquire(chat("a"));
    await pool.release(a.boxId, true);
    await pool.acquire(chat("b"));
    expect(removed).toEqual(["c1"]);
  });

  it("refuses a person's second busy box after the wait", async () => {
    const { docker } = fakeDocker();
    const pool = createPool(docker, config);
    await pool.acquire(chat("a"));
    await expect(pool.acquire(chat("b"))).rejects.toMatchObject({
      status: 429,
    });
  });

  it("drops someone else's idle box when the pool is full, the oldest first", async () => {
    const { docker, removed } = fakeDocker();
    let clock = 0;
    const pool = createPool(docker, config, () => clock);
    const a = await pool.acquire(chat("a", "u1"));
    await pool.release(a.boxId, true);
    clock += 1000;
    const b = await pool.acquire(chat("b", "u2"));
    await pool.release(b.boxId, true);
    await pool.acquire(chat("c", "u3"));
    expect(removed).toEqual(["c1"]);
  });

  it("an idle box goes when its time is up", async () => {
    const { docker, removed } = fakeDocker();
    let clock = 0;
    const pool = createPool(docker, config, () => clock);
    const a = await pool.acquire(chat("a"));
    await pool.release(a.boxId, true);
    clock += 299_000;
    await pool.sweep();
    expect(removed).toEqual([]);
    clock += 2000;
    await pool.sweep();
    expect(removed).toEqual(["c1"]);
  });

  it("a busy box nobody touches goes after its lease (the app died mid-answer)", async () => {
    const { docker, removed } = fakeDocker();
    let clock = 0;
    const pool = createPool(docker, config, () => clock);
    const a = await pool.acquire(chat("a"));
    clock += 100_000;
    pool.heartbeat(a.boxId);
    clock += 100_000;
    await pool.sweep();
    expect(removed).toEqual([]);
    clock += 81_000;
    await pool.sweep();
    expect(removed).toEqual(["c1"]);
  });

  it("serves a waiting chat when a box frees up", async () => {
    const { docker } = fakeDocker();
    const pool = createPool(docker, {
      ...config,
      total: 1,
      waitSeconds: { chat: 5, task: 5 },
    });
    const a = await pool.acquire(chat("a", "u1"));
    const waiting = pool.acquire(chat("b", "u2"));
    await pool.release(a.boxId, false);
    const served = await waiting;
    expect(served.fresh).toBe(true);
  });

  it("forgets a chat's box on an edit", async () => {
    const { docker, removed } = fakeDocker();
    const pool = createPool(docker, config);
    const a = await pool.acquire(chat("a"));
    await pool.release(a.boxId, true);
    await pool.forget("a");
    expect(removed).toEqual(["c1"]);
  });

  it("keeps files inside the workspace", () => {
    expect(inWorkspace("out/report.xlsx")).toBe("/workspace/out/report.xlsx");
    expect(inWorkspace("/workspace/a.csv")).toBe("/workspace/a.csv");
    expect(inWorkspace("../etc/passwd")).toBeNull();
    expect(inWorkspace("/workspace/../etc/passwd")).toBeNull();
    expect(inWorkspace("/workspace")).toBeNull();
  });
});

// Against a real Docker: SANDBOX_TEST_SOCKET=$HOME/.docker/run/docker.sock [SANDBOX_TEST_RUNTIME=runsc] pnpm test
const socket = process.env.SANDBOX_TEST_SOCKET;
describe.runIf(socket)("pool on Docker", () => {
  const live: PoolConfig = {
    ...config,
    ...(process.env.SANDBOX_TEST_IMAGE
      ? { command: undefined, image: process.env.SANDBOX_TEST_IMAGE }
      : {}),
    runtime: process.env.SANDBOX_TEST_RUNTIME ?? "runc",
  };
  const pool = createPool(createDocker(socket ?? ""), live);

  it("runs code, moves files, keeps limits", { timeout: 120_000 }, async () => {
    const { boxId } = await pool.acquire(chat("live"));
    try {
      await pool.putFile(boxId, "in/data.csv", Buffer.from("a,b\n1,2\n3,4\n"));
      const sum = await pool.exec(
        boxId,
        "import csv\nrows = list(csv.DictReader(open('in/data.csv')))\nopen('out.txt', 'w').write(str(sum(int(r['b']) for r in rows)))\nprint(len(rows))"
      );
      expect(sum).toMatchObject({
        exitCode: 0,
        stdout: "2\n",
        timedOut: false,
      });
      const out = await pool.getFile(boxId, "out.txt");
      expect(out.toString()).toBe("6");
      expect(await pool.list(boxId)).toEqual(
        expect.arrayContaining([{ path: "/workspace/out.txt", size: 1 }])
      );

      const error = await pool.exec(boxId, "1/0");
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toContain("ZeroDivisionError");

      const loop = await pool.exec(boxId, "while True: pass", 2);
      expect(loop).toMatchObject({ boxLost: false, timedOut: true });

      const memory = await pool.exec(boxId, "x = bytearray(2 * 1024**3)");
      expect(memory).toMatchObject({
        boxLost: false,
        outOfMemory: true,
        timedOut: false,
      });

      const net = await pool.exec(
        boxId,
        "import socket\nsocket.create_connection(('1.1.1.1', 443), timeout=3)"
      );
      expect(net.stderr).toMatch(/unreachable|Network/u);

      const long = await pool.exec(
        boxId,
        "print('x' * 100_000)\nraise SystemExit('the end')"
      );
      expect(long.truncated).toBe(true);
      expect(long.stderr).toContain("the end");

      await expect(pool.getFile(boxId, "../etc/passwd")).rejects.toMatchObject({
        status: 400,
      });
      await expect(pool.getFile(boxId, "nothing.txt")).rejects.toMatchObject({
        status: 404,
      });
      const alive = await pool.exec(boxId, "print('alive')");
      expect(alive.stdout).toBe("alive\n");
    } finally {
      await pool.release(boxId, false);
    }
  });

  // Our image (docker/sandbox): the libraries import and write files under the box's limits.
  it.runIf(process.env.SANDBOX_TEST_IMAGE)(
    "the image's libraries work under the limits",
    { timeout: 120_000 },
    async () => {
      const { boxId } = await pool.acquire(chat("image"));
      try {
        const made = await pool.exec(
          boxId,
          [
            "import pandas as pd, matplotlib.pyplot as plt, docx, pptx, pypdf, openpyxl, xlsxwriter",
            "from reportlab.pdfgen import canvas",
            "df = pd.DataFrame({'месяц': ['янв', 'фев'], 'выручка': [10, 12]})",
            "df.to_excel('t.xlsx', index=False)",
            "ax = df.plot(x='месяц', y='выручка', title='Выручка'); plt.savefig('c.png')",
            "d = docx.Document(); d.add_paragraph('Привет'); d.save('d.docx')",
            "pptx.Presentation().save('s.pptx')",
            "c = canvas.Canvas('r.pdf'); c.drawString(10, 10, 'hi'); c.save()",
            "print(pd.read_excel('t.xlsx')['выручка'].sum())",
          ].join("\n")
        );
        expect(made.stderr).not.toMatch(/Error/u);
        expect(made.stdout).toBe("22\n");
        // A scanned page: a picture of text in a PDF, drawn by poppler and read by tesseract (read_attachment's OCR).
        const scan = await pool.exec(
          boxId,
          [
            "from PIL import Image, ImageDraw, ImageFont",
            "import subprocess",
            "img = Image.new('RGB', (1400, 400), 'white')",
            "font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 64)",
            "ImageDraw.Draw(img).text((40, 150), 'Счёт на оплату 4512', fill='black', font=font)",
            "img.save('scan.pdf')",
            "subprocess.run(['pdftoppm', '-f', '1', '-l', '1', '-r', '200', '-png', 'scan.pdf', '/tmp/p'], check=True)",
            "r = subprocess.run(['tesseract', '/tmp/p-1.png', '-', '-l', 'rus+eng'], capture_output=True, text=True)",
            "print(r.stdout)",
          ].join("\n")
        );
        expect(scan.stdout).toContain("4512");
        expect(scan.stdout.toLowerCase()).toContain("оплату");
        const listed = await pool.list(boxId);
        const names = listed.map((f) => f.path);
        expect(names).toEqual(
          expect.arrayContaining([
            "/workspace/t.xlsx",
            "/workspace/c.png",
            "/workspace/d.docx",
            "/workspace/s.pptx",
            "/workspace/r.pdf",
          ])
        );
      } finally {
        await pool.release(boxId, false);
      }
    }
  );
});
