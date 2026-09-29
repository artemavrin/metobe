import { usageOfMonth } from "@metobe/core/account";
import { Button } from "@metobe/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";

import {
  SettingsHeader,
  SettingsPageFrame,
} from "@/components/settings/settings-shell";
import { getSettingsViewer } from "@/lib/settings-access";
import { monthOf } from "@/lib/usage-month";

// «Расходы»: what the user used in a month — requests, tokens, cost — by model. Cost is in each model's own
// currency, side by side: rubles and dollars are not added.

const UsagePage = async ({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) => {
  const [{ user }, { m }, t, format] = await Promise.all([
    getSettingsViewer(),
    searchParams,
    getTranslations("usage"),
    getFormatter(),
  ]);
  const month = monthOf(m);
  const rows = user ? await usageOfMonth(user.id, month) : [];
  const money = (cost: { amount: number; currency: string }[]) =>
    cost.length === 0
      ? "—"
      : cost
          .map((c) =>
            format.number(c.amount, {
              currency: c.currency,
              maximumFractionDigits: 2,
              style: "currency",
            })
          )
          .join(" · ");
  const sum = (pick: (r: (typeof rows)[number]) => number) =>
    rows.reduce((total, r) => total + pick(r), 0);
  // The month's total per currency.
  const totals = new Map<string, number>();
  for (const r of rows) {
    for (const c of r.cost) {
      totals.set(c.currency, (totals.get(c.currency) ?? 0) + c.amount);
    }
  }
  const tokens = (n: number) =>
    format.number(n, { maximumFractionDigits: 1, notation: "compact" });
  return (
    <SettingsPageFrame>
      <SettingsHeader description={t("description")} title={t("title")} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            aria-label={t("previous")}
            nativeButton={false}
            render={<Link href={`/settings/usage?m=${month.previous}`} />}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-32 text-center text-sm font-medium first-letter:uppercase">
            {format.dateTime(month.from, {
              month: "long",
              timeZone: "UTC",
              year: "numeric",
            })}
          </span>
          {month.next ? (
            <Button
              aria-label={t("next")}
              nativeButton={false}
              render={<Link href={`/settings/usage?m=${month.next}`} />}
              size="icon-sm"
              variant="ghost"
            >
              <ChevronRight />
            </Button>
          ) : (
            <Button
              aria-label={t("next")}
              disabled
              size="icon-sm"
              variant="ghost"
            >
              <ChevronRight />
            </Button>
          )}
        </div>
        {rows.length > 0 && (
          <p className="text-muted-foreground text-sm tabular-nums">
            {t("summary", {
              cost: money(
                [...totals].map(([currency, amount]) => ({ amount, currency }))
              ),
              requests: format.number(sum((r) => r.requests)),
            })}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="text-muted-foreground text-left text-xs">
                <th className="px-3 py-2 font-medium">{t("model")}</th>
                <th className="px-3 py-2 text-right font-medium">
                  {t("requests")}
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  {t("input")}
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  {t("output")}
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  {t("cost")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr className="border-t" key={`${r.source}|${r.model}`}>
                  <td className="px-3 py-2">
                    <span className="font-medium">
                      {r.model || t("removed")}
                    </span>
                    {r.source && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {r.source}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {format.number(r.requests)}
                  </td>
                  <td
                    className="px-3 py-2 text-right tabular-nums"
                    title={t("cached", {
                      count: format.number(r.cacheReadTokens),
                    })}
                  >
                    {tokens(r.inputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {tokens(r.outputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {money(r.cost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsPageFrame>
  );
};

export default UsagePage;
