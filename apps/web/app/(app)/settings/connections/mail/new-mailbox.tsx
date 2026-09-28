"use client";

import { useRouter } from "next/navigation";

import { MailboxForm } from "@/components/mail/mailbox-form";

/** The form on its own page: once connected, off to the box's page. */
export const NewMailbox = () => {
  const router = useRouter();
  return (
    <MailboxForm
      onSaved={(id) => router.push(`/settings/connections/mail/${id}`)}
    />
  );
};
