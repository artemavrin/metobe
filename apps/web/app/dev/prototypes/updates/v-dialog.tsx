"use client";

import { Button } from "@metobe/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@metobe/ui/components/dialog";
import { Spinner } from "@metobe/ui/components/spinner";
import { useState } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { CURRENT, NEXT, STEPS } from "./data";
import { Actions, Automatic, Changelog, day, History, Manual, Outcome, Page, Progress, Scheduled, StatusBadge, WhatHappens } from "./parts";
import { useProto } from "./state";
import { UserView } from "./user-view";

// «Диалог» — the page stays a calm list of rows like every settings screen; the version's row says what is up and
// opens a window: what is new, when, then the steps. Closed mid-way, the row keeps the step and the time.

const VersionRow = ({ onOpen }: { onOpen: () => void }) => {
  const { phase, step } = useProto();
  const version = phase === "done" ? NEXT.version : CURRENT.version;
  let hint = `установлена ${day(CURRENT.installed)}`;
  let action: React.ReactNode = null;
  if (phase === "latest") hint = "последняя версия · проверили 20 минут назад";
  if (phase === "available" || phase === "manual") {
    hint = `доступна ${NEXT.version} от ${day(NEXT.date)}`;
    action = (
      <Button onClick={onOpen} size="sm">
        Что в {NEXT.version}
      </Button>
    );
  }
  if (phase === "scheduled") {
    hint = `${NEXT.version} поставится ночью`;
    action = (
      <Button onClick={onOpen} size="sm" variant="outline">
        Подробнее
      </Button>
    );
  }
  if (phase === "updating") {
    hint = `шаг ${step + 1} из ${STEPS.length}: ${STEPS[step]?.title.toLowerCase()}`;
    action = (
      <Button onClick={onOpen} size="sm" variant="outline">
        <Spinner />
        Ход
      </Button>
    );
  }
  if (phase === "done") hint = "обновлено сегодня";
  if (phase === "failed") {
    hint = `${NEXT.version} не прошла проверку, вернули ${CURRENT.version}`;
    action = (
      <Button onClick={onOpen} size="sm" variant="outline">
        Что случилось
      </Button>
    );
  }
  return (
    <Row action={action} hint={hint} label="Версия">
      <span className="flex items-center gap-2 tabular-nums">
        {version}
        <StatusBadge />
      </span>
    </Row>
  );
};

const Window = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const { phase } = useProto();
  const running = phase === "updating" || phase === "done" || phase === "failed";
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{running ? `Обновление до ${NEXT.version}` : `Metobe ${NEXT.version}`}</DialogTitle>
          <DialogDescription>
            {running ? "Идёт на сервере — окно можно закрыть." : `Вышла ${day(NEXT.date)} · ${NEXT.size}`}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 max-h-[60dvh] overflow-y-auto px-6">
          {running ? (
            <div className="flex flex-col gap-5">
              <Outcome />
              <Progress />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <Changelog dense />
              {phase === "manual" ? <Manual /> : phase === "scheduled" ? <Scheduled /> : <WhatHappens />}
            </div>
          )}
        </div>
        {phase === "available" && (
          <DialogFooter>
            <Actions />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const DialogVariant = () => {
  const { eye } = useProto();
  const [open, setOpen] = useState(false);
  if (eye === "user") return <UserView />;
  return (
    <Page>
      <Section title="Metobe">
        <Rows>
          <VersionRow onOpen={() => setOpen(true)} />
          <Row hint="Ставит версии по кнопке и ночью, делает копию базы и откатывает, если что-то не так" label="Обновлятель">
            <span className="text-sm">включён</span>
          </Row>
        </Rows>
      </Section>
      <Automatic />
      <History />
      <Window onOpenChange={setOpen} open={open} />
    </Page>
  );
};
