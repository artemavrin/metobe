"use client";

import { Button } from "@metobe/ui/components/button";
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
import { Input } from "@metobe/ui/components/input";
import { Spinner } from "@metobe/ui/components/spinner";
import { Check, Copy } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { createLoginLink, setDisabled } from "./actions";

// One person's way in (D17): turn the account off or on, and a one-time sign-in link for when no letter gets to them.

interface Member {
  id: string;
  name: string;
  disabledAt: string | null;
  emailVerified: boolean;
}

/** The link, shown once in a dialog with a copy button; closing it forgets it. */
const LoginLink = ({ member }: { member: Member }) => {
  const t = useTranslations("users.detail.access.link");
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const make = () =>
    start(async () => {
      setFailed(false);
      const result = await createLoginLink(member.id);
      if (result.ok) {
        setUrl(result.url);
        setOpen(true);
      } else {
        setFailed(true);
      }
    });

  const copy = async () => {
    if (!url) {
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <Button
        disabled={pending || Boolean(member.disabledAt)}
        onClick={make}
        size="sm"
        variant="outline"
      >
        {pending && <Spinner />}
        {t("action")}
      </Button>
      <Dialog
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setUrl(null);
          }
        }}
        open={open}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("ready")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input
              aria-label={t("title")}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
              readOnly
              value={url ?? ""}
            />
            <Button onClick={copy} type="button" variant="outline">
              {copied ? <Check /> : <Copy />}
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>
              {t("close")}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {failed && (
        <span className="text-destructive text-xs" role="alert">
          {t("failed")}
        </span>
      )}
    </>
  );
};

export const AccessSection = ({ member }: { member: Member }) => {
  const t = useTranslations("users.detail.access");
  const f = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const turn = (disabled: boolean) =>
    start(async () => {
      await setDisabled(member.id, disabled);
      router.refresh();
    });

  return (
    <Section title={t("section")}>
      <Rows>
        {member.disabledAt ? (
          <Row
            action={
              <Button
                disabled={pending}
                onClick={() => turn(false)}
                size="sm"
                variant="outline"
              >
                {pending && <Spinner />}
                {t("on.action")}
              </Button>
            }
            hint={t("on.hint", {
              date: f.dateTime(new Date(member.disabledAt), {
                dateStyle: "long",
              }),
            })}
            label={t("on.label")}
          />
        ) : (
          <Row
            action={
              <Dialog>
                <DialogTrigger
                  render={<Button size="sm" variant="destructive" />}
                >
                  {t("off.action")}
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {t("off.title", { name: member.name })}
                    </DialogTitle>
                    <DialogDescription>{t("off.text")}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                      {t("off.cancel")}
                    </DialogClose>
                    <Button
                      disabled={pending}
                      onClick={() => turn(true)}
                      variant="destructive"
                    >
                      {pending && <Spinner />}
                      {t("off.action")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            }
            hint={t("off.hint")}
            label={t("off.label")}
          />
        )}
        <Row
          action={<LoginLink member={member} />}
          hint={t("link.hint")}
          label={t("link.label")}
        />
      </Rows>
      {!member.emailVerified && (
        <p className="text-muted-foreground text-xs">{t("unverified")}</p>
      )}
    </Section>
  );
};
