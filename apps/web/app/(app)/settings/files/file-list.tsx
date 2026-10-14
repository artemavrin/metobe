"use client";

import type { FileKind } from "@metobe/contracts/files";
import { Button } from "@metobe/ui/components/button";
import {
  ChartNoAxesColumn,
  ExternalLink,
  FileText,
  ImageIcon,
  MessageSquare,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import Link from "next/link";

import { useSize } from "@/components/settings/use-size";

interface UserFile {
  id: string;
  name: string;
  kind: FileKind;
  size: number;
  createdAt: string;
  chatId: string;
  chatTitle: string;
}

const ICON: Record<FileKind, typeof FileText> = {
  doc: FileText,
  image: ImageIcon,
  pdf: FileText,
  sheet: ChartNoAxesColumn,
  text: FileText,
};

/** The files, each a row: what it is, when and in which chat it was sent, its size; open it, or go to its chat. */
export const FileList = ({ files }: { files: UserFile[] }) => {
  const t = useTranslations("myFiles");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const size = useSize();
  if (files.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("empty")}{" "}
        <Link
          className="text-foreground underline-offset-2 hover:underline"
          href="/"
        >
          {t("toNewChat")}
        </Link>
      </p>
    );
  }
  const total = files.reduce((sum, f) => sum + f.size, 0);
  return (
    <section className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm tabular-nums">
        {t("summary", { count: files.length, size: size(total) })}
      </p>
      <ul className="divide-y rounded-lg border">
        {files.map((f) => {
          const Icon = ICON[f.kind];
          return (
            <li
              className="flex min-h-14 items-center gap-3 px-4 py-2.5"
              key={f.id}
            >
              <Icon className="text-muted-foreground size-4 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{f.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {format.relativeTime(new Date(f.createdAt), now)} ·{" "}
                  {size(f.size)} · {f.chatTitle}
                </span>
              </div>
              <Button
                aria-label={t("toChat", { chat: f.chatTitle })}
                nativeButton={false}
                render={<Link href={`/chat/${f.chatId}`} />}
                size="icon-sm"
                variant="ghost"
              >
                <MessageSquare />
              </Button>
              <Button
                aria-label={t("open", { name: f.name })}
                nativeButton={false}
                render={
                  // oxlint-disable-next-line react/jsx-no-target-blank -- our own route, same origin
                  <a
                    aria-label={t("open", { name: f.name })}
                    href={`/api/files/${f.id}`}
                    rel="noopener"
                    target="_blank"
                  />
                }
                size="icon-sm"
                variant="ghost"
              >
                <ExternalLink />
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-xs">{t("note")}</p>
    </section>
  );
};
