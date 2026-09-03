// Builds the timeline chart model: x = time since the incident started,
// y = error rate (log scale). One curve per alert window shows how that
// window's average error rate climbs toward its threshold; dashed levels mark
// the thresholds and the incident's error rate; a marker sits where each
// alert fires. Pure data; components/BurnChart.tsx turns it into SVG.

import { formatMinutes, formatNumber, formatPercent } from "../worker/calc";
import { Computation } from "../worker/params";

export interface SeriesPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  label: string;
  colorIndex: number;
  points: SeriesPoint[];
}

export interface ChartLevel {
  y: number;
  label: string;
  kind: "threshold" | "incident";
}

export interface ChartMarker {
  x: number;
  y: number;
  colorIndex: number;
  label: string;
  detail: string;
}

export interface AxisTick {
  v: number;
  label: string;
}

export interface ChartModel {
  title: string;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: AxisTick[];
  yTicks: AxisTick[];
  series: ChartSeries[];
  levels: ChartLevel[];
  markers: ChartMarker[];
}

// ---- detection vs reset dumbbell ----

export interface TimesRow {
  label: string;
  fires: boolean;
  detectionMin: number | null;
  resetMin: number;
  detail: string;
}

export interface TimesChartModel {
  title: string;
  xMin: number;
  xMax: number;
  xTicks: AxisTick[];
  rows: TimesRow[];
}

/** Nice tick positions for a log time axis, in minutes. */
const TIME_LADDER = [
  1 / 60,
  10 / 60,
  1,
  10,
  60,
  6 * 60,
  24 * 60,
  3 * 24 * 60,
  7 * 24 * 60,
  30 * 24 * 60,
];

export function buildTimesChart(comp: Computation): TimesChartModel {
  const rows: TimesRow[] = [];
  for (const r of comp.results) {
    r.lines.forEach((l, i) => {
      const label =
        comp.approach === "all"
          ? r.lines.length > 1
            ? `${r.approach}.${i + 1}`
            : `${r.approach}`
          : r.lines.length > 1
            ? `tier ${i + 1}`
            : `approach ${r.approach}`;
      rows.push({
        label,
        fires: l.detectionMin !== null,
        detectionMin: l.detectionMin,
        resetMin: l.resetMin,
        detail:
          l.detectionMin === null
            ? `never fires at this error rate; reset would take ${formatMinutes(l.resetMin)}`
            : `detects after ${formatMinutes(l.detectionMin)}, resets ${formatMinutes(l.resetMin)} after errors stop`,
      });
    });
  }

  const values = rows.flatMap((row) =>
    row.detectionMin === null ? [row.resetMin] : [row.detectionMin, row.resetMin],
  );
  const xMin = Math.min(...values) / 1.6;
  const xMax = Math.max(...values) * 1.4;

  return {
    title: `Detection (@ error_rate=${formatPercent(comp.common.errorRate)}) vs reset (after errors stop), log time scale`,
    xMin,
    xMax,
    xTicks: TIME_LADDER.filter((v) => v >= xMin && v <= xMax).map((v) => ({
      v,
      label: formatMinutes(v),
    })),
    rows,
  };
}

export function buildChart(comp: Computation): ChartModel {
  const R = comp.common.errorRate;

  interface Line {
    name: string;
    windowMin: number;
    threshold: number;
    burnRate: number;
    detectionMin: number | null;
  }
  const lines: Line[] = [];
  for (const r of comp.results) {
    r.lines.forEach((l, i) => {
      const name =
        comp.approach === "all"
          ? r.lines.length > 1
            ? `${r.approach}.${i + 1}`
            : `${r.approach}`
          : r.lines.length > 1
            ? `tier ${i + 1}`
            : "fires";
      lines.push({
        name,
        windowMin: l.windowMin,
        threshold: l.threshold,
        burnRate: l.burnRate,
        detectionMin: l.detectionMin,
      });
    });
  }

  // One curve per distinct window; color follows the window.
  const windows = [...new Set(lines.map((l) => l.windowMin))].sort((a, b) => a - b);
  const colorOf = new Map(windows.map((w, i) => [w, i % 5]));

  const fired = lines.filter((l) => l.detectionMin !== null).map((l) => l.detectionMin!);
  const xMax = fired.length > 0 ? Math.max(...fired) * 1.35 : Math.max(...windows) * 1.5;

  const thresholds = lines.map((l) => l.threshold);
  const yMin = Math.pow(10, Math.floor(Math.log10(Math.min(...thresholds, R))) - 1);
  const yMax = Math.pow(10, Math.ceil(Math.log10(Math.max(...thresholds, R))));

  // Average error rate over a trailing window, t minutes into a constant-R incident.
  const windowAverage = (w: number, t: number) => (R * Math.min(t, w)) / w;

  const steps = 120;
  const series: ChartSeries[] = windows.map((w) => ({
    label: `err(${formatMinutes(w)})`,
    colorIndex: colorOf.get(w)!,
    points: Array.from({ length: steps + 1 }, (_, s) => {
      const x = (xMax * s) / steps;
      return { x, y: windowAverage(w, x) };
    }),
  }));

  const levels: ChartLevel[] = [];
  const seenThresholds = new Set<string>();
  for (const l of lines) {
    const key = l.threshold.toPrecision(6);
    if (seenThresholds.has(key)) continue;
    seenThresholds.add(key);
    levels.push({
      y: l.threshold,
      kind: "threshold",
      label:
        l.burnRate === 1
          ? `E = ${formatPercent(l.threshold)}`
          : `${formatNumber(l.burnRate)}×E = ${formatPercent(l.threshold)}`,
    });
  }
  levels.push({ y: R, kind: "incident", label: `incident = ${formatPercent(R)}` });

  // Tiers often fire at the identical moment (approach 2 and the 6h tiers of
  // 5 and 6, for instance); merge those into one labeled marker.
  const markers = new Map<string, ChartMarker>();
  for (const l of lines) {
    if (l.detectionMin === null) continue;
    const x = l.detectionMin;
    const y = windowAverage(l.windowMin, x);
    const key = `${x.toPrecision(6)}|${y.toPrecision(6)}`;
    const existing = markers.get(key);
    if (existing) {
      existing.label += `, ${l.name}`;
    } else {
      markers.set(key, {
        x,
        y,
        colorIndex: colorOf.get(l.windowMin)!,
        label: l.name,
        detail: `fires after ${formatMinutes(x)}`,
      });
    }
  }

  return {
    title: `How each window's average error rate reaches its threshold (error_rate=${formatPercent(R)})`,
    xMax,
    yMin,
    yMax,
    xTicks: [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      v: xMax * f,
      label: f === 0 ? "0" : formatMinutes(xMax * f),
    })),
    yTicks: Array.from(
      { length: Math.round(Math.log10(yMax) - Math.log10(yMin)) + 1 },
      (_, i) => {
        const v = Math.pow(10, Math.log10(yMin) + i);
        return { v, label: formatPercent(v) };
      },
    ),
    series,
    levels,
    markers: [...markers.values()].sort((a, b) => a.x - b.x),
  };
}
