import "server-only";
import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";

import { getEnv } from "./env";

let transport: Transporter | undefined;

export const isMailConfigured = () => Boolean(getEnv().SMTP_URL);

export const sendMail = async (message: {
  html: string;
  subject: string;
  text: string;
  to: string;
}) => {
  const { SMTP_FROM, SMTP_URL } = getEnv();
  if (!SMTP_URL) {
    throw new Error("SMTP is not configured");
  }
  transport ??= createTransport(SMTP_URL);
  await transport.sendMail({ ...message, from: SMTP_FROM });
};
