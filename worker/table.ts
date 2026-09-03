// Builds the result table rows and headers. Shared by the server-side
// text/JSON renderers and the React UI so every surface shows the same table.

import {
  AlertLine,
  ApproachResult,
  errorBudget,
  formatMinutes,
  formatNumber,
  formatPercent,
} from "./calc";
import { Computation } from "./params";

/**
 * Renders the firing condition as one human-readable line. The numeric
 * threshold lives in its own column, so this shows the shape of the formula
 * using E and the burn rate. Text output passes ge=">=" (the widths of ">="
 * and "x" are unambiguous in terminals, unlike "≥" and "×").
 */
export function condition(r: ApproachResult, l: AlertLine, ge = "≥"): string {
  const thr = r.approach >= 4 ? `${formatNumber(l.burnRate)}${ge === "≥" ? "×" : "x"}E` : "E";
  const w = formatMinutes(l.windowMin);
  if (r.approach === 3) return `err(${w}) ${ge} ${thr} for ${formatMinutes(l.forMin!)}`;
  if (r.approach === 6) {
    return `err(${w}) ${ge} ${thr} and err(${formatMinutes(l.shortWindowMin!)}) ${ge} ${thr}`;
  }
  return `err(${w}) ${ge} ${thr}`;
}

export interface Row {
  approach: number;
  tier: number;
  condition: string;
  threshold: string;
  budget: string;
  fires: boolean;
  detection: string;
  reset: string;
  exhaustion: string;
}

export function buildRows(comp: Computation, ge: string): Row[] {
  const rows: Row[] = [];
  for (const r of comp.results) {
    r.lines.forEach((l, i) => {
      rows.push({
        approach: r.approach,
        tier: i + 1,
        condition: condition(r, l, ge),
        threshold: formatPercent(l.threshold),
        budget: formatPercent(l.budgetAtAlert),
        fires: l.detectionMin !== null,
        detection: formatMinutes(l.detectionMin),
        reset: formatMinutes(l.resetMin),
        exhaustion: formatMinutes(l.exhaustAtBurnRateMin),
      });
    });
  }
  return rows;
}

/**
 * The leading column: the approach number when comparing all approaches,
 * the tier number for a single multi-tier approach, nothing for a single
 * single-line approach (it would repeat the same value on every row).
 */
export type FirstColumn = "approach" | "tier" | null;

export function firstColumn(comp: Computation): FirstColumn {
  if (comp.approach === "all") return "approach";
  return comp.results[0]!.lines.length > 1 ? "tier" : null;
}

/** A column header: the label plus an optional assumption shown small in the UI. */
export interface Column {
  label: string;
  sub?: string;
}

export function tableColumns(comp: Computation, first: FirstColumn): Column[] {
  const cols: Column[] = [
    { label: "Condition" },
    { label: "Threshold" },
    { label: "Budget lost" },
    { label: "Fires?" },
    { label: "Detection", sub: `@ error_rate=${formatPercent(comp.common.errorRate)}` },
    { label: "Reset", sub: "after errors stop" },
    { label: "Exhaustion", sub: "@ burn_rate" },
  ];
  if (first === "approach") cols.unshift({ label: "#" });
  if (first === "tier") cols.unshift({ label: "Tier" });
  return cols;
}

export function tableHead(comp: Computation, first: FirstColumn): string[] {
  return tableColumns(comp, first).map((c) => (c.sub ? `${c.label} ${c.sub}` : c.label));
}

export function tableCells(row: Row, first: FirstColumn): string[] {
  const cells = [
    row.condition,
    row.threshold,
    row.budget,
    row.fires ? "yes" : "no",
    row.detection,
    row.reset,
    row.exhaustion,
  ];
  if (first === "approach") cells.unshift(String(row.approach));
  if (first === "tier") cells.unshift(String(row.tier));
  return cells;
}

export function inputSummary(comp: Computation): string {
  const c = comp.common;
  return (
    `target=${formatPercent(c.target)}  error budget E=${formatPercent(errorBudget(c))}  ` +
    `period=${formatNumber(c.periodDays)}d  error_rate=${formatPercent(c.errorRate)}`
  );
}

export const EXHAUSTION_COLUMN_NOTE =
  "Exhaustion @ burn_rate is a property of each tier - how long the budget lasts if the " +
  "error rate sits exactly at that tier's threshold - whether or not the simulated incident " +
  "fires it.";

export const WORKBOOK_TIP =
  "Tip: with period=30 the default burn-rate tiers lose exactly 2% / 5% / 10% " +
  "of the budget when they fire, reproducing the Workbook's table.";
