import { z } from "zod";

import type { ToolApproval as ApprovalPolicy } from "./catalog";

// Mailboxes (ARCH §17.7, D27): a user's own mail over SMTP (sending) and IMAP (reading), as many boxes as they
// like. The fields of a box, the presets that fill them, and the tools the model works with.

export const mailSecurities = ["ssl", "starttls", "none"] as const;
export type MailSecurity = (typeof mailSecurities)[number];

export const mailServerSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65_535),
  security: z.enum(mailSecurities),
});
export type MailServer = z.infer<typeof mailServerSchema>;

export const mailPresetIds = ["yandex", "gmail", "mailru", "custom"] as const;
export type MailPresetId = (typeof mailPresetIds)[number];

export interface MailPreset {
  smtp: MailServer;
  imap: MailServer;
  /** Where the service makes a password for apps; the ordinary password is not accepted there. */
  appPasswordUrl?: string;
}

/**
 * The public mail services people use here. Each wants a password made for apps, not the account's own. Outlook.com
 * is not among them: Microsoft turned password sign-in off for it — only OAuth works.
 */
export const MAIL_PRESETS: Record<
  Exclude<MailPresetId, "custom">,
  MailPreset
> = {
  gmail: {
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    imap: { host: "imap.gmail.com", port: 993, security: "ssl" },
    smtp: { host: "smtp.gmail.com", port: 465, security: "ssl" },
  },
  mailru: {
    appPasswordUrl: "https://account.mail.ru/user/2-step-auth/passwords/",
    imap: { host: "imap.mail.ru", port: 993, security: "ssl" },
    smtp: { host: "smtp.mail.ru", port: 465, security: "ssl" },
  },
  yandex: {
    appPasswordUrl: "https://id.yandex.ru/security/app-passwords",
    imap: { host: "imap.yandex.ru", port: 993, security: "ssl" },
    smtp: { host: "smtp.yandex.ru", port: 465, security: "ssl" },
  },
};

/** A box as the form sends it: the address, the login (usually the address), the password, both servers. */
export const mailboxInputSchema = z.object({
  address: z.email().max(254),
  imap: mailServerSchema,
  password: z.string().min(1).max(1000),
  preset: z.enum(mailPresetIds),
  smtp: mailServerSchema,
  username: z.string().trim().min(1).max(254),
});
export type MailboxInput = z.infer<typeof mailboxInputSchema>;

/** Which box a tool works with: its address; omitted — the user's only box. */
const mailboxField = z
  .email()
  .optional()
  .describe(
    "The address of the user's mailbox to use; omit when they have only one."
  );

export const emailSendInputSchema = z.object({
  cc: z.array(z.email()).max(20).optional(),
  mailbox: mailboxField,
  subject: z.string().trim().min(1).max(300),
  text: z
    .string()
    .min(1)
    .max(50_000)
    .describe(
      "The letter's body in Markdown — paragraphs, lists, bold, links, tables; it goes as HTML and as plain text. No raw HTML."
    ),
  to: z.array(z.email()).min(1).max(20),
});
export type EmailSendInput = z.infer<typeof emailSendInputSchema>;

export const emailSendOutputSchema = z.object({
  from: z.string(),
  messageId: z.string().optional(),
  sent: z.literal(true),
});
export type EmailSendOutput = z.infer<typeof emailSendOutputSchema>;

export const emailSearchInputSchema = z.object({
  folder: z
    .string()
    .max(200)
    .optional()
    .describe("A folder's path; omit for the inbox."),
  from: z.string().max(254).optional().describe("A sender's address or name."),
  limit: z.number().int().min(1).max(20).optional(),
  mailbox: mailboxField,
  since: z.iso.date().optional().describe("Only letters from this day on."),
  text: z
    .string()
    .max(200)
    .optional()
    .describe("Words in the subject or the body."),
  unread: z.boolean().optional().describe("Only unread letters."),
});
export type EmailSearchInput = z.infer<typeof emailSearchInputSchema>;

export const letterSummarySchema = z.object({
  date: z.string().optional(),
  folder: z.string(),
  from: z.string(),
  subject: z.string(),
  uid: z.number().int(),
  unread: z.boolean(),
});
export type LetterSummary = z.infer<typeof letterSummarySchema>;

export const emailSearchOutputSchema = z.object({
  letters: z.array(letterSummarySchema),
  /** How many matched in all; `letters` has the newest of them. */
  total: z.number().int(),
});
export type EmailSearchOutput = z.infer<typeof emailSearchOutputSchema>;

export const emailReadInputSchema = z.object({
  folder: z.string().max(200).optional().describe("As email_search gave it."),
  mailbox: mailboxField,
  uid: z.number().int().describe("As email_search gave it."),
});
export type EmailReadInput = z.infer<typeof emailReadInputSchema>;

export const emailReadOutputSchema = z.object({
  attachments: z.array(z.object({ name: z.string(), size: z.number() })),
  cc: z.string().optional(),
  date: z.string().optional(),
  from: z.string(),
  subject: z.string(),
  text: z.string(),
  to: z.string(),
  truncated: z.boolean(),
});
export type EmailReadOutput = z.infer<typeof emailReadOutputSchema>;

/** The tools of a user's own mail. */
export const mailTools = ["email_send", "email_search", "email_read"] as const;
export type MailTool = (typeof mailTools)[number];

/**
 * «Ask first?» per tool of a box, as the user set it; unset — the default: a letter goes only after the user's yes
 * (it is sent in their name and cannot be taken back), searching and reading go without asking.
 */
export type MailToolPolicy = Partial<Record<MailTool, ApprovalPolicy>>;

export const MAIL_DEFAULT_POLICY: Record<MailTool, ApprovalPolicy> = {
  email_read: "auto",
  email_search: "auto",
  email_send: "ask",
};

export const policyOf = (policy: MailToolPolicy, tool: MailTool) =>
  policy[tool] ?? MAIL_DEFAULT_POLICY[tool];
