"use client";

import { Button } from "@metobe/ui/components/button";
import { Alert, AlertDescription } from "@metobe/ui/components/reui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { Switch } from "@metobe/ui/components/switch";
import { Textarea } from "@metobe/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@metobe/ui/components/toggle-group";
import { cn } from "@metobe/ui/lib/utils";
import { CircleAlert, RefreshCw } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";
import { SettingsHeader, SettingsPageFrame } from "@/components/settings/settings-shell";

import { useProto } from "../memory/frame";
import { SANDBOX, mask, uniqueHidden, valuesWord } from "./data";
import type { Kind } from "./data";
import { SettingsWindow } from "./frame";
import { KINDS, Legend, MaskedText, OriginalSwitch, Well } from "./parts";

// Сцена «Настройки» (З6): раздел администратора «Защита данных» в виде остальных настроек (P7: строки, справа значение).
// Включено ли, служба и её состояние (как у поиска), где применять, что делать с каждым типом, локальные источники,
// режим, срок хранения записей и песочница. Ручка `svc=ok|down` — служба отвечает или нет.

type Action = "hide" | "keep" | "block";
const ACTIONS: Record<Action, string> = { block: "Не отправлять запрос", hide: "Скрывать", keep: "Оставлять" };

const TYPES: { kind: Kind; example: string; default: Action }[] = [
  { default: "hide", example: "Персона_Женщина_7f3a", kind: "person" },
  { default: "hide", example: "[[PHONE_a91c02]]", kind: "phone" },
  { default: "hide", example: "[[EMAIL_3b7e11]]", kind: "email" },
  { default: "hide", example: "[[ID_DOCUMENT_c40d9e]]", kind: "document" },
  { default: "hide", example: "[[ADDRESS_5e2f10]]", kind: "address" },
  { default: "hide", example: "[[BANK_ACCOUNT_88aa01]]", kind: "account" },
  { default: "keep", example: "Названия компаний остаются в тексте", kind: "org" },
];

const PLACES = [
  { hint: "Сообщения, вложенные тексты, результаты тулов", id: "chat", label: "Чат" },
  { hint: "Периодические задачи и их отчёты", id: "tasks", label: "Задачи" },
  { hint: "Сообщения через бота", id: "telegram", label: "Telegram" },
  { hint: "Разбор чатов и писем в память", id: "memory", label: "Память" },
  { hint: "Названия чатов, сжатие истории", id: "service", label: "Служебные вызовы" },
];

const RETENTION: Record<string, string> = { "30": "30 дней", "7": "7 дней", chat: "Как у чата", none: "Не хранить" };

const Status = ({ down, busy }: { down: boolean; busy: boolean }) => {
  let dot = "bg-success";
  let text = "Отвечает · 38 мс";
  if (busy) {
    dot = "bg-warning animate-pulse";
    text = "Проверяю…";
  } else if (down) {
    dot = "bg-destructive";
    text = "Не отвечает: соединение отклонено";
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn("size-2 shrink-0 rounded-full", dot)} />
      <span className="min-w-0 truncate">{text}</span>
      {!busy && <span className="text-muted-foreground shrink-0 text-xs">2 мин назад</span>}
    </span>
  );
};

const Sandbox = ({ keep, block }: { keep: Kind[]; block: Kind[] }) => {
  const [text, setText] = useState(SANDBOX);
  const [original, setOriginal] = useState(false);
  const deferred = useDeferredValue(text);
  const { pieces, kept } = mask(deferred, keep);
  const hidden = uniqueHidden(pieces);
  const stop = [...new Set(hidden.filter((h) => block.includes(h.kind)).map((h) => KINDS[h.kind].label.toLowerCase()))];
  return (
    <Section meta="ничего не сохраняется" title="Проверка">
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <Textarea aria-label="Текст для проверки" className="min-h-24 text-sm" onChange={(e) => setText(e.target.value)} value={text} />
        <div className="flex min-h-6 items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">{hidden.length > 0 ? `Скрыто ${valuesWord(hidden.length)}` : "Скрывать нечего"}</span>
          {hidden.length > 0 && <OriginalSwitch on={original} onChange={setOriginal} />}
        </div>
        {stop.length > 0 && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>Запрос не уйдёт во внешнюю модель: {stop.join(", ")}</AlertDescription>
          </Alert>
        )}
        <Well>
          <MaskedText original={original} pieces={pieces} />
        </Well>
        <div className="@container">
          <Legend pieces={pieces} />
        </div>
        {kept.length > 0 && (
          <p className="text-muted-foreground border-t pt-3 text-sm">
            Оставлено открытым: {kept.map((k) => `${k.value} (${KINDS[k.kind].label.toLowerCase()})`).join(", ")}
          </p>
        )}
      </div>
    </Section>
  );
};

export const SettingsScene = () => {
  const { knobs } = useProto();
  const down = knobs.svc === "down";
  const [on, setOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [places, setPlaces] = useState<Record<string, boolean>>({ chat: true, memory: true, service: true, tasks: true, telegram: true });
  const [actions, setActions] = useState<Record<string, Action>>(Object.fromEntries(TYPES.map((t) => [t.kind, t.default])));
  const [local, setLocal] = useState(false);
  const [mode, setMode] = useState("fast");
  const [keepFor, setKeepFor] = useState("chat");
  const keep = TYPES.filter((t) => actions[t.kind] === "keep").map((t) => t.kind);
  const block = TYPES.filter((t) => actions[t.kind] === "block").map((t) => t.kind);

  return (
    <SettingsWindow>
      <SettingsPageFrame>
        <SettingsHeader
          description="Перед запросом во внешнюю модель имена, телефоны и другие данные заменяются метками; в ответе метки заменяются обратно."
          title="Защита данных"
        />
        <Rows>
          <Row hint="Без службы запросы во внешние модели не отправляются" label="Маскировать данные">
            <Switch aria-label="Маскировать данные" checked={on} onCheckedChange={setOn} />
          </Row>
        </Rows>

        <Section
          action={
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setTimeout(() => setBusy(false), 900);
              }}
              size="sm"
              variant="outline"
            >
              <RefreshCw className={cn(busy && "animate-spin")} />
              Проверить
            </Button>
          }
          title="Служба"
        >
          {down && !busy && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>Не отправлено: защита данных недоступна. Запросы во внешние модели остановлены, локальные модели работают.</AlertDescription>
            </Alert>
          )}
          <Rows>
            <Row label="Адрес">
              <span className="font-mono text-sm">http://pii-guard:8080</span>
            </Row>
            <Row hint="Проверка раз в минуту" label="Состояние">
              <Status busy={busy} down={down} />
            </Row>
          </Rows>
        </Section>

        <Section title="Где применять">
          <Rows>
            {PLACES.map((p) => (
              <Row hint={p.hint} key={p.id} label={p.label}>
                <Switch
                  aria-label={p.label}
                  checked={on && places[p.id]}
                  disabled={!on}
                  onCheckedChange={(v) => setPlaces((x) => ({ ...x, [p.id]: v }))}
                />
              </Row>
            ))}
          </Rows>
        </Section>

        <Section title="Что скрывать">
          <Rows>
            {TYPES.map((t) => {
              const { icon: Icon, label, icon_ } = KINDS[t.kind];
              const value = actions[t.kind] as Action;
              return (
                <div className="flex min-h-14 items-center gap-3 px-4 py-3" key={t.kind}>
                  <Icon className={cn("size-4 shrink-0", icon_)} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{label}</span>
                    <span className={cn("truncate text-xs", t.kind === "org" ? "text-muted-foreground" : cn("font-mono", icon_))}>{t.example}</span>
                  </div>
                  <Select disabled={!on} onValueChange={(v) => setActions((x) => ({ ...x, [t.kind]: v as Action }))} value={value}>
                    <SelectTrigger aria-label={label} className="w-44 shrink-0 max-sm:w-36">
                      <SelectValue>{ACTIONS[value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ACTIONS) as Action[]).map((a) => (
                        <SelectItem key={a} value={a}>
                          {ACTIONS[a]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </Rows>
          <p className="text-muted-foreground -mt-1 text-xs">
            «Не отправлять запрос» — сообщение с таким значением не уходит во внешнюю модель. Картинки и файлы уходят без маскирования.
          </p>
        </Section>

        <Section title="Как искать">
          <Rows>
            <Row
              hint={mode === "fast" ? "Правила и распознавание имён на сервере" : "Спорные места проверяет модель: медленнее, платно"}
              label="Режим"
            >
              <ToggleGroup disabled={!on} onValueChange={(v) => v[0] && setMode(String(v[0]))} spacing={0} value={[mode]} variant="outline">
                <ToggleGroupItem value="fast">Быстрый</ToggleGroupItem>
                <ToggleGroupItem value="check">С проверкой моделью</ToggleGroupItem>
              </ToggleGroup>
            </Row>
            <Row hint="Модели на этом сервере получают текст как есть" label="Маскировать для локальных моделей">
              <Switch aria-label="Маскировать для локальных моделей" checked={local} disabled={!on} onCheckedChange={setLocal} />
            </Row>
            <Row hint="Что получила модель — для панели под ответом" label="Хранить записи">
              <Select onValueChange={(v) => setKeepFor(String(v))} value={keepFor}>
                <SelectTrigger aria-label="Хранить записи" className="w-full md:w-44">
                  <SelectValue>{RETENTION[keepFor]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RETENTION).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          </Rows>
        </Section>

        <Sandbox block={block} keep={keep} />
      </SettingsPageFrame>
    </SettingsWindow>
  );
};
