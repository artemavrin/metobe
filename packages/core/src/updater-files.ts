import { parse } from "yaml";

// The updater's (D35) work on the installation's files, kept pure: which image repository this server pulls from,
// the version pinned in `.env`, which copies of the base to keep, and whether a release's compose file has an
// updater to hand over to.

/** `ghcr.io/artemavrin/metobe:0.4.0` → `ghcr.io/artemavrin/metobe`; a registry's port is not a tag. */
export const imageRepo = (image: string) => {
  const name = image.split("@")[0] ?? image;
  const slash = name.lastIndexOf("/");
  const colon = name.lastIndexOf(":");
  return colon > slash ? name.slice(0, colon) : name;
};

/** A variable's value in `.env` text; the last line wins, as with compose. */
export const envValue = (env: string, key: string) => {
  let value: string | null = null;
  for (const line of env.split("\n")) {
    if (line.startsWith(`${key}=`)) {
      value = line.slice(key.length + 1).trim();
    }
  }
  return value;
};

const setEnv = (env: string, key: string, value: string) => {
  const line = `${key}=${value}`;
  if (envValue(env, key) === null) {
    return `${env}${env.endsWith("\n") || env === "" ? "" : "\n"}${line}\n`;
  }
  return env
    .split("\n")
    .map((current) => (current.startsWith(`${key}=`) ? line : current))
    .join("\n");
};

/** `.env` with METOBE_IMAGE set to `image`: every line of it replaced, or one added; the rest as it was. */
export const pinImage = (env: string, image: string, updaterImage?: string) =>
  updaterImage
    ? setEnv(
        setEnv(env, "METOBE_IMAGE", image),
        "METOBE_UPDATER_IMAGE",
        updaterImage
      )
    : setEnv(env, "METOBE_IMAGE", image);

/** The copies past the newest `keep`, to delete. */
export const backupsToDrop = (
  files: { name: string; mtimeMs: number }[],
  keep: number
) =>
  files
    .filter((f) => /^metobe-.+\.dump$/u.test(f.name))
    // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array from filter
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(keep)
    .map((f) => f.name);

/** Whether a release's compose file runs an updater: one without it could never be updated from the app again. */
export const composeHasUpdater = (text: string) => {
  try {
    const doc = parse(text) as { services?: Record<string, unknown> } | null;
    return Boolean(doc?.services?.updater);
  } catch {
    return false;
  }
};
