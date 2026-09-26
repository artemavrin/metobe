import "server-only";
import { randomBytes } from "node:crypto";

import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthTokens,
} from "@ai-sdk/mcp";
import { oauthFlows } from "@metobe/db/schema/catalog";

import { getDb } from "./db";
import { getEnv } from "./env";
import { removeSecret, setSecret, withSecret } from "./secrets";
import type { Owner, Purpose } from "./secrets";

// OAuth 2.1 with PKCE for MCP servers (ARCH §17.4, now in v1): @ai-sdk/mcp runs the protocol — discovery, dynamic
// client registration, the code exchange, refresh — and asks this provider to keep what it learns. Everything is
// kept in `secrets` under the owner of the credentials: a shared catalog item or one user's connection.

export const OAUTH_CALLBACK_PATH = "/api/mcp/oauth/callback";

/** A sign-in being started: who starts it and where to send them after the callback. */
export interface OAuthStart {
  userId: string;
  returnTo: string;
}

export class StoredOAuth implements OAuthClientProvider {
  /** The provider's sign-in page, caught instead of a redirect: the UI opens it. */
  authorizationUrl: URL | undefined;
  private readonly owner: Owner;
  private readonly start: OAuthStart | undefined;
  private readonly callbackState: string | undefined;

  constructor(
    owner: Owner,
    options: { start?: OAuthStart; callbackState?: string } = {}
  ) {
    this.owner = owner;
    this.start = options.start;
    this.callbackState = options.callbackState;
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- OAuthClientProvider asks for it on the instance
  get redirectUrl() {
    return new URL(OAUTH_CALLBACK_PATH, getEnv().BETTER_AUTH_URL).toString();
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Metobe",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [this.redirectUrl],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  private async read<T>(purpose: Purpose): Promise<T | undefined> {
    const value = await withSecret(
      this.owner,
      purpose,
      (v) => JSON.parse(v) as T
    );
    return value ?? undefined;
  }

  tokens() {
    return this.read<OAuthTokens>("oauth_tokens");
  }

  async saveTokens(tokens: OAuthTokens) {
    await setSecret(this.owner, "oauth_tokens", JSON.stringify(tokens));
  }

  clientInformation() {
    return this.read<OAuthClientInformation>("oauth_client");
  }

  async saveClientInformation(information: OAuthClientInformation) {
    await setSecret(this.owner, "oauth_client", JSON.stringify(information));
  }

  /** We only ever register ourselves dynamically, so a refused client may be registered again. */
  // oxlint-disable-next-line eslint/class-methods-use-this -- OAuthClientProvider asks for it on the instance
  isClientInformationDynamicallyRegistered() {
    return true;
  }

  async saveCodeVerifier(verifier: string) {
    await setSecret(this.owner, "oauth_verifier", verifier);
  }

  async codeVerifier() {
    const verifier = await withSecret(this.owner, "oauth_verifier", (v) => v);
    if (!verifier) {
      throw new Error("no OAuth sign-in is on its way");
    }
    return verifier;
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }

  /** A fresh state, remembered with who signs in; outside a started sign-in there is nothing to remember. */
  async state() {
    const state = randomBytes(24).toString("base64url");
    if (this.start) {
      await getDb()
        .db.insert(oauthFlows)
        .values({
          ownerId: this.owner.id,
          ownerType:
            this.owner.type === "connection" ? "connection" : "catalog_item",
          returnTo: this.start.returnTo,
          state,
          userId: this.start.userId,
        });
    }
    return state;
  }

  /** The state the callback brought, already matched against `oauth_flows`. */
  storedState() {
    return this.callbackState;
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier") {
    if (scope === "all" || scope === "tokens") {
      await removeSecret(this.owner, "oauth_tokens");
    }
    if (scope === "all" || scope === "client") {
      await removeSecret(this.owner, "oauth_client");
    }
    if (scope === "all" || scope === "verifier") {
      await removeSecret(this.owner, "oauth_verifier");
    }
  }
}
