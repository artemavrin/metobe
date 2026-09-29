"use client";

import { Button } from "@metobe/ui/components/button";
import { Laptop, Smartphone } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { revokeOtherSessions, revokeSession } from "./actions";

interface SessionRow {
  token: string;
  ip: string | null;
  updatedAt: string;
  device: { browser: string | null; system: string | null };
}

// Where the account is signed in (sign-in is by email code, so there is no password to guard): each session with
// its device and when it was last active, and a way out of the ones that are not this.

const DeviceIcon = ({ system }: { system: string | null }) =>
  system === "iOS" || system === "Android" ? <Smartphone /> : <Laptop />;

export const Sessions = ({
  sessions,
  currentToken,
}: {
  sessions: SessionRow[];
  currentToken: string;
}) => {
  const t = useTranslations("profile.sessions");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [pending, start] = useTransition();
  const others = sessions.filter((s) => s.token !== currentToken);
  return (
    <Section
      action={
        others.length > 0 && (
          <Button
            disabled={pending}
            onClick={() => start(() => revokeOtherSessions())}
            size="sm"
            variant="outline"
          >
            {t("revokeOthers")}
          </Button>
        )
      }
      title={t("title")}
    >
      <Rows>
        {sessions.map((s) => {
          const mine = s.token === currentToken;
          const name =
            [s.device.browser, s.device.system]
              .filter(Boolean)
              .join(` ${t("on")} `) || t("unknown");
          const at = new Date(s.updatedAt);
          return (
            <Row
              action={
                !mine && (
                  <Button
                    disabled={pending}
                    onClick={() => start(() => revokeSession(s.token))}
                    size="sm"
                    variant="ghost"
                  >
                    {t("revoke")}
                  </Button>
                )
              }
              hint={[
                mine
                  ? t("thisDevice")
                  : format.relativeTime(at > now ? now : at, now),
                s.ip,
              ]
                .filter(Boolean)
                .join(" · ")}
              key={s.token}
              label={name}
            >
              <span className="text-muted-foreground [&_svg]:size-4">
                <DeviceIcon system={s.device.system} />
              </span>
            </Row>
          );
        })}
      </Rows>
    </Section>
  );
};
