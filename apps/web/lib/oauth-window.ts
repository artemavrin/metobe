// Signing in to an MCP server with OAuth in the provider's own window (a login page cannot sit inside our modal:
// providers refuse frames). The window starts on our relay page, goes to the provider, comes back to our callback
// and ends on the relay again, which tells the page that opened it and closes.

/** Where a sign-in started in a window returns to: the relay, which reports and closes (not a page of the app). */
export const OAUTH_POPUP_RETURN = "/mcp-oauth?popup=1";

/**
 * The relay speaks on a channel of this site: a provider's page may cut the window off from its opener
 * (Cross-Origin-Opener-Policy), and then `window.opener` is gone — a BroadcastChannel still reaches the page.
 */
export const OAUTH_CHANNEL = "metobe-oauth";

export interface OAuthMessage {
  type: "metobe-oauth";
  ok: boolean;
  /** The catalog item signed in to; absent when the sign-in failed before we knew which. */
  server?: string;
}

export const isOAuthMessage = (data: unknown): data is OAuthMessage =>
  typeof data === "object" &&
  data !== null &&
  (data as { type?: unknown }).type === "metobe-oauth" &&
  typeof (data as { ok?: unknown }).ok === "boolean";

/** The window's size and place: over the middle of the page that opened it. */
export const popupFeatures = () => {
  const width = 480;
  const height = 640;
  const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
  return `popup,width=${width},height=${height},left=${left},top=${top}`;
};
