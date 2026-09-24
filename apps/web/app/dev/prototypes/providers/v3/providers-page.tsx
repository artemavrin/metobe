"use client";

// «Провайдеры»: who made the models. Name and logo are what users see in the chat's model picker; the admin can
// rename a provider and change its logo (built-in set or an uploaded image). Models come from any source.
import { Button } from "@purr/ui/components/button";
import { Input } from "@purr/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@purr/ui/components/popover";
import { Badge } from "@purr/ui/components/reui/badge";
import { Switch } from "@purr/ui/components/switch";
import { cn } from "@purr/ui/lib/utils";
import { ArrowUp, ChevronDown, ImageUp, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";

import { BrandLogo, LOGOS, SOURCE_LOGO } from "../../_p7/brand";
import { byNewest, fmtContext, fmtPrice, isNew, providerBy } from "../../_p7/mock";
import { NO_AUTOFILL } from "../../_p7/shared";
import type { ProviderInfo, Settings } from "./state";

export const ProvidersPage = ({ s }: { s: Settings }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const current = s.providers.find((p) => p.slug === selected) ?? s.providers[0];
  return (
    <div className="flex h-full min-h-0 text-sm">
      <aside className="flex w-80 shrink-0 flex-col border-r">
        <div className="px-5 pt-6 pb-3">
          <h1 className="text-base font-semibold">Провайдеры</h1>
          <p className="text-muted-foreground text-xs">Кто сделал модели. Логотип и название видны в выборе модели в чате.</p>
        </div>
        <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
          {s.providers.map((p) => {
            const on = p.models.filter((m) => m.on).length;
            const sources = [...new Set(p.models.map((m) => m.source))];
            const active = p.slug === current?.slug;
            return (
              <button
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 ease-out active:scale-[0.99]",
                  active ? "bg-muted" : "hover:bg-muted/50"
                )}
                key={p.slug}
                onClick={() => setSelected(p.slug)}
                type="button"
              >
                <BrandLogo label={p.title} logo={p.logo} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{p.title}</span>
                  <span className="text-muted-foreground flex items-center gap-1 truncate text-xs">
                    через
                    {sources.map((k) => (
                      <BrandLogo key={k} label={providerBy(k).title} logo={SOURCE_LOGO[k]} size={14} tile={false} />
                    ))}
                  </span>
                </span>
                <span className={cn("text-xs tabular-nums", on ? "" : "text-muted-foreground")}>
                  {on}
                  <span className="text-muted-foreground">/{p.models.length}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">{current && <ProviderDetail key={current.slug} p={current} s={s} />}</main>
    </div>
  );
};

const LogoPicker = ({ p, s }: { p: ProviderInfo; s: Settings }) => {
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            aria-label="Сменить логотип"
            className="group relative rounded-[28%] transition-transform duration-150 ease-out active:scale-[0.97]"
            type="button"
          />
        }
      >
        <BrandLogo label={p.title} logo={p.logo} size={64} />
        <span className="bg-foreground/35 text-background absolute inset-0 backdrop-blur-[2px] flex items-center justify-center rounded-[28%] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <ImageUp className="size-5" />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Логотип провайдера</span>
          <div className="grid grid-cols-7 gap-1.5">
            {Object.entries(LOGOS).map(([slug, l]) => (
              <button
                aria-label={l.label}
                className={cn("rounded-lg p-1 transition-colors", p.logo === slug ? "bg-muted ring-primary ring-2" : "hover:bg-muted")}
                key={slug}
                onClick={() => {
                  s.setOverride(p.slug, { logo: slug });
                  setOpen(false);
                }}
                title={l.label}
                type="button"
              >
                <BrandLogo label={l.label} logo={slug} size={28} />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button onClick={() => file.current?.click()} size="sm" variant="outline">
              <ImageUp /> Загрузить своё
            </Button>
            <Button
              onClick={() => {
                s.setOverride(p.slug, { logo: undefined });
                setOpen(false);
              }}
              size="sm"
              variant="ghost"
            >
              <RotateCcw /> Как было
            </Button>
          </div>
          <input
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => {
                s.setOverride(p.slug, { logo: String(reader.result) });
                setOpen(false);
              };
              reader.readAsDataURL(f);
            }}
            ref={file}
            type="file"
          />
          <span className="text-muted-foreground text-xs">PNG или SVG, квадрат. В продукте файл ляжет в S3.</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** What a user sees in the chat composer's model picker. */
const ChatPreview = ({ p }: { p: ProviderInfo }) => {
  const first = [...p.models].sort((a, b) => byNewest(a.model, b.model)).find((m) => m.on) ?? p.models[0];
  return (
    <div className="bg-background flex flex-col gap-2 rounded-xl border p-3 shadow-[0_1px_2px_-1px_rgba(0,0,0,0.06)]">
      <span className="text-muted-foreground text-[11px]">Спросите что-нибудь…</span>
      <div className="flex items-center justify-between">
        <span className="hover:bg-muted flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium">
          <BrandLogo label={p.title} logo={p.logo} size={18} tile={false} />
          {first?.model.title ?? p.title}
          <ChevronDown className="text-muted-foreground size-3" />
        </span>
        <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full">
          <ArrowUp className="size-3.5" />
        </span>
      </div>
    </div>
  );
};

const ProviderDetail = ({ p, s }: { p: ProviderInfo; s: Settings }) => {
  const [name, setName] = useState(p.title);
  const renamed = Boolean(s.overrides[p.slug]?.title);
  const rows = [...p.models].sort((a, b) => byNewest(a.model, b.model));
  const on = rows.filter((r) => r.on).length;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-10 pt-8 pb-24">
      <header className="grid grid-cols-[auto_1fr_280px] items-center gap-6">
        <LogoPicker p={p} s={s} />
        <div className="flex flex-col gap-1">
          <Input
            {...NO_AUTOFILL}
            aria-label="Название провайдера"
            className="h-auto border-transparent bg-transparent px-1.5 py-0.5 text-xl font-semibold tracking-tight shadow-none hover:border-border md:text-xl focus-visible:border-ring dark:bg-transparent"
            onBlur={() => name.trim() && name !== p.title && s.setOverride(p.slug, { title: name.trim() })}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            value={name}
          />
          <span className="text-muted-foreground px-1.5 text-xs">
            {on} из {p.models.length} моделей в чате{renamed && " · название изменено"}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">Как видно в чате</span>
          <ChatPreview p={p} />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          Модели <span className="text-muted-foreground ml-1 font-normal">из всех источников</span>
        </h2>
        <ul className="divide-y overflow-hidden rounded-lg border">
          {rows.map(({ model: m, source, on: visible }) => {
            const src = s.panel.list.find((x) => x.kind === source);
            const id = `pm-${source}-${m.id}`;
            return (
              <li key={`${source}:${m.id}`}>
                <label className="hover:bg-muted/30 flex cursor-pointer items-center gap-3 px-4 py-2.5" htmlFor={id}>
                  <span className={cn("flex min-w-0 flex-1 items-center gap-2", !visible && "text-muted-foreground")}>
                    <span className="truncate font-medium">{m.title}</span>
                    {isNew(m) && (
                      <Badge size="sm" variant="info-light">
                        новая
                      </Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <BrandLogo label={providerBy(source).title} logo={SOURCE_LOGO[source]} size={16} tile={false} />
                    {providerBy(source).title}
                  </span>
                  <span className="text-muted-foreground w-14 text-right text-xs tabular-nums">{fmtContext(m.context)}</span>
                  <span className="text-muted-foreground w-28 text-right text-xs tabular-nums">{fmtPrice(m)}</span>
                  <Switch
                    checked={Boolean(src?.models.has(m.id))}
                    disabled={!src || src.health.state === "error" || src.enabled === false}
                    id={id}
                    onCheckedChange={(v) => s.panel.toggleModel(source, m.id, v)}
                    size="sm"
                  />
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-muted-foreground text-xs">
          Одна модель может приходить через несколько источников — например, Claude по ключу Anthropic и через AI Gateway. Переключатель включает её в конкретном источнике.
        </p>
      </section>
    </div>
  );
};
