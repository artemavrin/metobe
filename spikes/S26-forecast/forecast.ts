// Core of the forecast (ARCH §20.11): `replayLimits` runs recorded answers through the tariff limits.
// Pure: no database, no clock. Columnar input so that a million rows replay in tens of milliseconds.
//
// Semantics of the replay are a port of the internal calculator (`replay()` / `eventCost()`), including its quirks:
// - a 5-hour window opens at the first *request* after the previous one ended (blocked requests open it too);
// - a request is rejected when the window or the week is already full; otherwise it is charged up to what is left
//   (the answer is "stopped" at that step);
// - service runs (title, memory…) are always charged, except right after a rejected request, until the next
//   accepted one;
// - the week is a calendar week in the organisation's zone, or a rolling 7 days from the first request.

export const MIN = 60e3;
export const HOUR = 3600e3;
export const DAY = 86400e3;
export const WEEK = 7 * DAY;
export const H5 = 5 * HOUR;
export const MSK = 3 * HOUR;
/** Days in an average month; a month is `MONTH_DAYS / 7` weeks. */
export const MONTH_DAYS = 30.4;

/** Recorded runs of all seats, sorted by (user, time). `request` is a person's own request (chat or task). */
export type Runs = {
  length: number;
  user: Uint32Array;
  /** ms since epoch */
  t: Float64Array;
  request: Uint8Array;
  /** Cost as the source reported it, in dollars / in rubles (Yandex). Exactly one of them is non-zero. */
  usd: Float64Array;
  rub: Float64Array;
  /** Uncached input, cache reads, output. */
  tin: Float64Array;
  tc: Float64Array;
  tout: Float64Array;
};

export type Seat = { id: string; tariff: number; since: number };

export type Tariff = {
  id: string;
  name: string;
  /** Per seat per month, with VAT. */
  price: number;
  /** VAT on the price, percent. */
  vatPct: number;
  /** Rubles per window; `null` — no such window (Max has no 5-hour window). */
  limit5h: number | null;
  limitWeek: number | null;
  /** Seats next month (`org_seats.seats_next`). */
  seatsNext: number;
};

/** Per 1M tokens, in dollars (or rubles when `rub`). `write` replaces `in` for uncached input. */
export type ModelPrice = {
  in: number;
  cache?: number | null;
  write?: number | null;
  out: number;
  rub?: boolean;
};

export type Options = {
  /** Rubles per dollar. */
  fx: number;
  /** Payment agent fee, percent. */
  markup: number;
  /** 22: the tax-agent VAT on foreign services is reclaimed, 0: it is a cost. */
  platformVat: 0 | 22;
  /** Re-price every request run on this model by its own tokens. `null` — as recorded. */
  model: ModelPrice | null;
  /** Dollars of memory/service work added to every request. */
  memoryUsdPerRequest: number;
  /** Load multiplier. */
  growth: number;
  weekMode: "calendar" | "rolling";
  /** Zone offset of the organisation, ms. A fixed offset: Russia has no DST (S24 covers the calendar). */
  tzOffset: number;
  /** Servers per seat per month. */
  infraPerSeat: number;
  /** Window of the data: the end is "now", seat days count from `max(since, windowStart)`. */
  windowStart: number;
  windowEnd: number;
};

export type UserReplay = {
  /** Charged (with limits). */
  spent: number;
  /** Rejected requests. */
  blocked: number;
  /** Answers stopped halfway. */
  stopped: number;
  /** Requests. */
  chats: number;
  hit5: number;
  hitW: number;
  /** Weeks with at least one request. */
  weeks: number;
  /** The most expensive week / 5-hour window if there were no limits. */
  maxWeekFree: number;
  max5Free: number;
  /** Seat days in the window (at least 1). */
  seatDays: number;
};

export const usdRate = (o: Pick<Options, "fx" | "markup" | "platformVat">) =>
  o.fx * (1 + o.markup / 100) * (o.platformVat === 22 ? 1 : 1.22);
const rubVat = (o: Pick<Options, "platformVat">) => (o.platformVat === 22 ? 1 / 1.22 : 1);

/** Cost of each run in rubles under the scenario. */
export function runCosts(runs: Runs, o: Options): Float64Array {
  const out = new Float64Array(runs.length);
  const rate = usdRate(o);
  const rv = rubVat(o);
  const m = o.model;
  for (let i = 0; i < runs.length; i++) {
    const req = runs.request[i] === 1;
    let c: number;
    if (m === null || !req) {
      c = runs.usd[i]! * rate + runs.rub[i]! * rv;
    } else {
      const list =
        (runs.tin[i]! * (m.write ?? m.in) +
          runs.tc[i]! * (m.cache ?? m.in) +
          runs.tout[i]! * m.out) /
        1e6;
      c = m.rub ? list * rv : list * rate;
    }
    if (req) c += o.memoryUsdPerRequest * rate;
    out[i] = c * o.growth;
  }
  return out;
}

export function replayLimits(
  runs: Runs,
  seats: readonly Seat[],
  tariffs: readonly Tariff[],
  o: Options,
): UserReplay[] {
  const costs = runCosts(runs, o);
  const res: UserReplay[] = seats.map((s) => ({
    spent: 0,
    blocked: 0,
    stopped: 0,
    chats: 0,
    hit5: 0,
    hitW: 0,
    weeks: 0,
    maxWeekFree: 0,
    max5Free: 0,
    seatDays: Math.max(1, (o.windowEnd - Math.max(s.since, o.windowStart)) / DAY),
  }));
  const calendar = o.weekMode === "calendar";
  // The epoch is a Thursday: shifting by 3 days makes week index boundaries fall on Monday 00:00 local.
  const weekShift = o.tzOffset + 3 * DAY;

  let i = 0;
  while (i < runs.length) {
    const u = runs.user[i]!;
    let end = i;
    while (end < runs.length && runs.user[end] === u) end++;
    const seat = seats[u]!;
    const tariff = tariffs[seat.tariff]!;
    const l5 = tariff.limit5h;
    const lw = tariff.limitWeek;
    const r = res[u]!;

    let w5 = Number.NaN; // key of the 5-hour window: its opening time
    let wk = Number.NaN; // key of the week
    let s5 = 0;
    let sw = 0;
    let lastBlocked = false;
    let hit5Key = Number.NaN;
    let hitWKey = Number.NaN;
    // Without limits: the same windows, everything charged.
    let free5 = 0;
    let freeW = 0;
    let hasW5 = false;
    let hasWk = false;

    for (let k = i; k < end; k++) {
      const c = costs[k]!;
      const t = runs.t[k]!;
      if (runs.request[k] === 1) {
        r.chats++;
        if (!hasW5 || t >= w5 + H5) {
          if (hasW5 && free5 > r.max5Free) r.max5Free = free5;
          w5 = t;
          s5 = 0;
          free5 = 0;
          hasW5 = true;
        }
        const ws = calendar
          ? Math.floor((t + weekShift) / WEEK)
          : !hasWk || t >= wk + WEEK
            ? t
            : wk;
        if (!hasWk || ws !== wk) {
          if (hasWk && freeW > r.maxWeekFree) r.maxWeekFree = freeW;
          wk = ws;
          sw = 0;
          freeW = 0;
          hasWk = true;
          r.weeks++;
        }
        free5 += c;
        freeW += c;
        if (l5 !== null && s5 >= l5) {
          r.blocked++;
          if (hit5Key !== w5) ((hit5Key = w5), r.hit5++);
          lastBlocked = true;
          continue;
        }
        if (lw !== null && sw >= lw) {
          r.blocked++;
          if (hitWKey !== wk) ((hitWKey = wk), r.hitW++);
          lastBlocked = true;
          continue;
        }
        lastBlocked = false;
        let x = c;
        const room5 = l5 === null ? Infinity : l5 - s5;
        const roomW = lw === null ? Infinity : lw - sw;
        if (x > Math.min(room5, roomW)) {
          x = Math.min(room5, roomW);
          r.stopped++;
          if (room5 <= roomW) {
            if (hit5Key !== w5) ((hit5Key = w5), r.hit5++);
          } else if (hitWKey !== wk) ((hitWKey = wk), r.hitW++);
        }
        s5 += x;
        sw += x;
        r.spent += x;
      } else {
        // The calculator charges service runs to the "free" window sums only inside a known window and week.
        if (hasWk) freeW += c;
        if (hasW5) free5 += c;
        if (lastBlocked) continue;
        s5 += c;
        sw += c;
        r.spent += c;
      }
    }
    if (hasW5 && free5 > r.max5Free) r.max5Free = free5;
    if (hasWk && freeW > r.maxWeekFree) r.maxWeekFree = freeW;
    i = end;
  }
  return res;
}

export type TariffForecast = {
  id: string;
  name: string;
  seats: number;
  seatsNext: number;
  /** Per seat per month. */
  perSeat: {
    price: number;
    net: number;
    models: number;
    servers: number;
    margin: number;
    /** Weekly limit × `MONTH_DAYS` / 7. */
    worstModels: number;
    worstMargin: number;
  };
  /** Next month, all seats of the tariff. */
  month: {
    revenueGross: number;
    vat: number;
    revenueNet: number;
    models: number;
    servers: number;
    margin: number;
  };
  /** Person-weeks that hit the weekly limit / person-weeks with any request. */
  shareWeeksHit: number;
  shareRejected: number;
  usersHit5: number;
  stopped: number;
  /** Users whose most expensive week without limits is at least 80 % of the weekly limit. */
  nearLimit: number;
};

export type Forecast = {
  tariffs: TariffForecast[];
  total: TariffForecast["month"];
};

export function forecastNextMonth(
  users: readonly UserReplay[],
  seats: readonly Seat[],
  tariffs: readonly Tariff[],
  o: Options,
): Forecast {
  const outTariffs = tariffs.map((t, ti): TariffForecast => {
    let n = 0;
    let seatDays = 0;
    let spent = 0;
    let weeks = 0;
    let hitW = 0;
    let chats = 0;
    let blocked = 0;
    let usersHit5 = 0;
    let stopped = 0;
    let near = 0;
    seats.forEach((s, ui) => {
      if (s.tariff !== ti) return;
      const r = users[ui]!;
      n++;
      seatDays += r.seatDays;
      spent += r.spent;
      weeks += r.weeks;
      hitW += r.hitW;
      chats += r.chats;
      blocked += r.blocked;
      if (r.hit5 > 0) usersHit5++;
      stopped += r.stopped;
      if (t.limitWeek !== null && r.maxWeekFree >= 0.8 * t.limitWeek) near++;
    });
    const net = t.price / (1 + t.vatPct / 100);
    const models = seatDays > 0 ? spent / (seatDays / MONTH_DAYS) : 0;
    const worstModels = t.limitWeek === null ? Number.NaN : (t.limitWeek * MONTH_DAYS) / 7;
    const sn = t.seatsNext;
    return {
      id: t.id,
      name: t.name,
      seats: n,
      seatsNext: sn,
      perSeat: {
        price: t.price,
        net,
        models,
        servers: o.infraPerSeat,
        margin: net - models - o.infraPerSeat,
        worstModels,
        worstMargin: net - worstModels - o.infraPerSeat,
      },
      month: {
        revenueGross: sn * t.price,
        vat: sn * (t.price - net),
        revenueNet: sn * net,
        models: sn * models,
        servers: sn * o.infraPerSeat,
        margin: sn * (net - models - o.infraPerSeat),
      },
      shareWeeksHit: weeks ? hitW / weeks : 0,
      shareRejected: chats ? blocked / chats : 0,
      usersHit5,
      stopped,
      nearLimit: near,
    };
  });
  const total = outTariffs.reduce(
    (a, t) => ({
      revenueGross: a.revenueGross + t.month.revenueGross,
      vat: a.vat + t.month.vat,
      revenueNet: a.revenueNet + t.month.revenueNet,
      models: a.models + t.month.models,
      servers: a.servers + t.month.servers,
      margin: a.margin + t.month.margin,
    }),
    { revenueGross: 0, vat: 0, revenueNet: 0, models: 0, servers: 0, margin: 0 },
  );
  return { tariffs: outTariffs, total };
}

/** "Week to zero": the weekly limit at which a seat does not lose money even if it is used in full. */
export const breakEvenWeek = (price: number, vatPct: number, infraPerSeat: number) =>
  Math.max(0, ((price / (1 + vatPct / 100) - infraPerSeat) * 7) / MONTH_DAYS);

/** Columns from rows `[user, t, request, usd, rub, tin, tc, tout]`, already sorted. */
export function runsFromRows(rows: ArrayLike<ArrayLike<number>>): Runs {
  const n = rows.length;
  const r: Runs = {
    length: n,
    user: new Uint32Array(n),
    t: new Float64Array(n),
    request: new Uint8Array(n),
    usd: new Float64Array(n),
    rub: new Float64Array(n),
    tin: new Float64Array(n),
    tc: new Float64Array(n),
    tout: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const x = rows[i]!;
    r.user[i] = x[0]!;
    r.t[i] = x[1]!;
    r.request[i] = x[2]!;
    r.usd[i] = x[3]!;
    r.rub[i] = x[4]!;
    r.tin[i] = x[5]!;
    r.tc[i] = x[6]!;
    r.tout[i] = x[7]!;
  }
  return r;
}
