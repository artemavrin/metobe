"use client";

import { createContext, use, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";

// «Сжать чат» from the chat's header (the shell) runs in the thread (the chat screen): the thread holds the messages
// and shows the service model at work, so it takes the job. The screen registers its handler; the header calls it.

interface Bridge {
  register: (compact: (() => void) | null) => void;
  request: () => void;
}

const CompactBridge = createContext<Bridge | null>(null);

/** The bridge's two ends, made where both the header's ops and the screen are below (the chat's shell). */
export const useCompactBridgeValue = (): Bridge => {
  const handler = useRef<(() => void) | null>(null);
  const register = useCallback((compact: (() => void) | null) => {
    handler.current = compact;
  }, []);
  const request = useCallback(() => handler.current?.(), []);
  return useMemo(() => ({ register, request }), [register, request]);
};

export const CompactBridgeProvider = ({
  value,
  children,
}: {
  value: Bridge;
  children: ReactNode;
}) => <CompactBridge value={value}>{children}</CompactBridge>;

/** The bridge, or none outside the chat's shell (a shared chat, a prototype). */
export const useCompactBridge = () => use(CompactBridge);
