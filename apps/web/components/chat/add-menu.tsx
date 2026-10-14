"use client";

import type { ChatServer } from "@metobe/core/mcp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { cn } from "@metobe/ui/lib/utils";
import { Check, Paperclip, Plug, Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import type { ChatSkill } from "@/components/chat/skill-menu";

/**
 * The composer's «+»: what a question can bring along. Files open the system picker; a skill and an MCP server are
 * picked from here as from `/` and `@` — the badge where the caret was (a server asks for a sign-in first when it
 * needs one). On a phone this is the way in: `/` and `@` are awkward on a touch keyboard.
 */
export const AddMenu = ({
  servers,
  skills,
  mentioned,
  onPick,
  onPickSkill,
  onFiles,
  field,
}: {
  /** The skills the user may pick. */
  skills: ChatSkill[];
  onPickSkill: (skill: ChatSkill) => void;
  /** Opens the file picker. */
  onFiles: () => void;
  servers: ChatServer[];
  /** The servers the draft already mentions: marked, not added twice. */
  mentioned: () => Set<string>;
  onPick: (server: ChatServer) => void;
  /** Where the focus goes back when the menu closes: the text, not the button. */
  field: () => HTMLElement | null;
}) => {
  const t = useTranslations("chat.add");
  const tm = useTranslations("chat.mcp");
  const [taken, setTaken] = useState<Set<string>>(new Set());
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          setTaken(mentioned());
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <button
            aria-label={t("label")}
            className={cn(
              "text-muted-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-full",
              "hover:bg-foreground/[0.06] hover:text-foreground data-[popup-open]:bg-foreground/[0.06] data-[popup-open]:text-foreground active:scale-[0.97]",
              "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease,color_150ms_ease] motion-reduce:active:scale-100"
            )}
            title={t("label")}
            type="button"
          />
        }
      >
        <Plus className="size-[18px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
        finalFocus={() => field() ?? true}
        side="top"
        sideOffset={8}
      >
        <DropdownMenuItem onClick={onFiles}>
          <Paperclip />
          {t("files")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sparkles />
            {t("skills")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="w-72"
            finalFocus={() => field() ?? true}
          >
            {skills.length === 0 && (
              <p className="text-muted-foreground px-2 py-2 text-sm">
                {t("noSkills")}
              </p>
            )}
            {skills.map((skill) => {
              const added = taken.has(skill.id);
              return (
                <DropdownMenuItem
                  className="items-start gap-2.5 py-1.5"
                  disabled={added}
                  key={skill.id}
                  onClick={() => onPickSkill(skill)}
                >
                  <span className="bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5">
                    <Sparkles />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">/{skill.name}</span>
                    <span className="text-muted-foreground line-clamp-2 text-xs">
                      {skill.description}
                    </span>
                  </span>
                  {added && <Check className="text-muted-foreground" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Plug />
            {t("mcp")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="w-72"
            finalFocus={() => field() ?? true}
          >
            {servers.length === 0 && (
              <p className="text-muted-foreground px-2 py-2 text-sm">
                {t("noServers")}
              </p>
            )}
            {servers.map((server) => {
              let hint = tm("tools", { count: server.toolCount });
              if (server.signIn === "self") {
                hint = tm("signIn");
              } else if (server.signIn === "admin") {
                hint = tm("adminOnly");
              }
              const added = taken.has(server.id);
              return (
                <DropdownMenuItem
                  className="gap-2.5 py-1.5"
                  disabled={server.signIn === "admin" || added}
                  key={server.id}
                  onClick={() => onPick(server)}
                >
                  <BrandLogo
                    label={server.title}
                    logo={server.logo ?? undefined}
                    size={24}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{server.title}</span>
                    <span
                      className={cn(
                        "truncate text-xs",
                        server.signIn === "self"
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-muted-foreground"
                      )}
                    >
                      {hint}
                    </span>
                  </span>
                  {added && <Check className="text-muted-foreground" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
