import { APP_VERSION } from "@metobe/core/version";
import { notesUpTo } from "@metobe/core/whats-new-notes";
import type { Messages } from "@metobe/i18n/messages";
import { Badge } from "@metobe/ui/components/reui/badge";
import { getFormatter, getTranslations } from "next-intl/server";

import { getSettingsViewer } from "@/lib/settings-access";

// «Что нового в Metobe» (docs/RELEASE.md): every version of this build as a post, newest first — what it brought, in
// the window's own words: the big changes with what they let you do, «И ещё», and an admin's part for admins. The
// window links here; it is also where a missed release can be read later. Inside Metobe, not a site of its own: an
// installation may have no way out to the internet, and this page says exactly what this one runs.

type ChangeId = keyof Messages["whatsNew"]["changes"];

const WhatsNewPage = async () => {
  const [{ admin }, t, format] = await Promise.all([
    getSettingsViewer(),
    getTranslations("whatsNew"),
    getFormatter(),
  ]);
  const notes = notesUpTo(APP_VERSION);
  const title = (id: string) => t(`changes.${id as ChangeId}.title`);
  const text = (id: string) => t(`changes.${id as ChangeId}.text`);

  const lines = (heading: string, ids: string[], note?: string) =>
    ids.length > 0 && (
      <section className="mt-8 flex flex-col gap-3">
        <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-[0.18em] uppercase">
          {heading}
          {note && (
            <span className="tracking-normal normal-case">· {note}</span>
          )}
        </h3>
        <ul className="flex flex-col gap-2.5">
          {ids.map((id) => (
            <li className="text-sm leading-relaxed" key={id}>
              <span className="font-medium">{title(id)}.</span>{" "}
              <span className="text-muted-foreground">{text(id)}</span>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-6 pt-8 pb-24 md:pt-12">
        <header className="flex flex-col gap-1.5 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("history.title")}
          </h1>
          <p className="text-muted-foreground">{t("history.description")}</p>
        </header>
        {notes.length === 0 && (
          <p className="text-muted-foreground text-sm">{t("history.empty")}</p>
        )}
        {notes.map((n) => (
          <article
            className="border-t py-10"
            id={`v${n.version}`}
            key={n.version}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-semibold tracking-tight">
                {t("history.version", { version: `v${n.version}` })}
              </h2>
              <time className="text-muted-foreground text-sm" dateTime={n.date}>
                {format.dateTime(new Date(`${n.date}T12:00:00`), {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
              {n.version === APP_VERSION && (
                <Badge size="sm" variant="success-light">
                  {t("history.current")}
                </Badge>
              )}
            </div>
            {n.featured.length > 0 && (
              <ul className="mt-6 flex flex-col gap-6">
                {n.featured.map((id) => (
                  <li className="flex flex-col gap-1" key={id}>
                    <span className="text-primary text-xs font-medium tracking-[0.14em] uppercase">
                      {t(`changes.${id as ChangeId}.short` as never)}
                    </span>
                    <h3 className="font-medium">{title(id)}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {text(id)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {lines(t("more"), n.more)}
            {admin && lines(t("admin"), n.admin, t("adminBadge"))}
          </article>
        ))}
      </div>
    </div>
  );
};

export default WhatsNewPage;
