"use client";

import { Avatar, AvatarFallback } from "@metobe/ui/components/avatar";
import { Button } from "@metobe/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@metobe/ui/components/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@metobe/ui/components/dropdown-menu";
import { Input } from "@metobe/ui/components/input";
import { Alert, AlertDescription, AlertTitle } from "@metobe/ui/components/reui/alert";
import { ToggleGroup, ToggleGroupItem } from "@metobe/ui/components/toggle-group";
import { cn } from "@metobe/ui/lib/utils";
import { Check, CircleAlert, Copy, Minus, MoreHorizontal, Plus, TriangleAlert } from "lucide-react";
import { createContext, use, useState } from "react";
import type { ReactNode } from "react";

import { useProto } from "../memory/frame";
import { TierBadge } from "../seat-limits/parts";
import { MONTH, PRICE, TIERS, TIER_ORDER, initials, nextBill, prorate, rub, seatsWord, upgradeSum, useSeats } from "./data";
import type { Load, Person, Seats, Tier } from "./data";

// Общее у вариантов P37: состояние мест, окна «Пригласить», «Тариф», «Добавить места», строка следующего месяца,
// предупреждение «мест меньше, чем занято», использование команды в процентах.

type Ask = { kind: "invite"; tier?: Tier } | { kind: "tier"; person: Person } | { kind: "add"; tier?: Tier } | null;

const Ctx = createContext<{ s: Seats; ask: (a: Ask) => void; say: (text: string) => void }>(null as never);
export const useOwner = () => use(Ctx);

/** Ручки читаются из адреса после гидрации — состояние мест начинается заново при их смене. */
export const OwnerProvider = ({ children }: { children: ReactNode }) => {
  const { knobs } = useProto();
  return (
    <Owner dec={knobs.dec === "short"} key={`${knobs.seats}-${knobs.dec}`} load={knobs.seats as Load}>
      {children}
    </Owner>
  );
};

const Owner = ({ children, load, dec }: { children: ReactNode; load: Load; dec: boolean }) => {
  const { say } = useProto();
  const s = useSeats(load, dec);
  const [ask, setAsk] = useState<Ask>(null);
  return (
    <Ctx value={{ ask: setAsk, s, say }}>
      {children}
      <InviteDialog ask={ask} onClose={() => setAsk(null)} />
      <TierDialog ask={ask} onClose={() => setAsk(null)} />
      <AddDialog ask={ask} onClose={() => setAsk(null)} />
    </Ctx>
  );
};

export { TierBadge };

export const PersonAvatar = ({ p, size = "size-8" }: { p: Person; size?: string }) => (
  <Avatar className={cn(size, p.invited && "border border-dashed bg-transparent")}>
    <AvatarFallback className={cn("text-xs", p.invited && "bg-transparent")}>{initials(p)}</AvatarFallback>
  </Avatar>
);

export const personName = (p: Person) => (p.invited ? p.email : p.name);
export const personHint = (p: Person) => {
  if (p.invited) return "Приглашение без ответа";
  if (p.nextTier) return `С 1 декабря — ${TIERS[p.nextTier].title}`;
  return p.owner ? `${p.email} · владелец` : p.email;
};

const TierPick = ({ value, onChange, note }: { value: Tier; onChange: (t: Tier) => void; note?: (t: Tier) => ReactNode }) => (
  <ToggleGroup className="w-full" onValueChange={(v) => v[0] && onChange(v[0] as Tier)} spacing={0} value={[value]} variant="outline">
    {TIER_ORDER.map((t) => (
      <ToggleGroupItem className="h-auto flex-1 flex-col gap-0.5 py-2" key={t} value={t}>
        <span>{TIERS[t].title}</span>
        {note && <span className="text-muted-foreground text-[11px] font-normal">{note(t)}</span>}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);

const Stepper = ({ value, onChange, min = 0, label }: { value: number; onChange: (n: number) => void; min?: number; label: string }) => (
  <div aria-label={label} className="flex items-center rounded-md border" role="group">
    <Button aria-label="Меньше" className="rounded-r-none" disabled={value <= min} onClick={() => onChange(value - 1)} size="icon-sm" variant="ghost">
      <Minus />
    </Button>
    <span className="w-8 text-center text-sm tabular-nums">{value}</span>
    <Button aria-label="Больше" className="rounded-l-none" onClick={() => onChange(value + 1)} size="icon-sm" variant="ghost">
      <Plus />
    </Button>
  </div>
);
export { Stepper };

// ── Пригласить ───────────────────────────────────────────────────────────────────────────────────────────────────────

const InviteDialog = ({ ask, onClose }: { ask: Ask; onClose: () => void }) => {
  const { s, say } = useOwner();
  const open = ask?.kind === "invite";
  const [tier, setTier] = useState<Tier>("base");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState(false);
  const [lastAsk, setLastAsk] = useState<Ask>(null);
  if (ask !== lastAsk) {
    setLastAsk(ask);
    if (ask?.kind === "invite") {
      setTier(ask.tier ?? (TIER_ORDER.find((t) => s.free(t) > 0) ?? "base"));
      setEmail("");
      setLink(false);
    }
  }
  const free = s.free(tier);
  const add = prorate(PRICE[tier]);
  const send = (withSeat: boolean) => {
    if (withSeat) s.addSeats(tier, 1);
    s.invite(email.trim(), tier);
    setLink(true);
  };
  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{link ? "Приглашение готово" : "Пригласить в организацию"}</DialogTitle>
          <DialogDescription>
            {link ? `Место «${TIERS[tier].title}» занято до ответа. Ссылка действует 7 дней.` : "Приглашение занимает место выбранного тарифа, пока человек не ответит."}
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="flex items-center gap-2">
            <Input readOnly value="https://metobe.example/invite/9f3k-x2pa" />
            <Button onClick={() => say("Ссылка скопирована")} size="icon" variant="outline">
              <Copy />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Input onChange={(e) => setEmail(e.target.value)} placeholder="Почта — необязательно" type="email" value={email} />
            <TierPick note={(t) => (s.free(t) > 0 ? `свободно ${s.free(t)}` : "мест нет")} onChange={setTier} value={tier} />
            {free === 0 && (
              <Alert variant="warning">
                <TriangleAlert />
                <AlertTitle>Свободных мест «{TIERS[tier].title}» нет</AlertTitle>
                <AlertDescription>
                  Можно добавить место: доплата {rub(add)} за остаток ноября ({MONTH.left} из {MONTH.days} дней) — отдельной строкой в счёте за {MONTH.next}.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
        <DialogFooter>
          {link ? (
            <Button onClick={onClose}>Готово</Button>
          ) : (
            <>
              <Button onClick={onClose} variant="outline">
                Отмена
              </Button>
              {free > 0 ? <Button onClick={() => send(false)}>Пригласить</Button> : <Button onClick={() => send(true)}>Добавить место за {rub(add)} и пригласить</Button>}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Тариф человека ───────────────────────────────────────────────────────────────────────────────────────────────────

const TierDialog = ({ ask, onClose }: { ask: Ask; onClose: () => void }) => {
  const { s, say } = useOwner();
  const person = ask?.kind === "tier" ? ask.person : null;
  const [to, setTo] = useState<Tier>("base");
  const [lastAsk, setLastAsk] = useState<Ask>(null);
  if (ask !== lastAsk) {
    setLastAsk(ask);
    if (ask?.kind === "tier") setTo(ask.person.nextTier ?? ask.person.tier);
  }
  const from = person?.tier ?? "base";
  const up = TIER_ORDER.indexOf(to) > TIER_ORDER.indexOf(from);
  const same = to === from && !person?.nextTier;
  const sum = upgradeSum(from, to);
  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={person !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Тариф: {person ? personName(person) : ""}</DialogTitle>
          <DialogDescription>Сейчас — {TIERS[from].title}. Повышение — сразу, понижение — с 1-го числа.</DialogDescription>
        </DialogHeader>
        <TierPick onChange={setTo} value={to} />
        {!same && (
          <Alert variant={up ? "info" : "default"}>
            {up ? <CircleAlert /> : <Check />}
            {up ? (
              <>
                <AlertTitle>Доплата {rub(sum)}</AlertTitle>
                <AlertDescription>
                  Разница цен за остаток ноября, {MONTH.left} из {MONTH.days} дней. Отдельной строкой в счёте за {MONTH.next}. С декабря место «{TIERS[to].title}» — по полной цене.
                </AlertDescription>
              </>
            ) : (
              <AlertDescription>
                До конца ноября — {TIERS[from].title}, с 1 декабря — {TIERS[to].title}. За ноябрь деньги не возвращаются.
              </AlertDescription>
            )}
          </Alert>
        )}
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Отмена
          </Button>
          <Button
            disabled={same}
            onClick={() => {
              if (person) {
                s.change(person.id, to);
                say(up ? `Тариф «${TIERS[to].title}» с сегодняшнего дня` : `Тариф «${TIERS[to].title}» с 1 декабря`);
              }
              onClose();
            }}
          >
            {up ? `Повысить за ${rub(sum)}` : "Понизить с 1 декабря"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Добавить места ───────────────────────────────────────────────────────────────────────────────────────────────────

const AddDialog = ({ ask, onClose }: { ask: Ask; onClose: () => void }) => {
  const { s, say } = useOwner();
  const open = ask?.kind === "add";
  const [tier, setTier] = useState<Tier>("base");
  const [n, setN] = useState(1);
  const [lastAsk, setLastAsk] = useState<Ask>(null);
  if (ask !== lastAsk) {
    setLastAsk(ask);
    if (ask?.kind === "add") {
      setTier(ask.tier ?? "base");
      setN(1);
    }
  }
  const sum = prorate(PRICE[tier] * n);
  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Добавить места</DialogTitle>
          <DialogDescription>Места появятся сразу и останутся в следующем месяце.</DialogDescription>
        </DialogHeader>
        <TierPick note={(t) => `${rub(PRICE[t])} в месяц`} onChange={setTier} value={tier} />
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>Сколько мест</span>
          <Stepper label="Сколько мест" min={1} onChange={setN} value={n} />
        </div>
        <Alert variant="info">
          <CircleAlert />
          <AlertTitle>Доплата {rub(sum)}</AlertTitle>
          <AlertDescription>
            {n} × {rub(PRICE[tier])} × {MONTH.left}/{MONTH.days} — за остаток ноября, сегодняшний день считается. Отдельной строкой в счёте за {MONTH.next}.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Отмена
          </Button>
          <Button
            onClick={() => {
              s.addSeats(tier, n);
              say(`Добавлено: ${n} ${seatsWord(n)} «${TIERS[tier].title}»`);
              onClose();
            }}
          >
            Добавить за {rub(sum)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Человек: меню действий ───────────────────────────────────────────────────────────────────────────────────────────

export const PersonMenu = ({ p, trigger }: { p: Person; trigger?: React.ReactElement }) => {
  const { s, ask, say } = useOwner();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger ?? <Button aria-label="Действия" size="icon-sm" variant="ghost" />}>{trigger ? undefined : <MoreHorizontal />}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{personName(p)}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => ask({ kind: "tier", person: p })}>Изменить тариф</DropdownMenuItem>
        </DropdownMenuGroup>
        {!p.owner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                s.disable(p.id);
                say(p.invited ? "Приглашение отозвано, место свободно" : `${p.name} отключён, место свободно`);
              }}
              variant="destructive"
            >
              {p.invited ? "Отозвать приглашение" : "Отключить"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ── Следующий месяц ──────────────────────────────────────────────────────────────────────────────────────────────────

/** «В декабре 6 Обычных мест, а занято 8: отключите двоих до 1 декабря, иначе счёт будет за 8». */
export const ShortWarnings = () => {
  const { s } = useOwner();
  const short = TIER_ORDER.filter((t) => s.nextTaken(t) > s.next[t]);
  if (short.length === 0) return null;
  return (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertDescription className="text-foreground">
        {short.map((t) => {
          const extra = s.nextTaken(t) - s.next[t];
          return (
            <p key={t}>
              В декабре {s.next[t]} {seatsWord(s.next[t])} «{TIERS[t].title}», а занято {s.nextTaken(t)}: отключите {extra === 1 ? "одного" : extra === 2 ? "двоих" : extra} до 1 декабря, иначе счёт будет за {s.nextTaken(t)}.
            </p>
          );
        })}
      </AlertDescription>
    </Alert>
  );
};

/** Счёт за следующий месяц: места × цена, доплаты отдельными строками. */
export const NextBill = () => {
  const { s } = useOwner();
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {TIER_ORDER.map((t) => {
        const n = Math.max(s.next[t], s.nextTaken(t));
        return (
          <div className="flex justify-between gap-3" key={t}>
            <span className="text-muted-foreground">
              {TIERS[t].title} × {n}
            </span>
            <span className="tabular-nums">{rub(n * PRICE[t])}</span>
          </div>
        );
      })}
      {s.extra.map((e) => (
        <div className="flex justify-between gap-3" key={e.text}>
          <span className="text-muted-foreground truncate">Доплата: {e.text}</span>
          <span className="tabular-nums">{rub(e.sum)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t pt-1.5 font-medium">
        <span>Счёт за {MONTH.next}, НДС в цене</span>
        <span className="tabular-nums">{rub(nextBill(s))}</span>
      </div>
    </div>
  );
};

// ── Использование ────────────────────────────────────────────────────────────────────────────────────────────────────

export const usageHead = (s: Seats) => {
  const people = s.people.filter((p) => !p.invited);
  return { near: people.filter((p) => p.week >= 80 && p.week < 100).length, out: people.filter((p) => p.week >= 100).length, people };
};

export const WeekCell = ({ pct }: { pct: number }) => (
  <span className="flex items-center justify-end gap-2">
    <span className="bg-muted relative h-1.5 w-16 overflow-hidden rounded-full max-sm:w-10">
      <span className={cn("absolute inset-y-0 left-0 rounded-full", pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(pct, 100)}%` }} />
    </span>
    <span className={cn("w-12 text-right whitespace-nowrap tabular-nums", pct >= 100 && "text-destructive")}>{pct} %</span>
  </span>
);
