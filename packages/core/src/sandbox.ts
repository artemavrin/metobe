import "server-only";
import type {
  AcquireRequest,
  AcquireResponse,
  ExecResponse,
  SandboxFileEntry,
  SandboxStatus,
} from "@metobe/contracts/sandbox";

// The sandbox service's client (D47): the app and the worker ask it by SANDBOX_URL and SANDBOX_TOKEN. Unset — the
// sandbox is not installed, and the model has no code tools.

export class SandboxError extends Error {
  /** 429 no room, 503 not ready or unreachable, 410 the box is gone, 4xx a bad request. */
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SandboxError";
    this.status = status;
  }
}

const settings = () => {
  const url = process.env.SANDBOX_URL;
  const token = process.env.SANDBOX_TOKEN;
  return url && token ? { token, url: url.replace(/\/$/u, "") } : null;
};

/** The sandbox is installed (its address and token are set); whether it is up is `sandboxStatus`. */
export const sandboxConfigured = () => settings() !== null;

const call = async (
  method: string,
  path: string,
  options: { json?: unknown; body?: Uint8Array; timeoutMs?: number } = {}
) => {
  const s = settings();
  if (!s) {
    throw new SandboxError(503, "The sandbox is not installed.");
  }
  let response: Response;
  try {
    response = await fetch(s.url + path, {
      body:
        options.json === undefined
          ? (options.body as Uint8Array<ArrayBuffer> | undefined)
          : JSON.stringify(options.json),
      headers: {
        authorization: `Bearer ${s.token}`,
        ...(options.json === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      method,
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
  } catch (error) {
    throw new SandboxError(503, `The sandbox did not answer: ${String(error)}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // Not JSON.
    }
    throw new SandboxError(response.status, message);
  }
  return response;
};

const callJson = async <T>(
  method: string,
  path: string,
  options: Parameters<typeof call>[2] = {}
) => {
  const response = await call(method, path, options);
  return (await response.json()) as T;
};

export const sandboxStatus = async (): Promise<SandboxStatus | null> => {
  if (!sandboxConfigured()) {
    return null;
  }
  try {
    return await callJson<SandboxStatus>("GET", "/status", { timeoutMs: 5000 });
  } catch {
    return null;
  }
};

/** Up and ready to take boxes: the code tools are given only then. */
export const sandboxReady = async () => {
  const status = await sandboxStatus();
  return status?.ready === true;
};

export const acquireBox = (request: AcquireRequest) =>
  callJson<AcquireResponse>("POST", "/boxes", {
    json: request,
    timeoutMs: 330_000,
  });

export const runInBox = (boxId: string, code: string, timeoutSeconds = 60) =>
  callJson<ExecResponse>("POST", `/boxes/${boxId}/exec`, {
    json: { code, timeoutSeconds },
    timeoutMs: (timeoutSeconds + 30) * 1000,
  });

export const putInBox = async (
  boxId: string,
  path: string,
  data: Uint8Array
) => {
  await call("PUT", `/boxes/${boxId}/files?path=${encodeURIComponent(path)}`, {
    body: data,
    timeoutMs: 120_000,
  });
};

export const takeFromBox = async (boxId: string, path: string) => {
  const response = await call(
    "GET",
    `/boxes/${boxId}/files?path=${encodeURIComponent(path)}`,
    { timeoutMs: 120_000 }
  );
  return new Uint8Array(await response.arrayBuffer());
};

export const listBox = (boxId: string) =>
  callJson<SandboxFileEntry[]>("GET", `/boxes/${boxId}/list`);

export const heartbeatBox = async (boxId: string) => {
  await call("POST", `/boxes/${boxId}/heartbeat`, { timeoutMs: 10_000 });
};

/** The answer ended: `keep` — the box waits for the next answer in its chat. Never throws: the box expires anyway. */
export const releaseBox = async (boxId: string, keep: boolean) => {
  await call("POST", `/boxes/${boxId}/release`, {
    json: { keep },
    timeoutMs: 10_000,
  }).catch((error: unknown) => {
    console.error("sandbox: could not release", boxId, error);
  });
};

/** The chat was deleted or a message edited: its box goes, files of a dropped branch with it. Never throws. */
export const forgetChatBox = async (chatId: string) => {
  if (!sandboxConfigured()) {
    return;
  }
  await call("DELETE", `/chats/${encodeURIComponent(chatId)}`, {
    timeoutMs: 10_000,
  }).catch((error: unknown) => {
    console.error("sandbox: could not drop the chat's box", chatId, error);
  });
};
