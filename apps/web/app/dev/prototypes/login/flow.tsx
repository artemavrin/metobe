"use client";

// Shared sign-in flow for the three variants: email → code (or the link in the same letter) → signed in.
// Mocked: sending takes ~0.7s, the right code is 123456, anything else is «wrong or expired».
import { Button } from "@metobe/ui/components/button";
import { Field, FieldError, FieldLabel } from "@metobe/ui/components/field";
import { Input } from "@metobe/ui/components/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@metobe/ui/components/input-otp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { Languages } from "lucide-react";
import { createContext, use, useEffect, useState } from "react";

import { CUTS, type Cut } from "./cuts";
import { TAGLINES } from "./taglines";
import { BRAND_VIDEOS } from "./videos";


// Texts are the product's real dictionary strings (packages/i18n/messages), plus the few the new screens need.
const COPY = {
  en: {
    back: "Use a different email",
    code: "Code from the email",
    codeInvalid: "The code is wrong or has expired. Request a new one.",
    description: "We'll send a link and a code — no password needed.",
    done: "You're in",
    doneHint: "Opening your workspace…",
    email: "Email",
    emailInvalid: "Enter a valid email",
    mailNotConfigured: "Email sign-in isn't set up yet. Ask your administrator for a sign-in link.",
    resend: "Send again",
    resendIn: (s: number) => `Send again in ${s}s`,
    send: "Get a sign-in link",
    sentTo: "We sent a link and a code to",
    signIn: "Sign in",
    title: "Sign in to Metobe",
    orLink: "Or just open the link from the email.",
    stepCode: "Step 2 · Code",
    stepDone: "Done",
    stepEmail: "Step 1 · Email",
    stepSignIn: "Sign in",
  },
  ru: {
    back: "Другой email",
    code: "Код из письма",
    codeInvalid: "Код неверный или устарел. Запросите новый.",
    description: "Пришлём ссылку и код — пароль не нужен.",
    done: "Вы вошли",
    doneHint: "Открываем рабочее место…",
    email: "Email",
    emailInvalid: "Введите корректный email",
    mailNotConfigured: "Вход по почте ещё не настроен. Попросите у администратора ссылку для входа.",
    resend: "Отправить ещё раз",
    resendIn: (s: number) => `Отправить ещё раз через ${s} с`,
    send: "Получить ссылку для входа",
    sentTo: "Отправили ссылку и код на",
    signIn: "Войти",
    title: "Вход в Metobe",
    orLink: "Или просто откройте ссылку из письма.",
    stepCode: "Шаг 2 · Код",
    stepDone: "Готово",
    stepEmail: "Шаг 1 · Email",
    stepSignIn: "Вход",
  },
};

type Lang = keyof typeof COPY;
const LANG_NAMES: Record<Lang, string> = { en: "English", ru: "Русский" };

// Prototype-only knobs shared by every variant: language and «mail is not configured».
const Proto = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  mail: boolean;
  setMail: (m: boolean) => void;
  cut: Cut;
  setCut: (c: Cut) => void;
  video: number | null;
  setVideo: (v: number | null) => void;
  dots: Dots;
  setDots: (d: Dots) => void;
  tagline: number | null;
  setTagline: (i: number | null) => void;
}>({
  setTagline: () => {},
  tagline: null,
  dots: "bottom",
  setDots: () => {},
  cut: "diagonal",
  lang: "ru",
  mail: true,
  setCut: () => {},
  setVideo: () => {},
  video: null,
  setLang: () => {},
  setMail: () => {},
});

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Lang>("ru");
  const [mail, setMail] = useState(true);
  const [cut, setCut] = useState<Cut>("diagonal");
  const [video, setVideo] = useState<number | null>(null);
  const [dots, setDots] = useState<Dots>("bottom");
  const [tagline, setTagline] = useState<number | null>(null);
  return (
    <Proto value={{ cut, dots, lang, mail, setCut, setDots, setLang, setMail, setTagline, setVideo, tagline, video }}>
      {children}
    </Proto>
  );
};

export const useCopy = () => COPY[use(Proto).lang];
export const useMailConfigured = () => use(Proto).mail;
export const useCut = () => use(Proto).cut;
export type Dots = "none" | "bottom" | "all";
const DOTS_LABELS: Record<Dots, string> = { all: "везде", bottom: "снизу", none: "нет" };
export const useDots = () => use(Proto).dots;
/** A text pinned in «Параметры», or null for the product's rotation. */
export const usePinnedTagline = () => use(Proto).tagline;

/** A clip pinned in «Параметры», or null for the product's rotation. */
export const usePinnedVideo = () => use(Proto).video;

const Chip = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    aria-pressed={active}
    className={cn(
      "rounded-full px-2.5 py-1 transition-colors duration-150",
      active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85"
    )}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

/** Knobs for the picker's «Параметры» sheet: the «mail not configured» state, the right code, the panel edge. */
export const ProtoParams = () => {
  const { mail, setMail, cut, setCut, video, setVideo, dots, setDots, tagline, setTagline } = use(Proto);
  return (
    <>
      <div className="flex flex-col gap-2">
        <span>текст на панели</span>
        <div className="flex flex-wrap gap-1">
          <Chip active={tagline === null} onClick={() => setTagline(null)}>
            случайный
          </Chip>
          {TAGLINES.map((t, i) => (
            <Chip active={tagline === i} key={t.label} onClick={() => setTagline(i)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>точки на видео</span>
        <div className="flex gap-1">
          {(["none", "bottom", "all"] as const).map((d) => (
            <Chip active={dots === d} key={d} onClick={() => setDots(d)}>
              {DOTS_LABELS[d]}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span>ролик</span>
        <div className="flex flex-wrap gap-1">
          <Chip active={video === null} onClick={() => setVideo(null)}>
            случайный
          </Chip>
          {BRAND_VIDEOS.map((v, i) => (
            <Chip active={video === i} key={v.src} onClick={() => setVideo(i)}>
              {v.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span>срез (вариант «· срез»)</span>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(CUTS) as Cut[]).map((c) => (
            <Chip active={cut === c} key={c} onClick={() => setCut(c)}>
              {CUTS[c].label}
            </Chip>
          ))}
        </div>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-4">
        почта не настроена
        <Switch checked={!mail} onCheckedChange={(v) => setMail(!v)} size="sm" />
      </label>
      <span className="flex items-center justify-between gap-4">
        верный код <span className="font-mono text-white">123456</span>
      </span>
    </>
  );
};

export const LanguagePicker = ({ className }: { className?: string }) => {
  const { lang, setLang } = use(Proto);
  return (
    <Select onValueChange={(v) => setLang(v as Lang)} value={lang}>
      <SelectTrigger aria-label="Language" className={cn("w-auto gap-2", className)} size="sm">
        <Languages className="text-muted-foreground" />
        <SelectValue>{LANG_NAMES[lang]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
          <SelectItem key={l} lang={l} value={l}>
            {LANG_NAMES[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/** Every language named in itself, in one quiet row — for two or three languages a menu only hides them. */
export const LanguageInline = ({ className }: { className?: string }) => {
  const { lang, setLang } = use(Proto);
  return (
    <div aria-label="Language" className={cn("flex items-center gap-1 text-xs", className)} role="group">
      {(Object.keys(LANG_NAMES) as Lang[]).map((l, i) => (
        <span className="flex items-center gap-1" key={l}>
          {i > 0 && <span className="text-muted-foreground/40">·</span>}
          <button
            aria-pressed={lang === l}
            className={cn(
              "rounded px-1 py-0.5 transition-colors duration-150",
              lang === l ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
            )}
            lang={l}
            onClick={() => setLang(l)}
            type="button"
          >
            {LANG_NAMES[l]}
          </button>
        </span>
      ))}
    </div>
  );
};

/** Placeholder brand mark until there is a real logo. */
export const Mark = ({ className }: { className?: string }) => (
  <span
    aria-hidden
    className={cn(
      "bg-primary text-primary-foreground inline-flex size-8 items-center justify-center rounded-[10px] text-sm font-semibold tracking-tight shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]",
      className
    )}
  >
    M
  </span>
);

export type Step = "email" | "code" | "done";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const RESEND_SECONDS = 30;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useLoginFlow = () => {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [misses, setMisses] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(true);
      return;
    }
    setPending(true);
    await wait(700);
    setPending(false);
    setCode("");
    setCodeError(false);
    setCooldown(RESEND_SECONDS);
    setStep("code");
  };

  const verify = async (value = code) => {
    setPending(true);
    await wait(600);
    setPending(false);
    if (value === "123456") {
      setStep("done");
    } else {
      setCodeError(true);
      setMisses((m) => m + 1);
      setCode("");
    }
  };

  const resend = async () => {
    setPending(true);
    await wait(500);
    setPending(false);
    setCodeError(false);
    setCode("");
    setCooldown(RESEND_SECONDS);
  };

  const back = () => {
    setStep("email");
    setCode("");
    setCodeError(false);
  };

  const reset = () => {
    back();
    setEmail("");
  };

  return {
    back,
    code,
    codeError,
    cooldown,
    email,
    emailError,
    misses,
    pending,
    resend,
    reset,
    send,
    setCode: (v: string) => {
      setCode(v);
      if (v) setCodeError(false);
    },
    setEmail: (v: string) => {
      setEmail(v);
      setEmailError(false);
    },
    step,
    verify,
  };
};

export type Flow = ReturnType<typeof useLoginFlow>;

// Forms ---------------------------------------------------------------------------------------------------------

export const EmailForm = ({ flow, size = "default" }: { flow: Flow; size?: "default" | "lg" }) => {
  const t = useCopy();
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void flow.send();
      }}
    >
      <Field data-invalid={flow.emailError}>
        <FieldLabel htmlFor="email">{t.email}</FieldLabel>
        <Input
          aria-invalid={flow.emailError}
          autoComplete="email"
          autoFocus
          className={cn(size === "lg" && "h-10")}
          id="email"
          inputMode="email"
          onChange={(e) => flow.setEmail(e.target.value)}
          placeholder="you@company.com"
          type="email"
          value={flow.email}
        />
        {flow.emailError && <FieldError>{t.emailInvalid}</FieldError>}
      </Field>
      <PressButton className={cn(size === "lg" && "h-10")} pending={flow.pending} type="submit">
        {t.send}
      </PressButton>
    </form>
  );
};

const SLOTS = [0, 1, 2, 3, 4, 5];

export const CodeInput = ({ flow, className, slotClassName }: { flow: Flow; className?: string; slotClassName?: string }) => {
  const t = useCopy();
  // A failed code shakes the row once; the key restarts the animation (and refocuses) on every miss.
  return (
    <Field data-invalid={flow.codeError}>
      <FieldLabel className="sr-only" htmlFor="code">
        {t.code}
      </FieldLabel>
      <InputOTP
        autoFocus
        containerClassName={cn(flow.codeError && "login-shake", className)}
        disabled={flow.pending}
        id="code"
        key={flow.misses}
        maxLength={6}
        onChange={flow.setCode}
        onComplete={(v: string) => void flow.verify(v)}
        pattern="^[0-9]*$"
        value={flow.code}
      >
        <InputOTPGroup>
          {SLOTS.map((i) => (
            <InputOTPSlot aria-invalid={flow.codeError} className={cn("size-10 text-base", slotClassName)} index={i} key={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {flow.codeError && <FieldError>{t.codeInvalid}</FieldError>}
    </Field>
  );
};

export const ResendButton = ({ flow }: { flow: Flow }) => {
  const t = useCopy();
  return (
    <Button
      className="text-muted-foreground h-auto p-0 font-normal tabular-nums hover:bg-transparent"
      disabled={flow.cooldown > 0 || flow.pending}
      onClick={() => void flow.resend()}
      size="sm"
      variant="ghost"
    >
      {flow.cooldown > 0 ? t.resendIn(flow.cooldown) : t.resend}
    </Button>
  );
};

/** Button with press feedback and a spinner that keeps the label's width. */
export const PressButton = ({
  pending,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pending?: boolean }) => (
  <Button className={cn("login-press relative", className)} disabled={pending} {...props}>
    <span className={cn("transition-opacity duration-150", pending && "opacity-0")}>{children}</span>
    {pending && <Spinner className="absolute" />}
  </Button>
);

// Motion: entrances ease-out ≤ 260ms, transform/opacity only; the code miss shakes once; reduced motion keeps fades.
export const LOGIN_CSS = `
.login-press { transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1); }
.login-press:active:not(:disabled) { transform: scale(0.97); }

.login-in { transition: opacity 240ms cubic-bezier(0.23, 1, 0.32, 1), transform 240ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .login-in { opacity: 0; transform: translateY(8px); } }
.login-in-x { transition: opacity 220ms cubic-bezier(0.23, 1, 0.32, 1), transform 220ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .login-in-x { opacity: 0; transform: translateX(16px); } }
.login-in-back { transition: opacity 220ms cubic-bezier(0.23, 1, 0.32, 1), transform 220ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .login-in-back { opacity: 0; transform: translateX(-16px); } }
.login-pop { transition: opacity 260ms cubic-bezier(0.23, 1, 0.32, 1), transform 260ms cubic-bezier(0.23, 1, 0.32, 1), filter 260ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .login-pop { opacity: 0; transform: scale(0.92); filter: blur(2px); } }

@keyframes login-shake { 0%, 100% { transform: none } 20% { transform: translateX(-6px) } 40% { transform: translateX(5px) } 60% { transform: translateX(-3px) } 80% { transform: translateX(2px) } }
.login-shake { animation: login-shake 280ms cubic-bezier(0.23, 1, 0.32, 1); }

@media (prefers-reduced-motion: reduce) {
  .login-in, .login-in-x, .login-in-back, .login-pop { transition: opacity 150ms ease; }
  @starting-style { .login-in, .login-in-x, .login-in-back, .login-pop { transform: none; filter: none; } }
  .login-press:active:not(:disabled) { transform: none; }
  .login-shake { animation: none; }
}
`;
