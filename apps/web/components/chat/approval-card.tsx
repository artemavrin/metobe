"use client";

import type { ChatServer } from "@metobe/core/mcp";
import { Button } from "@metobe/ui/components/button";
import { Mail, Sparkles, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Streamdown } from "streamdown";

import { BrandLogo } from "@/components/brand-logo";
import type { ToolPart } from "@/lib/answer-work";

// «Ask first?» in the answer itself, as «connect X to go on» is (prototype P8, «Плашка»): the call waits on the
// user's yes, so it stands where the eye is, not folded in the work. A letter shows as the letter it would be.

const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 fill-mode-both duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

interface Letter {
  to?: string[];
  cc?: string[];
  subject?: string;
  text?: string;
  mailbox?: string;
}

/** The letter as it would go: who to, the subject, the words. */
const LetterPreview = ({ letter }: { letter: Letter }) => {
  const t = useTranslations("chat.approval");
  const rows: [string, string | undefined][] = [
    [t("from"), letter.mailbox],
    [t("to"), letter.to?.join(", ")],
    [t("cc"), letter.cc?.join(", ")],
    [t("subject"), letter.subject],
  ];
  return (
    <div className="bg-background flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([label, value]) =>
          value ? (
            <div className="contents" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ) : null
        )}
      </dl>
      {letter.text && (
        // The Markdown as it will look in the letter.
        <div className="max-h-64 overflow-auto border-t pt-2">
          <Streamdown>{letter.text}</Streamdown>
        </div>
      )}
    </div>
  );
};

interface SkillDraft {
  name?: string;
  description?: string;
  instructions?: string;
  replace?: boolean;
}

/** The skill as it would be kept: its name, what it is for, its instructions. */
const SkillPreview = ({ skill }: { skill: SkillDraft }) => {
  const t = useTranslations("chat.approval");
  return (
    <div className="bg-background flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium break-words">/{skill.name}</span>
        <span className="text-muted-foreground break-words">
          {skill.description}
        </span>
        {skill.replace && (
          <span className="text-destructive">{t("skillReplaces")}</span>
        )}
      </div>
      {skill.instructions && (
        <div className="max-h-64 overflow-auto border-t pt-2">
          <Streamdown>{skill.instructions}</Streamdown>
        </div>
      )}
    </div>
  );
};

export const ApprovalCard = ({
  call,
  label,
  server,
  onApprove,
}: {
  call: Extract<ToolPart, { state: "approval-requested" }>;
  /** The tool's name as people read it. */
  label: string;
  server?: ChatServer;
  onApprove: (approvalId: string, approved: boolean) => void;
}) => {
  const t = useTranslations("chat.approval");
  const letter = call.toolName === "email_send";
  const skill = call.toolName === "save_skill";
  // A letter and a skill are shown as what they would be; their buttons say what happens.
  const words = (() => {
    if (letter) {
      return {
        deny: t("dontSend"),
        hint: t("letterHint"),
        ok: t("send"),
        title: t("letterTitle"),
      };
    }
    if (skill) {
      return {
        deny: t("skillDont"),
        hint: t("skillHint"),
        ok: t("skillSave"),
        title: t("skillTitle"),
      };
    }
    return {
      deny: t("deny"),
      hint: t("hint", { server: server?.title ?? label }),
      ok: t("approve"),
      title: t("title", { tool: label }),
    };
  })();
  let icon: ReactNode = <Wrench className="size-4" />;
  if (server) {
    icon = (
      <BrandLogo
        label={server.title}
        logo={server.logo ?? undefined}
        size={32}
      />
    );
  } else if (letter) {
    icon = <Mail className="size-4" />;
  } else if (skill) {
    icon = <Sparkles className="size-4" />;
  }
  return (
    <div
      className={`bg-muted/60 flex w-full flex-col gap-3 rounded-xl px-3 py-2.5 ${ENTER}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {server ? (
          icon
        ) : (
          <span className="bg-background text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md border">
            {icon}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col text-sm">
          <span className="font-medium">{words.title}</span>
          <span className="text-muted-foreground">{words.hint}</span>
        </div>
      </div>
      {letter && <LetterPreview letter={(call.input ?? {}) as Letter} />}
      {skill && <SkillPreview skill={(call.input ?? {}) as SkillDraft} />}
      {!letter && !skill && call.input !== undefined && (
        <pre className="bg-background text-muted-foreground max-h-48 overflow-auto rounded-lg border p-2 text-xs whitespace-pre-wrap">
          {JSON.stringify(call.input, null, 2)}
        </pre>
      )}
      <div className="flex items-center justify-end gap-1">
        <Button
          onClick={() => onApprove(call.approval.id, false)}
          size="sm"
          variant="ghost"
        >
          {words.deny}
        </Button>
        <Button onClick={() => onApprove(call.approval.id, true)} size="sm">
          {words.ok}
        </Button>
      </div>
    </div>
  );
};
