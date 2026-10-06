// A tool result the way an MCP server answers: JSON as the text of one content part. The 1С server's `run_query`
// lists its columns with their types («Выручка: Null | Число») and a reference as `{ type, uuid, presentation }`.

export const mcpResult = (body: unknown) => ({
  content: [{ text: JSON.stringify(body, null, "\t"), type: "text" }],
});

/** Sales by item and day: `n` rows, the revenue of row `i` being `100 + i`, so the sums are easy to check. */
export const salesQuery = (
  n: number,
  rowsAs: "arrays" | "objects" = "arrays"
) => {
  const rows = Array.from({ length: n }, (_, i) => ({
    date: `2026-0${1 + (i % 3)}-${String(1 + (i % 28)).padStart(2, "0")}T10:00:00`,
    item: `Товар ${i}`,
    revenue: 100 + i,
  }));
  return mcpResult({
    columns: [
      "Товар: СправочникСсылка.Номенклатура | Null",
      "Дата: ДатаВремя | Null",
      "Выручка: Null | Число",
    ],
    error: "",
    ok: true,
    rows:
      rowsAs === "arrays"
        ? rows.map((r) => [
            {
              presentation: r.item,
              type: "СправочникСсылка.Номенклатура",
              uuid: `u${r.item}`,
            },
            r.date,
            r.revenue,
          ])
        : rows.map((r) => ({
            Выручка: r.revenue,
            Дата: r.date,
            Товар: r.item,
          })),
  });
};
