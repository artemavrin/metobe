# evilcharts (ECharts)

Графики из реестра `@evilcharts` (https://evilcharts.com), поставленные как исходники командой
`pnpm dlx shadcn@latest add @evilcharts/echarts-<chart>` из `packages/ui`. Линтер этот код не проверяет.

## Локальные правки (перенести при обновлении из реестра)

В подсказку (`Tooltip`) каждого из семи графиков добавлены два необязательных параметра — реестр их не знает,
а без них числа в подсказке идут через `toLocaleString()`, а даты по оси — сырыми ISO-строками:

- `valueFormatter(value, key)` — число в строке подсказки (единицы, «тыс.», валюта);
- `labelFormatter(label)` — заголовок подсказки (дата словами).

Где искать: `type TooltipSlot`, `interface TooltipProps`, сборка слота (`roundness: props.roundness ?? "lg"`),
`createTooltipFormatter` — в каждом из `charts/echarts-*-chart.tsx`. Правки помечены `(local patch)`.

## Как использовать

Корню графика нужна высота: `className="h-full"` в родителе с явной высотой. Цвета ряда —
`colors: { light: ["var(--chart-N)"], dark: ["var(--chart-N)"] }`. Палитра — `--chart-1…8` в `styles/globals.css`.
