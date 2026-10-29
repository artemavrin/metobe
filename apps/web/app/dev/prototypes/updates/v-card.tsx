"use client";

import { Button } from "@metobe/ui/components/button";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@metobe/ui/components/reui/frame";

import { CURRENT, NEXT } from "./data";
import { Actions, Automatic, Changelog, day, History, Manual, Outcome, Page, Progress, Scheduled, StatusBadge, WhatHappens } from "./parts";
import { useProto } from "./state";
import { UserView } from "./user-view";

// «Карточка» — one card for the version, and everything about the update inside it: what is new and the two buttons,
// then the steps in its place while it runs, then how it ended. Below — automatic updates and the history.

const Body = () => {
  const { phase } = useProto();
  if (phase === "latest") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">Это последняя версия. Проверили 20 минут назад, следующая проверка — через 6 часов.</p>
        <Button size="sm" variant="outline">
          Проверить сейчас
        </Button>
      </div>
    );
  }
  if (phase === "updating") return <Progress />;
  if (phase === "done" || phase === "failed") {
    return (
      <div className="flex flex-col gap-5">
        <Outcome />
        <Progress />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">Доступна {NEXT.version}</h3>
        <p className="text-muted-foreground text-sm">
          Вышла {day(NEXT.date)} · {NEXT.size}
        </p>
      </div>
      <Changelog />
      {phase === "manual" ? (
        <Manual />
      ) : phase === "scheduled" ? (
        <Scheduled />
      ) : (
        <>
          <WhatHappens />
          <Actions />
        </>
      )}
    </div>
  );
};

export const Card = () => {
  const { eye, phase } = useProto();
  if (eye === "user") return <UserView />;
  const shown = phase === "done" ? NEXT.version : CURRENT.version;
  return (
    <Page>
      <Frame>
        <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FrameTitle className="text-base">Metobe {phase === "updating" ? `${CURRENT.version} → ${NEXT.version}` : shown}</FrameTitle>
            <StatusBadge />
          </div>
          <FrameDescription>{phase === "done" ? "установлена сегодня" : `установлена ${day(CURRENT.installed)}`}</FrameDescription>
        </FrameHeader>
        <FramePanel>
          <Body />
        </FramePanel>
      </Frame>
      {phase !== "manual" && <Automatic />}
      <History />
    </Page>
  );
};
