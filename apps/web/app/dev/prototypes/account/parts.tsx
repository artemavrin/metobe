"use client";

import { Badge } from "@metobe/ui/components/reui/badge";
import { Button, buttonVariants } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metobe/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metobe/ui/components/select";
import { Spinner } from "@metobe/ui/components/spinner";
import { Textarea } from "@metobe/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@metobe/ui/components/toggle-group";
import { cn } from "@metobe/ui/lib/utils";
import { Download, Laptop, Smartphone } from "lucide-react";
import { useState } from "react";

import { LogoPicker } from "@/components/logo-picker";
import { Row, Rows } from "@/components/settings/rows";

import { ThemePicker } from "../../../(app)/settings/account/theme-picker";
import { ago, ZONES } from "./data";
import { useAccount } from "./state";

// The account's pieces, shared by every variant: they differ in how the pieces are gathered, not in what a piece is.

export const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 fill-mode-both duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

/** The email change in three steps — a code from each address; here any six digits fit, 000000 is refused. */
const EmailDialog = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const a = useAccount();
  const [step, setStep] = useState<"address" | "current" | "new">("address");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reset = () => {
    setStep("address");
    setAddress("");
    setCode("");
    setProblem(null);
    onClose();
  };
  const next = () => {
    setProblem(null);
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (step === "address") {
        if (!address.includes("@"))
          return setProblem("Это не похоже на адрес почты");
        setStep("current");
      } else if (code === "000000") {
        setProblem("Код не подошёл или истёк — проверьте письмо");
      } else if (step === "current") {
        setCode("");
        setStep("new");
      } else {
        a.setEmail(address);
        reset();
      }
    }, 600);
  };
  const ready = step === "address" ? address.includes("@") : code.length === 6;
  return (
    <Dialog onOpenChange={(o) => !o && reset()} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Сменить почту</DialogTitle>
          <DialogDescription>
            {step === "address" &&
              `Сейчас вы входите с ${a.email}. Укажите новый адрес — на текущий придёт код подтверждения.`}
            {step === "current" &&
              `Мы отправили код на ${a.email}. Введите его — потом код придёт на новый адрес.`}
            {step === "new" &&
              `Код отправлен на ${address}. Введите его, и почта сменится.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id="proto-email"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !busy) next();
          }}
        >
          <Field data-invalid={Boolean(problem)}>
            <FieldLabel htmlFor="proto-email-input">
              {step === "address" ? "Новая почта" : "Код из письма"}
            </FieldLabel>
            {step === "address" ? (
              <Input
                autoFocus
                id="proto-email-input"
                onChange={(e) => setAddress(e.target.value)}
                placeholder="name@example.com"
                value={address}
              />
            ) : (
              <Input
                autoFocus
                className="font-mono tracking-widest"
                id="proto-email-input"
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replaceAll(/\D/gu, ""))}
                placeholder="000000"
                value={code}
              />
            )}
            {problem && <FieldError>{problem}</FieldError>}
          </Field>
        </form>
        <DialogFooter>
          <Button onClick={reset} type="button" variant="ghost">
            Отмена
          </Button>
          <Button
            aria-disabled={!ready || busy}
            form="proto-email"
            type="submit"
          >
            {busy && <Spinner />}
            {step === "address"
              ? "Отправить код"
              : step === "current"
                ? "Подтвердить"
                : "Сменить почту"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** The top of the page, as on a source's: the picture to click, the name to edit where it stands, then who and how. */
export const Header = ({ className }: { className?: string }) => {
  const a = useAccount();
  const [name, setName] = useState(a.name);
  const [emailOpen, setEmailOpen] = useState(false);
  return (
    <header
      className={cn(
        "flex flex-wrap items-center justify-between gap-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        <LogoPicker
          label={a.name}
          onPick={(logo) => a.setImage(logo ?? undefined)}
          person
          size={64}
          value={a.image}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <Input
            aria-label="Имя"
            className="hover:border-input h-8 border-transparent bg-transparent px-1.5 text-xl font-semibold shadow-none md:text-xl dark:bg-transparent"
            onBlur={() =>
              name.trim() ? a.setName(name.trim()) : setName(a.name)
            }
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            value={name}
          />
          <div className="flex flex-wrap items-center gap-2 px-1.5">
            <span className="text-muted-foreground font-mono text-xs">
              {a.email}
            </span>
            <Button
              className="h-6 px-2 text-xs"
              onClick={() => setEmailOpen(true)}
              size="sm"
              variant="ghost"
            >
              Изменить
            </Button>
            <Badge variant="secondary">Владелец</Badge>
          </div>
        </div>
      </div>
      <EmailDialog onClose={() => setEmailOpen(false)} open={emailOpen} />
    </header>
  );
};

/** The theme: three tiles with their own miniatures — the real switch of this page. */
export const LookBody = () => <ThemePicker />;

/** Language and region: local state, as the real form saves each choice at once. */
export const RegionRows = () => {
  const [lang, setLang] = useState("ru");
  const [zone, setZone] = useState(ZONES[0] as string);
  const [week, setWeek] = useState("1");
  const [date, setDate] = useState("dmy");
  return (
    <Rows>
      <Row hint="Язык интерфейса и писем" label="Язык">
        <Select onValueChange={(v) => setLang(String(v))} value={lang}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue>{lang === "ru" ? "Русский" : "English"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ru">Русский</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row hint="По нему подписаны дни в чатах и расходах" label="Часовой пояс">
        <Select onValueChange={(v) => setZone(String(v))} value={zone}>
          <SelectTrigger className="w-full md:w-56">
            <SelectValue>{zone}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ZONES.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row hint="С какого дня начинается неделя" label="Первый день недели">
        <ToggleGroup
          onValueChange={(v) => v[0] && setWeek(v[0])}
          spacing={0}
          value={[week]}
          variant="outline"
        >
          <ToggleGroupItem value="1">Пн</ToggleGroupItem>
          <ToggleGroupItem value="0">Вс</ToggleGroupItem>
        </ToggleGroup>
      </Row>
      <Row hint="Как пишутся даты" label="Формат даты">
        <Select onValueChange={(v) => setDate(String(v))} value={date}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue>
              {date === "dmy"
                ? "28.09.2026"
                : date === "mdy"
                  ? "09/28/2026"
                  : "2026-09-28"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dmy">28.09.2026</SelectItem>
            <SelectItem value="mdy">09/28/2026</SelectItem>
            <SelectItem value="iso">2026-09-28</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </Rows>
  );
};

/** What the model is told about the user, and how a message is sent. */
export const ModelBody = () => {
  const a = useAccount();
  const [text, setText] = useState(a.notes);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea
          aria-label="Сведения для модели"
          className="min-h-32"
          maxLength={2000}
          onBlur={() => a.setNotes(text.trim())}
          onChange={(e) => setText(e.target.value)}
          placeholder="Например: я бухгалтер в торговой компании; отвечайте кратко и по существу, суммы указывайте в рублях."
          value={text}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            Эти сведения передаются модели в каждом чате.
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-muted-foreground text-xs tabular-nums">
              {text.length} / 2000
            </span>
          </div>
        </div>
      </div>
      <Rows>
        <Row hint="Вторая клавиша — новая строка" label="Отправка сообщения">
          <Select
            onValueChange={(v) => a.setSendKey(v as "enter" | "mod-enter")}
            value={a.sendKey}
          >
            <SelectTrigger className="w-full md:w-64">
              <SelectValue>
                {a.sendKey === "enter"
                  ? "Enter отправляет"
                  : "⌘/Ctrl+Enter отправляет"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="enter">Enter отправляет</SelectItem>
              <SelectItem value="mod-enter">⌘/Ctrl+Enter отправляет</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Rows>
    </div>
  );
};

/** Where the account is signed in: each session, and a way out of the others. */
export const DevicesRows = () => {
  const a = useAccount();
  return (
    <Rows>
      {a.sessions.map((s) => (
        <Row
          action={
            !s.current && (
              <Button onClick={() => a.revoke(s.id)} size="sm" variant="ghost">
                Завершить
              </Button>
            )
          }
          hint={[s.current ? "текущий сеанс" : ago(s.ago), s.ip]
            .filter(Boolean)
            .join(" · ")}
          key={s.id}
          label={`${s.browser} на ${s.system}`}
        >
          <span className="text-muted-foreground [&_svg]:size-4">
            {s.system === "iOS" ? <Smartphone /> : <Laptop />}
          </span>
        </Row>
      ))}
    </Rows>
  );
};

export const RevokeOthers = () => {
  const a = useAccount();
  return a.sessions.length > 1 ? (
    <Button onClick={a.revokeOthers} size="sm" variant="outline">
      Завершить остальные
    </Button>
  ) : null;
};

/** What is taken away: one file with everything the account holds. */
export const ExportRows = () => (
  <Rows>
    <Row
      action={
        <a
          className={buttonVariants({ size: "sm", variant: "outline" })}
          download
          href="/api/account/export"
        >
          <Download /> Скачать JSON
        </a>
      }
      hint="Профиль, чаты с сообщениями, названия подключений и почты. Паролей и токенов в нём нет"
      label="Скачать все данные"
    />
  </Rows>
);

/** What cannot be taken back — apart, in red, and each behind a confirmation. Nothing here reaches the server. */
export const DangerRows = () => {
  const a = useAccount();
  const [typed, setTyped] = useState("");
  const [gone, setGone] = useState(false);
  return (
    <div className="border-destructive/30 divide-destructive/15 divide-y rounded-lg border">
      <Row
        action={
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="destructive" />}>
              Удалить чаты
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Удалить все чаты?</DialogTitle>
                <DialogDescription>
                  {a.chatsDeleted === null
                    ? "Все ваши чаты и сообщения удалятся насовсем. Вернуть их будет нельзя."
                    : `Готово: удалено чатов — ${a.chatsDeleted}.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost" />}>
                  {a.chatsDeleted === null ? "Отмена" : "Закрыть"}
                </DialogClose>
                {a.chatsDeleted === null && (
                  <Button onClick={a.deleteChats} variant="destructive">
                    Удалить все
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
        hint={
          a.chatsDeleted === null
            ? "Чаты и сообщения исчезнут насовсем. Расходы в статистике останутся"
            : `Удалено чатов: ${a.chatsDeleted}`
        }
        label="Удалить все чаты"
      />
      <Row
        action={
          <Dialog
            onOpenChange={() => {
              setTyped("");
              setGone(false);
            }}
          >
            <DialogTrigger render={<Button size="sm" variant="destructive" />}>
              Удалить аккаунт
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Удалить аккаунт?</DialogTitle>
                <DialogDescription>
                  {gone
                    ? "В настоящем экране здесь вас увело бы на страницу входа."
                    : "Удалятся ваш профиль, все чаты, подключения к серверам и почты вместе с паролями. Вернуть их будет нельзя."}
                </DialogDescription>
              </DialogHeader>
              {!gone && (
                <Field>
                  <FieldLabel htmlFor="proto-del">
                    Чтобы подтвердить, введите вашу почту: {a.email}
                  </FieldLabel>
                  <Input
                    autoComplete="off"
                    id="proto-del"
                    onChange={(e) => setTyped(e.target.value)}
                    value={typed}
                  />
                </Field>
              )}
              <DialogFooter>
                <DialogClose render={<Button variant="ghost" />}>
                  {gone ? "Закрыть" : "Отмена"}
                </DialogClose>
                {!gone && (
                  <Button
                    aria-disabled={
                      typed.trim().toLowerCase() !== a.email.toLowerCase()
                    }
                    onClick={() =>
                      typed.trim().toLowerCase() === a.email.toLowerCase() &&
                      setGone(true)
                    }
                    variant="destructive"
                  >
                    Удалить навсегда
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
        hint="Профиль, чаты, подключения и почты удалятся насовсем"
        label="Удалить аккаунт"
      />
    </div>
  );
};
