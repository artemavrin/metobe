import { CodeStep } from "../login-form";

// The link only pre-fills the code: signing in is a POST, so mail scanners that open links cannot burn it.
const VerifyPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) => {
  const { code = "", email = "" } = await searchParams;
  return <CodeStep email={email} initialCode={code} />;
};

export default VerifyPage;
