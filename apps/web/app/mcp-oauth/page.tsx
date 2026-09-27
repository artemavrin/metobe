import { z } from "zod";

import { Relay } from "./relay";

// /mcp-oauth — the OAuth window's relay (lib/oauth-window): «opening…» before the provider's page, the result after
// the callback. Nothing from the query becomes an address: the way back is built from a server id, checked.
const OAuthRelayPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) => {
  const query = await searchParams;
  const server = z.uuid().safeParse(query.server);
  return (
    <Relay
      ok={query.ok === "1"}
      pending={query.pending === "1"}
      popup={query.popup === "1"}
      server={server.success ? server.data : undefined}
    />
  );
};

export default OAuthRelayPage;
