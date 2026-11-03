// Whether a source runs on the organization's own hardware, by its address: this machine, a private network or a
// `.local` name. Only the default of a new source — the admin may say otherwise. The same rule as migration 0032.

const PRIVATE = [
  /^localhost$/u,
  /^127\./u,
  /^10\./u,
  /^192\.168\./u,
  /^172\.(?:1[6-9]|2\d|3[01])\./u,
  /^\[?::1\]?$/u,
  /\.local$/u,
];

export const isLocalAddress = (baseUrl: string | null | undefined) => {
  if (!baseUrl) {
    return false;
  }
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return PRIVATE.some((re) => re.test(host));
  } catch {
    return false;
  }
};
