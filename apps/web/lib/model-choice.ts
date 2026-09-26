import type { ModelChoiceRow } from "@metobe/core/model-choices";

import type { PickerModel } from "@/components/chat/picker/data";

/** A stored price (per `unit` tokens) per 1M tokens; null when the admin or the source gave none. */
const perMillion = (value: string | null, unit: number | null) =>
  value === null || !unit ? null : (Number(value) * 1_000_000) / unit;

/** A model in chat as the picker shows it: prices per 1M, the median first token from our own runs. */
export const toPickerModel = (
  row: ModelChoiceRow,
  firstTokenMs: number | null
): PickerModel => {
  const input = perMillion(row.priceInput, row.priceUnitTokens);
  const output = perMillion(row.priceOutput, row.priceUnitTokens);
  const cacheRead = perMillion(row.priceCacheRead, row.priceUnitTokens);
  return {
    caps: {
      reasoning: row.capabilities.reasoning,
      tools: row.capabilities.tools,
      vision: row.capabilities.vision,
    },
    context: row.contextWindow,
    firstTokenMs,
    id: row.id,
    logo: row.providerLogo ?? undefined,
    maker: row.providerSlug ?? "other",
    makerTitle: row.providerTitle ?? row.sourceTitle,
    price:
      input !== null && output !== null && row.priceCurrency
        ? {
            currency: row.priceCurrency,
            input,
            output,
            ...(cacheRead === null ? {} : { cacheRead }),
          }
        : null,
    released: row.releasedAt,
    source: row.sourceTitle,
    title: row.title,
  };
};
