/**
 * How an answer is written, beyond what the model does by itself: a sentence must not read two ways. Seen in a real
 * answer: «Сентябрь — второй месяц года после марта» meant «the second best month, after March», and read as «May».
 * Fixed text, so the start of every prompt stays the same and the cache keeps hitting.
 */
export const STYLE_NOTE =
  "Write so that no sentence can be read two ways. When you rank or compare, name the measure and the direction: «второй по валовой прибыли месяц года, после марта», never «второй месяц года после марта». Give every number its unit and its period.";
