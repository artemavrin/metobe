"use client";

import { Button } from "@metobe/ui/components/button";
import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";

/** A page's head on «Память»: «назад» on a phone, a face, the title and a line under it, an action on the right. */
export const Header = ({
  title,
  hint,
  onBack,
  avatar,
  action,
}: {
  title: string;
  hint?: React.ReactNode;
  onBack?: () => void;
  avatar?: React.ReactNode;
  action?: React.ReactNode;
}) => {
  const t = useTranslations("memory");
  return (
    <header className="flex items-center gap-3">
      {onBack && (
        <Button
          aria-label={t("back")}
          onClick={onBack}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
      )}
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-lg font-semibold tracking-tight break-words">
          {title}
        </h2>
        {typeof hint === "string" ? (
          <span className="text-muted-foreground text-sm">{hint}</span>
        ) : (
          hint
        )}
      </div>
      {action}
    </header>
  );
};
