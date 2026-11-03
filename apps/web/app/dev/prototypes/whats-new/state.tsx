"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useState } from "react";

import { CHANGES } from "./data";

// The knobs: whose eyes (an admin also sees the service's changes) and «open again» — the window shows once, after the
// update, and comes back from the account menu.

type Eye = "user" | "admin";

interface ProtoState {
  eye: Eye;
  setEye: (eye: Eye) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Bumps on «open again»: a variant starts from its first page. */
  round: number;
  reopen: () => void;
  dontShow: boolean;
  /** Stars on the cover, to see the drawing with fewer or more big changes; null — as many as the tour has. */
  stars: number | null;
  setStars: (n: number | null) => void;
  setDontShow: (v: boolean) => void;
}

const Proto = createContext<ProtoState | null>(null);

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [eye, setEye] = useState<Eye>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("eye") === "admin" ? "admin" : "user"
  );
  const [open, setOpen] = useState(true);
  const [round, setRound] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  // `?stars=` opens with that many — the knob itself is under the modal window.
  const [stars, setStars] = useState<number | null>(() => {
    const n = typeof window === "undefined" ? Number.NaN : Number(new URLSearchParams(window.location.search).get("stars"));
    return n > 0 ? n : null;
  });
  return (
    <Proto
      value={{
        dontShow,
        eye,
        open,
        reopen: () => {
          setRound((r) => r + 1);
          setOpen(true);
        },
        round,
        setDontShow,
        setStars: (n) => {
          setStars(n);
          setRound((r) => r + 1);
          setOpen(true);
        },
        stars,
        setEye: (e) => {
          setEye(e);
          setRound((r) => r + 1);
          setOpen(true);
        },
        setOpen,
      }}
    >
      {children}
    </Proto>
  );
};

export const useProto = () => {
  const p = use(Proto);
  if (!p) throw new Error("useProto outside ProtoProvider");
  return p;
};

/** What this person is shown: everyone's changes, and the service's to an admin. */
export const useChanges = () => {
  const { eye } = useProto();
  return CHANGES.filter((c) => eye === "admin" || !c.admin);
};

const Chip = ({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    aria-pressed={active}
    className={cn("rounded-full px-2.5 py-1 transition-colors duration-150", active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85")}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="pt-1">{label}</span>
    <div className="flex max-w-72 flex-wrap justify-end gap-1">{children}</div>
  </div>
);

export const ProtoParams = () => {
  const { eye, setEye, reopen, dontShow, stars, setStars } = useProto();
  return (
    <>
      <Row label="глазами">
        <Chip active={eye === "user"} onClick={() => setEye("user")}>
          пользователя
        </Chip>
        <Chip active={eye === "admin"} onClick={() => setEye("admin")}>
          админа
        </Chip>
      </Row>
      <Row label="звёзд на обложке">
        {([null, 3, 5, 6] as const).map((n) => (
          <Chip active={stars === n} key={n ?? "tour"} onClick={() => setStars(n)}>
            {n ?? "как в туре"}
          </Chip>
        ))}
      </Row>
      <Row label="окно">
        <Chip onClick={reopen}>открыть снова</Chip>
      </Row>
      <p className="text-white/45">«Больше не показывать»: {dontShow ? "отмечено" : "нет"}</p>
    </>
  );
};
