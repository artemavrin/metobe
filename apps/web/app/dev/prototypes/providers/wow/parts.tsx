"use client";

// Pieces shared by the «вау» directions: the models switch list in the onboarding's visual language.
import { InputGroup, InputGroupAddon, InputGroupInput } from "@purr/ui/components/input-group";
import { Badge } from "@purr/ui/components/reui/badge";
import { Switch } from "@purr/ui/components/switch";
import { cn } from "@purr/ui/lib/utils";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { byNewest, fmtContext, fmtPrice, isNew, providerBy } from "../../_p7/mock";
import { NO_AUTOFILL } from "../../_p7/shared";
import type { Panel, PanelProvider } from "../panel/common";

export const ModelSwitchList = ({ panel, p, className }: { panel: Panel; p: PanelProvider; className?: string }) => {
  const spec = providerBy(p.kind);
  const [q, setQ] = useState("");
  const many = spec.models.length > 8;
  const rows = useMemo(
    () => [...spec.models].sort(byNewest).filter((m) => `${m.title} ${m.id} ${m.vendor}`.toLowerCase().includes(q.trim().toLowerCase())),
    [spec, q]
  );
  const vendors = new Set(spec.models.map((m) => m.vendor)).size > 1;
  return (
    <div className="flex flex-col gap-2">
      {many && (
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput {...NO_AUTOFILL} onChange={(e) => setQ(e.target.value)} placeholder="Найти модель" value={q} />
        </InputGroup>
      )}
      <ul className={cn("divide-y overflow-y-auto overscroll-contain rounded-xl border", className)}>
        {rows.map((m) => {
          const on = p.models.has(m.id);
          const id = `sw-${p.kind}-${m.id}`;
          return (
            <li key={m.id}>
              <label className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 px-3 py-2 text-sm" htmlFor={id}>
                <span className={cn("flex min-w-0 flex-1 items-center gap-2", !on && "text-muted-foreground")}>
                  <span className="truncate font-medium">{m.title}</span>
                  {isNew(m) && (
                    <Badge size="sm" variant="info-light">
                      новая
                    </Badge>
                  )}
                  {vendors && <span className="text-muted-foreground truncate text-xs">{m.vendor}</span>}
                </span>
                <span className="text-muted-foreground hidden text-xs tabular-nums sm:inline">{fmtContext(m.context)}</span>
                <span className="text-muted-foreground w-28 shrink-0 text-right text-xs tabular-nums">{fmtPrice(m)}</span>
                <Switch checked={on} id={id} onCheckedChange={(v) => panel.toggleModel(p.kind, m.id, v)} size="sm" />
              </label>
            </li>
          );
        })}
        {!rows.length && <li className="text-muted-foreground px-3 py-6 text-center text-sm">Ничего не нашлось</li>}
      </ul>
    </div>
  );
};
