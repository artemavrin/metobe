import { DEFAULT_SETTINGS } from "./billing";
import type { OrgBillingState, Tariff } from "./billing";

export const NORMAL: Tariff = {
  id: "normal",
  price: 100_000, // 1 000,00
  vat: { included: false, rateBp: 2200 },
};
export const PRO: Tariff = {
  id: "pro",
  price: 300_000,
  vat: { included: false, rateBp: 2200 },
};

export const iso = (s: string) => new Date(s);

/** An organization that bought 10 Normal seats on 2026-01-10 and has been paying since. */
export const org = (over: Partial<OrgBillingState> = {}): OrgBillingState => ({
  applied: new Set(),
  billingStartedAt: iso("2026-01-10T09:00:00Z"),
  disabledReason: null,
  invoices: [],
  lastRollover: "2026-01",
  orgId: "org1",
  seatChanges: [],
  seats: { normal: { occupied: 10, seats: 10, seatsNext: 10 } },
  settings: { ...DEFAULT_SETTINGS },
  status: "active",
  tariffs: { normal: NORMAL, pro: PRO },
  timeZone: "Europe/Moscow",
  trialEndsAt: null,
  ...over,
});
