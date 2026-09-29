"use client";

import { Button, buttonVariants } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metobe/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { Spinner } from "@metobe/ui/components/spinner";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Row, Rows } from "@/components/settings/rows";

import { removeAccount, removeAllChats } from "./data-actions";

/** «Удалить все чаты»: a confirmation, then it is done and says how many. */
const DeleteChats = () => {
  const t = useTranslations("data.chats");
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="destructive" />}>
        {t("button")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {done === null ? t("text") : t("done", { count: done })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            {done === null ? t("cancel") : t("close")}
          </DialogClose>
          {done === null && (
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await removeAllChats();
                  setDone(result.count);
                })
              }
              variant="destructive"
            >
              {pending && <Spinner />}
              {t("confirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** «Удалить аккаунт»: the email typed as the confirmation — a slip of a click must not do it. */
const DeleteAccount = ({ email }: { email: string }) => {
  const t = useTranslations("data.account");
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <Dialog
      onOpenChange={() => {
        setTyped("");
        setProblem(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="destructive" />}>
        {t("button")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("text")}</DialogDescription>
        </DialogHeader>
        <Field data-invalid={Boolean(problem)}>
          <FieldLabel htmlFor="delete-account-email">
            {t("type", { email })}
          </FieldLabel>
          <Input
            autoComplete="off"
            id="delete-account-email"
            onChange={(e) => setTyped(e.target.value)}
            value={typed}
          />
          {problem && <FieldError>{problem}</FieldError>}
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            {t("cancel")}
          </DialogClose>
          <Button
            aria-disabled={!matches || pending}
            onClick={() => {
              if (!matches || pending) {
                return;
              }
              start(async () => {
                const result = await removeAccount(typed);
                if (result && !result.ok) {
                  setProblem(t(`problems.${result.problem}`));
                }
              });
            }}
            variant="destructive"
          >
            {pending && <Spinner />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const DataForm = () => {
  const t = useTranslations("data");
  return (
    <Rows>
      <Row
        action={
          <a
            className={buttonVariants({ size: "sm", variant: "outline" })}
            download
            href="/api/account/export"
          >
            <Download />
            {t("export.button")}
          </a>
        }
        hint={t("export.hint")}
        label={t("export.label")}
      />
    </Rows>
  );
};

/** What cannot be undone, apart and in red: a frame of its own, the email typed to delete the account. */
export const DangerForm = ({ email }: { email: string }) => {
  const t = useTranslations("data");
  return (
    <div className="border-destructive/30 divide-destructive/15 divide-y rounded-lg border">
      <Row
        action={<DeleteChats />}
        hint={t("chats.hint")}
        label={t("chats.label")}
      />
      <Row
        action={<DeleteAccount email={email} />}
        hint={t("account.hint")}
        label={t("account.label")}
      />
    </div>
  );
};
