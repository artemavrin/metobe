import { BrandMark } from "@/components/auth/brand-mark";
import { BrandPanel } from "@/components/auth/brand-panel";
import { LanguageSwitch } from "@/components/language-switch";

// Shared frame of the pages before an account (sign-in, the code from a link, the first administrator): the form on
// the left with the mark above and the language below; the brand panel on the right on wide screens.
const AuthLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-background flex min-h-dvh lg:h-dvh">
    <div className="flex min-h-dvh flex-1 flex-col px-5 sm:px-8 lg:min-h-0 lg:overflow-y-auto lg:px-12">
      <header className="flex h-16 shrink-0 items-center lg:h-20">
        <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <BrandMark />
          Metobe
        </span>
      </header>
      <main className="flex flex-1 items-start pt-[8vh] lg:items-center lg:pt-0">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </main>
      <footer className="flex h-16 shrink-0 items-center">
        <LanguageSwitch className="-ml-1" />
      </footer>
    </div>
    <BrandPanel />
  </div>
);

export default AuthLayout;
