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
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Row, Rows } from "@/components/settings/rows";

import { forgetMemory, saveMemoryOn } from "./memory-actions";

/** «Забыть всё»: a confirmation, then it is done and says so. */
const Forget = () => {
  const t = useTranslations("memory");
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        setDone(false);
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="sm" variant="destructive" />}>
        {t("settingsForget")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("forgetTitle")}</DialogTitle>
          <DialogDescription>
            {done ? t("forgetDone") : t("forgetText")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            {done ? t("close") : t("dismiss")}
          </DialogClose>
          {!done && (
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await forgetMemory();
                  setDone(result.ok);
                })
              }
              variant="destructive"
            >
              {pending && <Spinner />}
              {t("forgetConfirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** The person's memory: remember from chats or not, and «Забыть всё». */
export const MemoryForm = ({ on: initial }: { on: boolean }) => {
  const t = useTranslations("memory");
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Rows>
      <Row hint={t("settingsOnHint")} label={t("settingsOn")}>
        <Switch
          aria-label={t("settingsOn")}
          checked={on}
          disabled={pending}
          onCheckedChange={(next) => {
            setOn(next);
            start(async () => {
              const result = await saveMemoryOn(next);
              if (!result.ok) {
                setOn(!next);
              }
            });
          }}
        />
      </Row>
      <Row hint={t("settingsForgetHint")} label={t("settingsForget")}>
        <Forget />
      </Row>
    </Rows>
  );
};
