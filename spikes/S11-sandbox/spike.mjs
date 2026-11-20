// S11: a hardened container per chat through the Docker API — runc vs gVisor (runsc).
// DOCKER_SOCKET=/path/to/docker.sock RUNTIME=runc|runsc IMAGE=python:3.13-slim node spike.mjs
import { PassThrough } from "node:stream";

import Docker from "dockerode";
import tar from "tar-stream";

const socketPath = process.env.DOCKER_SOCKET ?? "/var/run/docker.sock";
const runtime = process.env.RUNTIME ?? "runc";
const image = process.env.IMAGE ?? "python:3.13-slim";
const docker = new Docker({ socketPath });

const results = [];
const note = (name, ok, detail = "") => {
  results.push({ detail, name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const ms = (start) => `${Math.round(performance.now() - start)} ms`;

const pull = async () => {
  try {
    await docker.getImage(image).inspect();
  } catch {
    const stream = await docker.pull(image);
    await new Promise((resolve, reject) =>
      docker.modem.followProgress(stream, (error) => (error ? reject(error) : resolve()))
    );
  }
};

const create = () =>
  docker.createContainer({
    Cmd: ["sleep", "infinity"],
    HostConfig: {
      CapDrop: ["ALL"],
      Init: true,
      Memory: 512 * 1024 * 1024,
      MemorySwap: 512 * 1024 * 1024,
      NanoCpus: 1e9,
      NetworkMode: "none",
      PidsLimit: 128,
      ReadonlyRootfs: true,
      Runtime: runtime,
      SecurityOpt: ["no-new-privileges"],
      Tmpfs: {
        "/tmp": "rw,nosuid,nodev,size=64m,uid=1000,gid=1000",
        "/workspace": "rw,nosuid,nodev,size=256m,uid=1000,gid=1000",
      },
    },
    Image: image,
    Labels: { "metobe.sandbox": "s11", "metobe.owner": String(process.pid) },
    User: "1000:1000",
    WorkingDir: "/workspace",
  });

/** Runs argv in the container, stdin optional; output collected, killed after `timeout` seconds by `timeout` inside. */
const run = async (container, argv, { stdin, timeout = 10 } = {}) => {
  const exec = await container.exec({
    AttachStderr: true,
    AttachStdin: stdin !== undefined,
    AttachStdout: true,
    Cmd: process.env.ULIMIT_KB
      ? ["sh", "-c", `ulimit -v ${process.env.ULIMIT_KB}; exec timeout -s KILL ${timeout} "$@"`, "sh", ...argv]
      : ["timeout", "-s", "KILL", String(timeout), ...argv],
  });
  const stream = await exec.start({ hijack: true, stdin: stdin !== undefined });
  const out = new PassThrough();
  const err = new PassThrough();
  const chunks = { err: [], out: [] };
  out.on("data", (c) => chunks.out.push(c));
  err.on("data", (c) => chunks.err.push(c));
  docker.modem.demuxStream(stream, out, err);
  if (stdin !== undefined) {
    stream.end(stdin);
  }
  await new Promise((resolve) => stream.on("end", resolve));
  const { ExitCode } = await exec.inspect();
  return {
    code: ExitCode,
    stderr: Buffer.concat(chunks.err).toString(),
    stdout: Buffer.concat(chunks.out).toString(),
  };
};

const tarOf = (files) => {
  const pack = tar.pack();
  for (const [name, data] of Object.entries(files)) {
    pack.entry({ mode: 0o644, name, uid: 1000, gid: 1000 }, data);
  }
  pack.finalize();
  return pack;
};

const untarFirst = async (stream) => {
  const extract = tar.extract();
  let found;
  extract.on("entry", (header, body, next) => {
    const parts = [];
    body.on("data", (c) => parts.push(c));
    body.on("end", () => {
      found ??= Buffer.concat(parts);
      next();
    });
  });
  stream.pipe(extract);
  await new Promise((resolve) => extract.on("finish", resolve));
  return found;
};

const main = async () => {
  console.log(`socket ${socketPath}, runtime ${runtime}, image ${image}`);
  await pull();

  let start = performance.now();
  const container = await create();
  await container.start();
  note("create + start", true, ms(start));

  try {
    start = performance.now();
    const hello = await run(container, ["python3", "-c", "print('hi')"]);
    note("first exec python", hello.stdout.trim() === "hi", ms(start));
    start = performance.now();
    await run(container, ["python3", "-c", "print('hi')"]);
    note("second exec python", true, ms(start));

    const who = await run(container, ["id", "-u"]);
    note("not root", who.stdout.trim() === "1000", `uid ${who.stdout.trim()}`);

    const rootWrite = await run(container, ["sh", "-c", "touch /etc/x"]);
    note("root fs read-only", rootWrite.code !== 0, rootWrite.stderr.trim());

    const kernel = await run(container, ["uname", "-r"]);
    note("kernel", true, kernel.stdout.trim());

    // Files in: archive API into tmpfs (docker cp is said not to reach tmpfs).
    try {
      start = performance.now();
      await container.putArchive(tarOf({ "in.csv": "a,b\n1,2\n" }), { path: "/workspace" });
      const cat = await run(container, ["cat", "/workspace/in.csv"]);
      note("putArchive into tmpfs", cat.stdout.includes("1,2"), ms(start));
    } catch (error) {
      note("putArchive into tmpfs", false, String(error.message ?? error).slice(0, 160));
    }
    // Fallback: tar through exec stdin.
    start = performance.now();
    const viaStdin = await run(container, ["tar", "-x", "-C", "/workspace"], {
      stdin: await streamToBuffer(tarOf({ "in2.csv": "c,d\n3,4\n" })),
    });
    const cat2 = await run(container, ["cat", "/workspace/in2.csv"]);
    note("tar via exec stdin", viaStdin.code === 0 && cat2.stdout.includes("3,4"), ms(start));

    // Code through stdin, file out.
    const code = "import csv\nrows=list(csv.reader(open('in2.csv')))\nopen('out.txt','w').write(str(rows))\nprint(len(rows))";
    const py = await run(container, ["python3", "-"], { stdin: code });
    note("python from stdin", py.stdout.trim() === "2", py.stderr.trim().slice(-120));
    start = performance.now();
    const packed = await runRaw(container, ["tar", "-c", "-C", "/workspace", "out.txt"]);
    const data = await untarFirst(bufferStream(packed));
    note("tar out via exec stdout", String(data).includes("3"), ms(start));

    const net = await run(container, [
      "python3", "-c",
      "import socket; socket.create_connection(('1.1.1.1', 443), timeout=3); print('open')",
    ]);
    note("no network", !net.stdout.includes("open"), net.stderr.trim().split("\n").at(-1));

    start = performance.now();
    const loop = await run(container, ["python3", "-c", "while True: pass"], { timeout: 3 });
    note("time limit kills", loop.code === 137, `exit ${loop.code}, ${ms(start)}`);

    const oom = await run(container, ["python3", "-c", "x = bytearray(2 * 1024**3); print('alive')"]);
    note("memory limit", !oom.stdout.includes("alive"), `exit ${oom.code}, ${oom.stderr.trim().split("\n").at(-1) ?? ""}`);
    const events = await run(container, ["sh", "-c", "cat /sys/fs/cgroup/memory.events 2>&1 | grep oom_kill || echo none"]);
    note("oom counter readable", !events.stdout.includes("none"), events.stdout.trim());
    const after = await run(container, ["python3", "-c", "print('ok')"]);
    note("container survives OOM", after.stdout.trim() === "ok");

    const bomb = await run(
      container,
      ["python3", "-c", "import os\nfor _ in range(1000):\n    try:\n        os.fork()\n    except OSError as e:\n        print('blocked', e.errno); break"],
      { timeout: 5 }
    );
    note("pids limit holds", bomb.stdout.includes("blocked") || bomb.code !== 0, bomb.stdout.trim().split("\n")[0]);
    const alive = await run(container, ["python3", "-c", "print('ok')"]);
    note("container survives fork bomb", alive.stdout.trim() === "ok");

    const disk = await run(container, ["sh", "-c", "dd if=/dev/zero of=/workspace/big bs=1M count=400 2>&1; ls -l /workspace/big | cut -d' ' -f5"]);
    note("tmpfs size limit", /No space|space left/i.test(disk.stdout), disk.stdout.trim().split("\n").at(-1));

    const pkgs = await run(container, ["python3", "-c", "import sys; print(sys.version.split()[0])"]);
    note("python version", true, pkgs.stdout.trim());
  } finally {
    start = performance.now();
    await container.remove({ force: true });
    note("remove", true, ms(start));
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length}`);
};

/** stdout as bytes (no text decoding): for tar out. */
const runRaw = async (container, argv) => {
  const exec = await container.exec({ AttachStderr: true, AttachStdout: true, Cmd: argv });
  const stream = await exec.start({ hijack: true, stdin: false });
  const out = new PassThrough();
  const parts = [];
  out.on("data", (c) => parts.push(c));
  docker.modem.demuxStream(stream, out, new PassThrough());
  await new Promise((resolve) => stream.on("end", resolve));
  return Buffer.concat(parts);
};

const bufferStream = (buffer) => {
  const stream = new PassThrough();
  stream.end(buffer);
  return stream;
};

const streamToBuffer = async (stream) => {
  const parts = [];
  for await (const c of stream) parts.push(c);
  return Buffer.concat(parts);
};

await main();
