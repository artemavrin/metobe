import { BrandMark } from "@/components/auth/brand-mark";
import { LanguageSwitch } from "@/components/language-switch";

// A short page reached from outside, without an account (a letter's «Отключить для этой задачи»): the mark, one
// message in the middle, the language below. No brand panel — nothing to sign up for here.
const NoticeLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-background flex min-h-dvh flex-col px-5 sm:px-8">
    <header className="flex h-16 shrink-0 items-center">
      <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
        <BrandMark />
        Metobe
      </span>
    </header>
    <main className="flex flex-1 items-start justify-center pt-[12vh] sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">{children}</div>
    </main>
    <footer className="flex h-16 shrink-0 items-center justify-center">
      <LanguageSwitch />
    </footer>
  </div>
);

export default NoticeLayout;
