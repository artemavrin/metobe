/**
 * A v4 UUID, made in the browser. `crypto.randomUUID` exists only in a secure context (https, or localhost): a page
 * opened over plain http by IP — a phone on the office network, a server without TLS — has `getRandomValues` alone,
 * so the UUID is put together from its bytes: the version nibble is 4 and the variant one of 8, 9, a, b.
 */
export const uuid = (): string => {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  const variant = "89ab"[(bytes[8] ?? 0) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
