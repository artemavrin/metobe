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

/** «Soon» beside a thing the composer will add later. */
const Soon = () => {
  const t = useTranslations("chat.add");
  return (
    <span className="text-muted-foreground ml-auto pl-3 text-xs">
      {t("soon")}
    </span>
  );
};

/**
 * The composer's «+»: what a question can bring along. Files open the system picker; skills come later (shown, not yet
 * usable); an MCP server is mentioned from here as from `@` — its badge where the caret was, a sign-in first when it
 * needs one.
 */
export const AddMenu = ({
  servers,
  mentioned,
  onPick,
  onFiles,
  field,
}: {
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
        <DropdownMenuItem disabled>
          <Sparkles />
          {t("skills")}
          <Soon />
        </DropdownMenuItem>
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
