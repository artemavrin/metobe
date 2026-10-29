"use client";

import type { UpdateAutomation } from "@metobe/contracts/updates";
import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { saveUpdateSchedule } from "./actions";

const subscribeToTimeZone = (onChange: () => void) => {
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
};
const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export const Automation = ({ settings }: { settings: UpdateAutomation }) => {
  const t = useTranslations("about.automation");
  const [value, setValue] = useState(settings);
  const [saved, setSaved] = useState<UpdateAutomation | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const localTimeZone = useSyncExternalStore(
    subscribeToTimeZone,
    browserTimeZone,
    () => settings.timeZone
  );
  const useLocalTimeZone =
    settings.nightlyAt === null && settings.timeZone === "UTC";
  const shownTimeZone =
    value.nightlyAt === null ? localTimeZone : value.timeZone;

  const dirty = JSON.stringify(value) !== JSON.stringify(saved ?? settings);
  const saveIcon = () => {
    if (pending) {
      return <Spinner />;
    }
    if (saved && !dirty) {
      return <Check />;
    }
    return null;
  };
  const statusText = () => {
    if (failed) {
      return t("failed");
    }
    if (saved && !dirty) {
      return t("saved");
    }
    return t("zone", { zone: shownTimeZone });
  };
  const save = () =>
    start(async () => {
      setFailed(false);
      try {
        await saveUpdateSchedule(value);
        setSaved(value);
      } catch {
        setFailed(true);
      }
    });

  return (
    <Section
      action={
        <Button disabled={pending || !dirty} onClick={save} size="sm">
          {saveIcon()}
          {pending ? t("saving") : t("save")}
        </Button>
      }
      meta={t("meta")}
      title={t("title")}
    >
      <Rows>
        <Row hint={t("nightlyHint")} label={t("nightly")}>
          <div className="flex items-center gap-3">
            <Switch
              aria-label={t("nightly")}
              checked={value.nightlyAt !== null}
              onCheckedChange={(on) => {
                setValue((current) => ({
                  ...current,
                  nightlyAt: on ? (current.nightlyAt ?? "03:00") : null,
                  timeZone: useLocalTimeZone ? localTimeZone : current.timeZone,
                }));
              }}
            />
            {value.nightlyAt !== null && (
              <Input
                aria-label={t("time")}
                className="w-28 tabular-nums"
                onChange={(event) => {
                  setValue((current) => ({
                    ...current,
                    nightlyAt: event.target.value,
                  }));
                }}
                type="time"
                value={value.nightlyAt}
              />
            )}
          </div>
        </Row>
        <Row hint={t("patchHint")} label={t("patches")}>
          <Switch
            aria-label={t("patches")}
            checked={value.autoPatches}
            onCheckedChange={(autoPatches) => {
              setValue((current) => ({ ...current, autoPatches }));
            }}
          />
        </Row>
      </Rows>
      <div aria-live="polite" className="text-muted-foreground text-xs">
        {statusText()}
      </div>
    </Section>
  );
};
