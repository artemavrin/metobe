import { isMailConfigured } from "@metobe/core/mail";
import { connection } from "next/server";

import { LoginForm } from "./login-form";

const LoginPage = async () => {
  // Mail settings are read per request, not frozen at build time.
  await connection();
  return <LoginForm mailConfigured={isMailConfigured()} />;
};

export default LoginPage;
