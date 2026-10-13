"use client";

import { useFormatter, useTranslations } from "next-intl";

const KB = 1024;

/** 1536 → «1,5 КБ»: the unit that keeps the number short. */
export const useSize = () => {
  const f = useFormatter();
  const t = useTranslations("storage.units");
  return (bytes: number) => {
    const units = ["b", "kb", "mb", "gb"] as const;
    let value = bytes;
    let unit = 0;
    while (value >= KB && unit < units.length - 1) {
      value /= KB;
      unit += 1;
    }
    const shown = f.number(value, {
      maximumFractionDigits: unit === 0 ? 0 : 1,
    });
    return `${shown} ${t(units[unit] ?? "b")}`;
  };
};
