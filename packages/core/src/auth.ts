import "server-only";
import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";

import { buildAuthOptions } from "./auth-options";
import { getDb } from "./db";
import { buildLoginLink } from "./login-link";
import { sendMail } from "./mail";

const sendSignInCode = async (email: string, code: string) => {
  const link = buildLoginLink(email, code);
  await sendMail({
    html: `<p>Чтобы войти в Metobe, откройте ссылку:</p><p><a href="${link}">Войти</a></p><p>Или введите код: <b>${code}</b></p><p>Ссылка и код действуют 10 минут.</p>`,
    subject: `Код для входа в Metobe: ${code}`,
    text: `Чтобы войти в Metobe, откройте ссылку: ${link}\n\nИли введите код: ${code}\n\nСсылка и код действуют 10 минут.`,
    to: email,
  });
};

export const createAuth = (plugins: BetterAuthPlugin[] = []) =>
  betterAuth(buildAuthOptions({ db: getDb().db, plugins, sendSignInCode }));

export type Auth = ReturnType<typeof createAuth>;
