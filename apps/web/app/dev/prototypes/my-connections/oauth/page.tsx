import { Consent } from "./consent";

// The provider's window in «Погружение · 2»: a stand-in consent page that answers the settings through postMessage.
const OAuthMockPage = async ({ searchParams }: { searchParams: Promise<{ server?: string }> }) => {
  const { server } = await searchParams;
  return <Consent serverId={server} />;
};

export default OAuthMockPage;
