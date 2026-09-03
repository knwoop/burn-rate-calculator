// Formats computation results as text and JSON for the /calc API.
// The browser UI is a React app (app/) that shares worker/table.ts.

import { formatMinutes, formatPercent } from "./calc";
import { Computation } from "./params";
import {
  WORKBOOK_TIP,
  buildRows,
  condition,
  firstColumn,
  inputSummary,
  tableCells,
  tableHead,
} from "./table";

// ---- text/plain ----

export function renderText(comp: Computation): string {
  const first = firstColumn(comp);
  const head = tableHead(comp, first);
  const rows = buildRows(comp, ">=").map((r) => tableCells(r, first));
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (values: string[]) =>
    values.map((v, i) => v.padEnd(widths[i]!)).join("  ").trimEnd();

  const out: string[] = [];
  out.push("SLO alert calculator - Google SRE Workbook Ch.5 (Alerting on SLOs)");
  out.push("");
  out.push(inputSummary(comp));
  out.push(
    `Time to exhaust the budget at error_rate=${formatPercent(comp.common.errorRate)}: ${formatMinutes(comp.exhaustionMin)}`,
  );
  out.push("");
  out.push(line(head));
  out.push("-".repeat(widths.reduce((a, b) => a + b + 2, -2)));
  for (const row of rows) out.push(line(row));
  out.push("");
  if (comp.common.periodDays !== 30) out.push(WORKBOOK_TIP, "");
  for (const r of comp.results) out.push(`${r.approach}. ${r.name} - ${r.caveat}`);
  out.push("");
  return out.join("\n");
}

// ---- JSON ----

export function renderJson(comp: Computation): unknown {
  const c = comp.common;
  return {
    input: {
      target: c.target,
      error_budget: 1 - c.target,
      period_days: c.periodDays,
      error_rate: c.errorRate,
    },
    budget_exhaustion_minutes: comp.exhaustionMin,
    budget_exhaustion: formatMinutes(comp.exhaustionMin),
    approaches: comp.results.map((r) => ({
      approach: r.approach,
      name: r.name,
      caveat: r.caveat,
      lines: r.lines.map((l) => ({
        label: l.label,
        condition: condition(r, l, ">="),
        burn_rate: l.burnRate,
        window: formatMinutes(l.windowMin),
        window_minutes: l.windowMin,
        ...(l.shortWindowMin !== undefined && {
          short_window: formatMinutes(l.shortWindowMin),
          short_window_minutes: l.shortWindowMin,
        }),
        ...(l.forMin !== undefined && {
          for: formatMinutes(l.forMin),
          for_minutes: l.forMin,
        }),
        threshold: l.threshold,
        threshold_percent: formatPercent(l.threshold),
        budget_consumed_at_alert: l.budgetAtAlert,
        budget_consumed_at_alert_percent: formatPercent(l.budgetAtAlert),
        fires: l.detectionMin !== null,
        detection_minutes: l.detectionMin,
        detection: formatMinutes(l.detectionMin),
        reset_minutes: l.resetMin,
        reset: formatMinutes(l.resetMin),
        exhaustion_at_burn_rate_minutes: l.exhaustAtBurnRateMin,
        exhaustion_at_burn_rate: formatMinutes(l.exhaustAtBurnRateMin),
      })),
    })),
  };
}
