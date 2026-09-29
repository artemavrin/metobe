"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useState } from "react";

import { NOTES, PERSON, SESSIONS } from "./data";
import type { Session } from "./data";

// One account for every variant, kept while you flip: nothing here reaches the server — changing, leaving and
// deleting all happen on this copy. The knobs make the states worth seeing: one device only, empty notes.

type Devices = "several" | "one";
type Notes = "filled" | "empty";
type SendKey = "enter" | "mod-enter";

type Account = {
  name: string;
  setName: (v: string) => void;
  image: string | undefined;
  setImage: (v: string | undefined) => void;
  email: string;
  setEmail: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  sendKey: SendKey;
  setSendKey: (v: SendKey) => void;
  sessions: Session[];
  revoke: (id: string) => void;
  revokeOthers: () => void;
  chatsDeleted: number | null;
  deleteChats: () => void;
  devices: Devices;
  setDevices: (v: Devices) => void;
  notesKnob: Notes;
  setNotesKnob: (v: Notes) => void;
};

const Ctx = createContext<Account | null>(null);
export const useAccount = () => {
  const a = use(Ctx);
  if (!a) throw new Error("outside ProtoProvider");
  return a;
};

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [name, setName] = useState(PERSON.name);
  const [image, setImage] = useState<string>();
  const [email, setEmail] = useState(PERSON.email);
  const [notesKnob, setNotesKnob] = useState<Notes>("filled");
  const [notes, setNotes] = useState(NOTES);
  const [sendKey, setSendKey] = useState<SendKey>("enter");
  const [devices, setDevicesState] = useState<Devices>("several");
  const [sessions, setSessions] = useState(SESSIONS);
  const [chatsDeleted, setChatsDeleted] = useState<number | null>(null);
  const setDevices = (v: Devices) => {
    setDevicesState(v);
    setSessions(v === "one" ? SESSIONS.filter((s) => s.current) : SESSIONS);
  };
  const setNotesKnobBoth = (v: Notes) => {
    setNotesKnob(v);
    setNotes(v === "empty" ? "" : NOTES);
  };
  return (
    <Ctx
      value={{
        chatsDeleted,
        deleteChats: () => setChatsDeleted(47),
        devices,
        email,
        image,
        name,
        notes,
        notesKnob,
        revoke: (id) => setSessions((list) => list.filter((s) => s.id !== id)),
        revokeOthers: () =>
          setSessions((list) => list.filter((s) => s.current)),
        sendKey,
        sessions,
        setDevices,
        setEmail,
        setImage,
        setName,
        setNotes,
        setNotesKnob: setNotesKnobBoth,
        setSendKey,
      }}
    >
      {children}
    </Ctx>
  );
};

const Chip = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    aria-pressed={active}
    className={cn(
      "rounded-full px-2.5 py-1 transition-colors duration-150",
      active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85",
    )}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

export const ProtoParams = () => {
  const a = useAccount();
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span>устройства</span>
        <div className="flex gap-1">
          <Chip
            active={a.devices === "several"}
            onClick={() => a.setDevices("several")}
          >
            несколько
          </Chip>
          <Chip
            active={a.devices === "one"}
            onClick={() => a.setDevices("one")}
          >
            только это
          </Chip>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>инструкции</span>
        <div className="flex gap-1">
          <Chip
            active={a.notesKnob === "filled"}
            onClick={() => a.setNotesKnob("filled")}
          >
            есть
          </Chip>
          <Chip
            active={a.notesKnob === "empty"}
            onClick={() => a.setNotesKnob("empty")}
          >
            пусто
          </Chip>
        </div>
      </div>
    </>
  );
};
