"use client";

import { EChartsAreaChart } from "@metobe/ui/components/evilcharts/charts/echarts-area-chart";
import { EChartsBarChart } from "@metobe/ui/components/evilcharts/charts/echarts-bar-chart";
import { EChartsComposedChart } from "@metobe/ui/components/evilcharts/charts/echarts-composed-chart";
import { EChartsLineChart } from "@metobe/ui/components/evilcharts/charts/echarts-line-chart";
import { EChartsPieChart } from "@metobe/ui/components/evilcharts/charts/echarts-pie-chart";
import { EChartsRadarChart } from "@metobe/ui/components/evilcharts/charts/echarts-radar-chart";
import { EChartsRadialChart } from "@metobe/ui/components/evilcharts/charts/echarts-radial-chart";
import type { ChartConfig } from "@metobe/ui/components/evilcharts/ui/echarts-chart";
import { useFormatter, useTranslations } from "next-intl";

import type { Format } from "@/components/chat/chart-format";
import { pieSlices } from "@/lib/chart-data";
import type { ChartSeries, ChartView } from "@/lib/chart-data";

// The chart itself (evilcharts on ECharts, spike S9): loaded only when an answer has a chart — ECharts is a big
// piece — and drawn in the theme's own eight categorical colors, `--chart-1…8`, in a fixed order, each series
// keeping its color. The model's kinds all map here; what the model wrote is what is drawn, nothing is added.

/** A series' color: the theme's, in turn — the same in both themes (the variables change with the theme). */
const paint = (i: number) => {
  const c = `var(--chart-${(i % 8) + 1})`;
  return { dark: [c], light: [c] };
};

/** «Прочее» is not a category of its own: neutral, so it never stands for a hue. */
const OTHER = "var(--muted-foreground)";

const seriesConfig = (series: ChartSeries[]): ChartConfig =>
  Object.fromEntries(
    series.map((s, i) => [s.key, { colors: paint(i), label: s.label }])
  );

/** The rows the charts read: the x value as text — an axis of categories — and a number per series. */
const rowsOf = (view: ChartView) =>
  view.points.map((p) => ({ ...p, x: String(p.x) }));

interface Props {
  view: ChartView;
  fmt: Format;
  /** The intro reveal: for a chart that was there whole, not one that grew as the model wrote it. */
  animate: boolean;
}

/** The tooltip speaks in our numbers and dates. */
const tooltipFormat = (view: ChartView, fmt: Format) => ({
  labelFormatter: (label: string) => fmt.x(label, "full"),
  valueFormatter: (value: number, key: string) =>
    fmt.value(
      value,
      view.series.find((s) => s.key === key)
    ),
});

/** Bars, lines, areas, or bars with a line, over one axis. */
const Cartesian = ({ view, fmt, animate }: Props) => {
  const config = seriesConfig(view.series);
  const data = rowsOf(view);
  const many = view.series.length > 1;
  const tooltip = tooltipFormat(view, fmt);
  const axes = {
    x: {
      dataKey: "x",
      tickFormatter: (v: string) => fmt.x(v, "tick"),
    },
    y: { tickFormatter: fmt.y },
  };
  const dots = view.points.length <= 24;
  // A bar chart's axes take text: the value axis' numbers arrive as text.
  const valueTick = (v: string) => fmt.y(Number(v));
  if (view.kind === "line") {
    return (
      <EChartsLineChart
        animation={animate}
        className="h-full"
        config={config}
        curveType={view.smooth ? "smooth" : "linear"}
        data={data}
        enableHoverHighlight={many}
        xDataKey="x"
      >
        {view.series.map((s) => (
          <EChartsLineChart.Line dataKey={s.key} isClickable={many} key={s.key}>
            {dots && <EChartsLineChart.Dot variant="border" />}
          </EChartsLineChart.Line>
        ))}
        <EChartsLineChart.Grid />
        <EChartsLineChart.XAxis {...axes.x} />
        <EChartsLineChart.YAxis {...axes.y} />
        <EChartsLineChart.Tooltip {...tooltip} />
        {many && <EChartsLineChart.Legend isClickable />}
      </EChartsLineChart>
    );
  }
  if (view.kind === "area") {
    let stackType: "default" | "stacked" | "expanded" = "default";
    if (view.percent) {
      stackType = "expanded";
    } else if (view.stacked) {
      stackType = "stacked";
    }
    return (
      <EChartsAreaChart
        animation={animate}
        className="h-full"
        config={config}
        curveType={view.smooth ? "smooth" : "linear"}
        data={data}
        stackType={stackType}
        xDataKey="x"
      >
        {view.series.map((s) => (
          <EChartsAreaChart.Area
            dataKey={s.key}
            isClickable={many}
            key={s.key}
            strokeVariant="solid"
            strokeWidth={2}
            variant="gradient"
          >
            {dots && <EChartsAreaChart.Dot variant="border" />}
          </EChartsAreaChart.Area>
        ))}
        <EChartsAreaChart.Grid />
        <EChartsAreaChart.XAxis {...axes.x} />
        <EChartsAreaChart.YAxis {...axes.y} />
        <EChartsAreaChart.Tooltip {...tooltip} />
        {many && <EChartsAreaChart.Legend isClickable />}
      </EChartsAreaChart>
    );
  }
  if (view.kind === "composed") {
    return (
      <EChartsComposedChart
        animation={animate}
        className="h-full"
        config={config}
        curveType={view.smooth ? "smooth" : "linear"}
        data={data}
        xDataKey="x"
      >
        {view.series.map((s) =>
          s.as === "bar" ? (
            <EChartsComposedChart.Bar dataKey={s.key} key={s.key} />
          ) : (
            <EChartsComposedChart.Line dataKey={s.key} key={s.key}>
              {dots && <EChartsComposedChart.Dot variant="default" />}
            </EChartsComposedChart.Line>
          )
        )}
        <EChartsComposedChart.Grid />
        <EChartsComposedChart.XAxis {...axes.x} />
        <EChartsComposedChart.YAxis {...axes.y} />
        <EChartsComposedChart.Tooltip {...tooltip} />
        {many && <EChartsComposedChart.Legend />}
      </EChartsComposedChart>
    );
  }
  let stackType: "default" | "stacked" | "percent" = "default";
  if (view.percent) {
    stackType = "percent";
  } else if (view.stacked) {
    stackType = "stacked";
  }
  return (
    <EChartsBarChart
      animation={animate}
      barRadius={view.stacked ? 0 : 4}
      className="h-full"
      config={config}
      data={data}
      layout={view.horizontal ? "horizontal" : "vertical"}
      stackType={stackType}
      xDataKey="x"
    >
      {view.series.map((s) => (
        <EChartsBarChart.Bar dataKey={s.key} isClickable={many} key={s.key} />
      ))}
      <EChartsBarChart.Grid />
      {/* Not in a fragment: the chart reads only its direct children. */}
      <EChartsBarChart.XAxis
        {...(view.horizontal ? { tickFormatter: valueTick } : axes.x)}
      />
      <EChartsBarChart.YAxis
        {...(view.horizontal ? axes.x : { tickFormatter: valueTick })}
      />
      <EChartsBarChart.Tooltip {...tooltip} />
      {many && <EChartsBarChart.Legend isClickable />}
    </EChartsBarChart>
  );
};

/** One entity, or a few, across the same measures. */
const Radar = ({ view, fmt, animate }: Props) => {
  const many = view.series.length > 1;
  return (
    <EChartsRadarChart
      animation={animate}
      className="h-full"
      config={seriesConfig(view.series)}
      data={rowsOf(view)}
    >
      <EChartsRadarChart.PolarGrid />
      <EChartsRadarChart.PolarAngleAxis dataKey="x" />
      {view.series.map((s) => (
        <EChartsRadarChart.Radar dataKey={s.key} key={s.key} variant="filled" />
      ))}
      {many && <EChartsRadarChart.Legend />}
      <EChartsRadarChart.Tooltip {...tooltipFormat(view, fmt)} />
    </EChartsRadarChart>
  );
};

/** The slices' names, their share and their value beside a ring — the numbers a ring alone does not read out. */
const SliceList = ({
  slices,
  total,
  series,
  fmt,
  shares,
}: {
  slices: { name: string; value: number; key: string; color: string }[];
  total: number;
  series?: ChartSeries;
  fmt: Format;
  /** Shares of a whole show their percent; progress per item does not add up to one. */
  shares: boolean;
}) => {
  const format = useFormatter();
  return (
    <ul className="flex w-full min-w-0 flex-col gap-2 text-sm">
      {slices.map((s) => (
        <li className="flex items-center gap-2" key={s.key}>
          <span
            className="size-2.5 shrink-0 rounded-xs"
            style={{ background: s.color }}
          />
          <span className="min-w-0 flex-1 truncate">{s.name}</span>
          {shares && (
            <span className="text-muted-foreground tabular-nums">
              {format.number(total ? s.value / total : 0, {
                maximumFractionDigits: 0,
                style: "percent",
              })}
            </span>
          )}
          <span className="w-24 text-right font-medium tabular-nums">
            {fmt.value(s.value, series)}
          </span>
        </li>
      ))}
    </ul>
  );
};

/** Shares of one whole (a ring or a pie), or progress per item (rings inside rings), with the slices listed beside. */
const Shares = ({ view, fmt, animate }: Props) => {
  const t = useTranslations("chat.chart");
  const [series] = view.series;
  const slices = pieSlices(view, t("other")).map((s, i) => ({
    ...s,
    color: s.other ? OTHER : `var(--chart-${(i % 8) + 1})`,
    key: `p${i}`,
  }));
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const config: ChartConfig = Object.fromEntries(
    slices.map((s) => [
      s.key,
      { colors: { dark: [s.color], light: [s.color] }, label: s.name },
    ])
  );
  const data = slices.map((s) => ({ slice: s.key, value: s.value }));
  const format = {
    valueFormatter: (value: number) => fmt.value(value, series),
  };
  return (
    <div className="flex flex-col items-center gap-4 p-4 sm:flex-row sm:gap-8">
      <div className="h-56 w-56 shrink-0">
        {view.kind === "radial" ? (
          <EChartsRadialChart
            className="h-full"
            config={config}
            data={data}
            nameKey="slice"
            variant="full"
          >
            <EChartsRadialChart.RadialBar dataKey="value" isClickable />
            <EChartsRadialChart.Tooltip {...format} />
          </EChartsRadialChart>
        ) : (
          <EChartsPieChart
            animation={animate}
            className="h-full"
            config={config}
            data={data}
            dataKey="value"
            nameKey="slice"
          >
            <EChartsPieChart.Pie
              cornerRadius={view.donut ? 6 : 3}
              innerRadius={view.donut ? 56 : 0}
              isClickable
              paddingAngle={view.donut ? 3 : 1}
            />
            <EChartsPieChart.Tooltip {...format} />
          </EChartsPieChart>
        )}
      </div>
      <SliceList
        fmt={fmt}
        series={series}
        shares={view.kind === "pie"}
        slices={slices}
        total={total}
      />
    </div>
  );
};

const ChartBody = (props: Props) => {
  const { kind } = props.view;
  if (kind === "pie" || kind === "radial") {
    return <Shares {...props} />;
  }
  return (
    <div className={kind === "radar" ? "h-80" : "h-64 sm:h-72"}>
      {kind === "radar" ? <Radar {...props} /> : <Cartesian {...props} />}
    </div>
  );
};

export default ChartBody;
