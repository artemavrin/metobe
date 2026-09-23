"use client";

import { Button } from "@purr/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@purr/ui/components/dialog";
import { ArrowLeft } from "lucide-react";
import { useCallback, useState } from "react";

import { ConnectForm, ProviderList } from "./connect";
import { type ProviderKind, providerBy } from "./mock";
import { ProviderMark, type RouteChoice } from "./shared";

export type Connected = { kind: ProviderKind; models: Set<string>; route: RouteChoice; fresh?: boolean };

/** Settings start from a lived-in state: OpenAI behind the corporate proxy, Yandex direct. */
export const seedConnected = (): Connected[] => [
  {
    kind: "openai",
    models: new Set(["gpt-5.2", "gpt-5.2-mini"]),
    route: { kind: "proxy", proxy: { country: "DE", id: "corp", latency: 48, title: "Корп-прокси", type: "http" } },
  },
  { kind: "yandex", models: new Set(["aliceai-llm", "yandexgpt-5.1"]), route: { kind: "direct" } },
];

/** Adding a provider from settings: pick → key → check, in one dialog. */
export const ConnectDialog = ({
  open,
  onOpenChange,
  connected,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connected: ProviderKind[];
  onConnected: (c: Connected) => void;
}) => {
  const [kind, setKind] = useState<ProviderKind | null>(null);

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) setKind(null);
  };

  const done = useCallback(
    (route: RouteChoice) => {
      if (!kind) return;
      onConnected({ fresh: true, kind, models: new Set(), route });
      onOpenChange(false);
      setKind(null);
    },
    [kind, onConnected, onOpenChange]
  );

  return (
    <Dialog onOpenChange={close} open={open}>
      <DialogContent className="sm:max-w-lg">
        {kind ? (
          <>
            <DialogHeader className="flex-row items-center gap-3">
              <ProviderMark kind={kind} size="default" />
              <div className="flex flex-col gap-0.5">
                <DialogTitle>{providerBy(kind).title}</DialogTitle>
                <DialogDescription>{providerBy(kind).blurb}</DialogDescription>
              </div>
            </DialogHeader>
            <ConnectForm
              footer={({ busy }) => (
                <DialogFooter className="sm:justify-between">
                  <Button disabled={busy} onClick={() => setKind(null)} type="button" variant="ghost">
                    <ArrowLeft /> Другой провайдер
                  </Button>
                  <Button disabled={busy} type="submit">
                    Проверить и подключить
                  </Button>
                </DialogFooter>
              )}
              key={kind}
              kind={kind}
              onDone={done}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Подключить провайдера</DialogTitle>
              <DialogDescription>Ключ проверим сразу. Если провайдер недоступен напрямую — подберём прокси.</DialogDescription>
            </DialogHeader>
            <ProviderList connected={connected} onPick={setKind} size="sm" />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
