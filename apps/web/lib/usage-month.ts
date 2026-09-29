const label = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** A month of the usage from `?m=2026-09`: its first day and the next month's — in UTC; anything else is this month. */
export const monthOf = (param: string | undefined, now = new Date()) => {
  const match = /^(?<y>\d{4})-(?<m>0[1-9]|1[0-2])$/u.exec(param ?? "");
  const year = match?.groups ? Number(match.groups.y) : now.getUTCFullYear();
  const month = match?.groups ? Number(match.groups.m) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 1));
  return {
    from,
    key: label(from),
    /** A month ahead of this one has nothing to show. */
    next: to <= now ? label(to) : null,
    previous: label(new Date(Date.UTC(year, month - 1, 1))),
    to,
  };
};
