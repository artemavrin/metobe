"use client";

// A list → detail settings section as data: its entries, how to add one, and the open entry's detail. Layouts
// (a column, a nested menu, a switcher, a drill-in sidebar) render the same model, so they differ only in placement.
import { type ReactNode, useState } from "react";

import type { SettingsSection } from "../../app-shell/data";
import { BrandLogo } from "../../_p7/brand";
import { ConnectDialog } from "../../_p7/connect-dialog";
import { visibleInChat } from "../panel/common";
import { ProviderDetail } from "./providers-page";
import { ProxyDetail, ProxyMark, proxyStatus } from "./proxies-page";
import { SourceDetail, statusOf } from "./sources-page";
import type { Settings } from "./state";

export type Entry = {
  id: string;
  title: string;
  media: (size: number) => ReactNode;
  /** Second line in roomy lists. */
  sub: ReactNode;
  /** Status dot for compact lists; `tone` colours an error. */
  dot?: string;
  tone?: "error";
  count?: ReactNode;
};

export type SectionModel = {
  title: string;
  meta: string;
  entries: Entry[];
  activeId: string | undefined;
  select: (id: string) => void;
  add?: { label: string; run: () => void };
  detail: ReactNode;
  /** Dialogs the section owns (rendered once, wherever the layout puts it). */
  extra?: ReactNode;
};

export type ListSection = "providers" | "vendors" | "proxies";
export const isListSection = (x: SettingsSection): x is ListSection => x === "providers" || x === "vendors" || x === "proxies";

export const useSections = (s: Settings): Record<ListSection, SectionModel> => {
  const [connecting, setConnecting] = useState(false);
  const { panel } = s;
  const src = panel.current;
  const inChat = panel.list.reduce((a, x) => a + visibleInChat(x), 0);
  const prov = s.currentProvider;
  const px = s.currentProxy;

  return {
    providers: {
      activeId: src?.kind,
      add: { label: "Подключить источник", run: () => setConnecting(true) },
      detail: src && <SourceDetail key={src.kind} p={src} s={s} />,
      entries: panel.list.map((x) => {
        const st = statusOf(x, s);
        const b = s.sourceOf(x.kind);
        return {
          count: visibleInChat(x),
          dot: st.dot,
          id: x.kind,
          media: (size: number) => <BrandLogo label={b.title} logo={b.logo} size={size} />,
          sub: st.text,
          title: b.title,
          tone: st.tone === "error" ? ("error" as const) : undefined,
        };
      }),
      extra: <ConnectDialog connected={panel.list.map((x) => x.kind)} onConnected={panel.add} onOpenChange={setConnecting} open={connecting} />,
      meta: `${panel.list.length} подключено · ${inChat} моделей в чате`,
      select: (id) => panel.setSelected(id as typeof panel.selected),
      title: "Источники",
    },
    proxies: {
      activeId: px?.id,
      add: { label: "Добавить прокси", run: () => s.setSelectedProxy(s.addProxy()) },
      detail: px && <ProxyDetail key={px.id} onRemoved={() => s.setSelectedProxy(s.proxies.find((x) => x.id !== px.id)?.id ?? null)} s={s} x={px} />,
      entries: s.proxies.map((x) => {
        const st = proxyStatus(x);
        return {
          dot: st.dot,
          id: x.id,
          media: (size: number) => <ProxyMark size={size} x={x} />,
          sub: `${x.type.toUpperCase()} · ${st.text}`,
          title: x.title,
          tone: st.tone === "error" ? ("error" as const) : undefined,
        };
      }),
      meta: "По умолчанию всё напрямую",
      select: (id) => s.setSelectedProxy(id),
      title: "Прокси",
    },
    vendors: {
      activeId: prov?.slug,
      detail: prov && <ProviderDetail key={prov.slug} p={prov} s={s} />,
      entries: s.providers.map((p) => {
        const on = p.models.filter((m) => m.on).length;
        return {
          count: (
            <>
              {on}
              <span className="text-muted-foreground">/{p.models.length}</span>
            </>
          ),
          id: p.slug,
          media: (size: number) => <BrandLogo label={p.title} logo={p.logo} size={size} />,
          sub: `${on} из ${p.models.length} в чате`,
          title: p.title,
        };
      }),
      meta: "Кто сделал модели",
      select: (id) => s.setSelectedProvider(id),
      title: "Провайдеры",
    },
  };
};
