"use client";

import type { SkillProblem, SkillSummary } from "@metobe/contracts/skills";
import { Button } from "@metobe/ui/components/button";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { FolderUp, FileArchive, Sparkles, Trash2 } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { refreshSkills, removeSkill, toggleSkill } from "./actions";

// The organization's skills: bring one in as a zip (picked or dropped) or a picked folder, see what each is for, turn it on
// or off, delete it. A name already taken asks before it replaces the skill there.

type Upload = { zip: File } | { files: File[] };

type Outcome =
  | { kind: "ok"; name: string; replaced: boolean }
  | { kind: "problem"; problem: SkillProblem; retry?: Upload }
  | { kind: "failed" };

const send = async (upload: Upload, replace: boolean): Promise<Outcome> => {
  const form = new FormData();
  if ("zip" in upload) {
    form.append("zip", upload.zip);
  } else {
    for (const file of upload.files) {
      // The path in the folder goes as the file's name: the server reads the folder from it.
      form.append("files", file, file.webkitRelativePath || file.name);
    }
  }
  if (replace) {
    form.append("replace", "1");
  }
  const res = await fetch("/api/skills", { body: form, method: "POST" }).catch(
    () => null
  );
  const body = (await res?.json().catch(() => null)) as
    | { ok: true; id: string; replaced: boolean }
    | { ok: false; problem: SkillProblem }
    | null;
  if (!body) {
    return { kind: "failed" };
  }
  return body.ok
    ? { kind: "ok", name: "", replaced: body.replaced }
    : {
        kind: "problem",
        problem: body.problem,
        retry: body.problem === "taken" ? upload : undefined,
      };
};

const SkillRow = ({ skill }: { skill: SkillSummary }) => {
  const t = useTranslations("skills");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [on, setOn] = useState(skill.enabled);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <li className="flex min-h-16 items-start gap-3 px-4 py-3">
      <Sparkles className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn("truncate font-medium", !on && "text-muted-foreground")}
        >
          /{skill.name}
        </span>
        <span className="text-muted-foreground line-clamp-2 text-sm">
          {skill.description}
        </span>
        <span className="text-muted-foreground text-xs">
          {t("meta", {
            files: skill.files,
            when: format.relativeTime(new Date(skill.updatedAt), now),
          })}
        </span>
      </div>
      {confirm ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button onClick={() => setConfirm(false)} size="sm" variant="ghost">
            {t("cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                await removeSkill(skill.id);
              })
            }
            size="sm"
            variant="destructive"
          >
            {t("delete")}
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            aria-label={
              on
                ? t("turnOff", { name: skill.name })
                : t("turnOn", { name: skill.name })
            }
            checked={on}
            onCheckedChange={(next) => {
              setOn(next);
              start(async () => {
                if (!(await toggleSkill(skill.id, next))) {
                  setOn(!next);
                }
              });
            }}
          />
          <Button
            aria-label={t("deleteAsk", { name: skill.name })}
            onClick={() => setConfirm(true)}
            size="icon-sm"
            variant="ghost"
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
};

export const SkillList = ({ skills }: { skills: SkillSummary[] }) => {
  const t = useTranslations("skills");
  const zipInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();

  const upload = (what: Upload, replace = false) =>
    start(async () => {
      const result = await send(what, replace);
      setOutcome(result);
      if (result.kind === "ok") {
        await refreshSkills();
      }
    });

  return (
    <section className="flex flex-col gap-4">
      <div
        className={cn(
          "flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 transition-colors duration-150",
          over && "border-foreground/40 bg-muted/50"
        )}
        onDragLeave={() => setOver(false)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          // A dropped .zip goes as it is; a folder is picked with the button, which gives each file its path.
          const [file] = e.dataTransfer.files;
          if (file) {
            upload({ zip: file });
          }
        }}
      >
        <p className="text-muted-foreground text-sm">{t("dropHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() => zipInput.current?.click()}
            size="sm"
            variant="outline"
          >
            <FileArchive />
            {t("pickZip")}
          </Button>
          <Button
            disabled={pending}
            onClick={() => folderInput.current?.click()}
            size="sm"
            variant="outline"
          >
            <FolderUp />
            {t("pickFolder")}
          </Button>
        </div>
        <input
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) {
              upload({ zip: file });
            }
          }}
          ref={zipInput}
          type="file"
        />
        <input
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length > 0) {
              upload({ files });
            }
          }}
          ref={folderInput}
          type="file"
          // A folder, not files: the browser gives each file its path inside it.
          {...{ webkitdirectory: "" }}
        />
        {pending && (
          <p className="text-muted-foreground text-sm">{t("importing")}</p>
        )}
        {!pending && outcome?.kind === "ok" && (
          <output className="text-sm">
            {outcome.replaced ? t("replaced") : t("imported")}
          </output>
        )}
        {!pending && outcome?.kind === "failed" && (
          <p className="text-destructive text-sm" role="alert">
            {t("failed")}
          </p>
        )}
        {!pending && outcome?.kind === "problem" && (
          <div className="flex flex-wrap items-center gap-2" role="alert">
            <p className="text-destructive text-sm">
              {t(`problem.${outcome.problem}`)}
            </p>
            {outcome.retry && (
              <Button
                onClick={() => outcome.retry && upload(outcome.retry, true)}
                size="sm"
                variant="outline"
              >
                {t("replace")}
              </Button>
            )}
          </div>
        )}
      </div>
      {skills.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {skills.map((s) => (
            <SkillRow key={s.id} skill={s} />
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">{t("note")}</p>
    </section>
  );
};
