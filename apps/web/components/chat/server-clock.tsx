"use client";

import { useNow } from "next-intl";
import { createContext, useContext } from "react";

// The server's clock as this page estimates it. A step still going is counted from when the server says it began, so
// a page reloaded in the middle of it shows the same time as the one that never left — not one that starts from zero.
// The offset is how far this browser's clock is ahead of the server's (its own now minus the server's, when the
// server's «now» arrived — the little that the way takes is not counted); 0 until the first one comes.

const Offset = createContext(0);
export const ServerClockProvider = Offset.Provider;

/** This browser's time now and the server's, in ms since 1970, refreshed every `interval` ms. */
export const useClock = (interval: number) => {
  const offset = useContext(Offset);
  const client = useNow({ updateInterval: interval }).getTime();
  return { client, server: client - offset };
};
