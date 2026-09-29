"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Textarea } from "@metobe/ui/components/textarea";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { Row, Rows } from "@/components/settings/rows";

import { saveInstructions, saveSendKey } from "./actions";

const MAX = 2000;
// A pause in typing this long saves the notes; leaving the field saves them at once.
const SAVE_AFTER_MS = 800;

type Status = "idle" | "saving" | "saved" | "failed";

/** What the model is told about the user and how a message is sent. Everything saves at once, as on the whole page. */
export const ModelForm = ({
  instructions,
  sendKey,
}: {
  instructions: string;
  sendKey: "enter" | "mod-enter";
}) => {
  const t = useTranslations("personalization");
  const [text, setText] = useState(instructions);
  const [status, setStatus] = useState<Status>("idle");
  const [key, setKey] = useState(sendKey);
  const saved = useRef(instructions.trim());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, start] = useTransition();
  const commit = (value: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    const next = value.trim();
    if (next === saved.current) {
      return;
    }
    setStatus("saving");
    start(async () => {
      const result = await saveInstructions(next);
      if (result.ok) {
        saved.current = next;
      }
      setStatus(result.ok ? "saved" : "failed");
    });
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea
          aria-label={t("aboutTitle")}
          className="min-h-32"
          maxLength={MAX}
          onBlur={() => commit(text)}
          onChange={(e) => {
            setText(e.target.value);
            setStatus("idle");
            if (timer.current) {
              clearTimeout(timer.current);
            }
            const { value } = e.target;
            timer.current = setTimeout(() => commit(value), SAVE_AFTER_MS);
          }}
          placeholder={t("placeholder")}
          value={text}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">{t("aboutHint")}</p>
          <div className="flex shrink-0 items-center gap-3 text-xs">
            <span
              aria-live="polite"
              className={
                status === "failed"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            >
              {status === "idle" ? "" : t(`status.${status}`)}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {text.length} / {MAX}
            </span>
          </div>
        </div>
      </div>
      <Rows>
        <Row hint={t("sendKey.hint")} label={t("sendKey.label")}>
          <Select
            onValueChange={(v) => {
              const next = v as "enter" | "mod-enter";
              setKey(next);
              start(async () => {
                await saveSendKey(next);
              });
            }}
            value={key}
          >
            <SelectTrigger
              aria-label={t("sendKey.label")}
              className="w-full md:w-72"
            >
              <SelectValue>{t(`sendKey.values.${key}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(["enter", "mod-enter"] as const).map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`sendKey.values.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Rows>
    </div>
  );
};
