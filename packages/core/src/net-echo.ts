// What a proxy's check asks the internet: the exit IP and its country. One echo service rate-limits a busy exit
// (ipinfo answers 429), so several are asked in turn — and any answer at all proves the tunnel works.

export interface Exit {
  ip?: string;
  country?: string;
}

/** The echo services, in the order asked, and how to read each one's answer. */
export const IP_ECHOES: {
  url: string;
  read: (body: unknown) => Exit;
}[] = [
  {
    read: (body) => body as Exit,
    url: "https://ipinfo.io/json",
  },
  {
    read: (body) => {
      const b = body as { ip?: string; country_iso?: string };
      return { country: b.country_iso, ip: b.ip };
    },
    url: "https://ifconfig.co/json",
  },
  {
    read: (body) => ({ ip: (body as { ip?: string }).ip }),
    url: "https://api.ipify.org?format=json",
  },
];

/**
 * The exit as the first echo that knows it says. An echo that answers with an error still answered — through the
 * proxy — so the proxy works, its IP just unknown; only when none can be reached is the proxy down (the last
 * network error is thrown).
 */
export const probeExit = async (
  fetchIt: typeof fetch,
  echoes = IP_ECHOES
): Promise<Exit> => {
  let answered = false;
  let failure: unknown;
  for (const echo of echoes) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one echo at a time: the next only if this one did not know
      const res = await fetchIt(echo.url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      answered = true;
      if (res.ok) {
        // oxlint-disable-next-line no-await-in-loop -- as above
        const exit = echo.read(await res.json());
        if (exit.ip) {
          return exit;
        }
      }
    } catch (error) {
      failure = error;
    }
  }
  if (answered) {
    return {};
  }
  throw failure ?? new Error("no echo service answered");
};
