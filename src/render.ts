// Formats computation results as text / JSON / HTML.

import {
  AlertLine,
  ApproachResult,
  errorBudget,
  formatMinutes,
  formatNumber,
  formatPercent,
} from "./calc";
import { Computation, FormValues } from "./params";

/**
 * Renders the firing condition as one human-readable line. The numeric
 * threshold lives in its own column, so this shows the shape of the formula
 * using E and the burn rate. Text output passes ge=">=" (the widths of ">="
 * and "x" are unambiguous in terminals, unlike "≥" and "×").
 */
function condition(r: ApproachResult, l: AlertLine, ge = "≥"): string {
  const thr = r.approach >= 4 ? `${formatNumber(l.burnRate)}${ge === "≥" ? "×" : "x"}E` : "E";
  const w = formatMinutes(l.windowMin);
  if (r.approach === 3) return `err(${w}) ${ge} ${thr} for ${formatMinutes(l.forMin!)}`;
  if (r.approach === 6) {
    return `err(${w}) ${ge} ${thr} and err(${formatMinutes(l.shortWindowMin!)}) ${ge} ${thr}`;
  }
  return `err(${w}) ${ge} ${thr}`;
}

interface Row {
  approach: string;
  condition: string;
  threshold: string;
  budget: string;
  detection: string;
  reset: string;
  exhaustion: string;
}

function buildRows(comp: Computation, ge: string): Row[] {
  const rows: Row[] = [];
  for (const r of comp.results) {
    for (const l of r.lines) {
      rows.push({
        approach: String(r.approach),
        condition: condition(r, l, ge),
        threshold: formatPercent(l.threshold),
        budget: formatPercent(l.budgetAtAlert),
        detection: formatMinutes(l.detectionMin),
        reset: formatMinutes(l.resetMin),
        exhaustion:
          l.exhaustAtBurnRateMin !== undefined
            ? formatMinutes(l.exhaustAtBurnRateMin)
            : formatMinutes(comp.exhaustionMin),
      });
    }
  }
  return rows;
}

const TABLE_HEAD = [
  "#",
  "Condition",
  "Threshold",
  "Budget lost",
  "Detection",
  "Reset",
  "Exhaustion",
];

function inputSummary(comp: Computation): string {
  const c = comp.common;
  return (
    `target=${formatPercent(c.target)}  error budget E=${formatPercent(errorBudget(c))}  ` +
    `period=${formatNumber(c.periodDays)}d  error_rate=${formatPercent(c.errorRate)}`
  );
}

const EXHAUSTION_NOTE =
  "Exhaustion: approaches 1-3 show period x E / error_rate (burning at the given error_rate); " +
  "each row of 4-6 shows period / burn_rate (burning exactly at that burn rate).";

// ---- text/plain ----

export function renderText(comp: Computation): string {
  const rows = buildRows(comp, ">=");
  const cells = (row: Row) => [
    row.approach,
    row.condition,
    row.threshold,
    row.budget,
    row.detection,
    row.reset,
    row.exhaustion,
  ];
  const widths = TABLE_HEAD.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => cells(r)[i]!.length)),
  );
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
  out.push(line(TABLE_HEAD));
  out.push("-".repeat(widths.reduce((a, b) => a + b + 2, -2)));
  for (const row of rows) out.push(line(cells(row)));
  out.push("");
  out.push(EXHAUSTION_NOTE);
  out.push("");
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
      error_budget: errorBudget(c),
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
        detection_minutes: l.detectionMin,
        detection: formatMinutes(l.detectionMin),
        reset_minutes: l.resetMin,
        reset: formatMinutes(l.resetMin),
        ...(l.exhaustAtBurnRateMin !== undefined && {
          exhaustion_at_burn_rate_minutes: l.exhaustAtBurnRateMin,
          exhaustion_at_burn_rate: formatMinutes(l.exhaustAtBurnRateMin),
        }),
      })),
    })),
  };
}

// ---- HTML ----

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const STYLE = `
body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; line-height: 1.6; color: #222; }
h1 { font-size: 1.4rem; }
h2 { font-size: 1.1rem; margin-top: 2rem; }
fieldset { margin: .8rem 0; border: 1px solid #ccc; border-radius: 4px; }
legend { font-weight: 600; font-size: .9rem; }
label { margin-right: 1rem; white-space: nowrap; }
input { width: 6rem; padding: .15rem .3rem; }
select { padding: .15rem; }
table { border-collapse: collapse; margin: 1rem 0; width: 100%; }
th, td { border: 1px solid #bbb; padding: .35rem .6rem; text-align: left; font-size: .9rem; }
th { background: #f2f2f2; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
.error { color: #b00020; font-weight: 600; }
.note, footer { color: #666; font-size: .85rem; }
code { background: #f2f2f2; padding: .1rem .3rem; border-radius: 3px; }
button { padding: .3rem 1.2rem; }
`;

function selectOptions(selected: string): string {
  const items: [string, string][] = [
    ["1", "1. Target error rate >= SLO threshold"],
    ["2", "2. Increased alert window"],
    ["3", "3. Incrementing alert duration"],
    ["4", "4. Alert on burn rate"],
    ["5", "5. Multiple burn rate alerts"],
    ["6", "6. Multiwindow, multi-burn-rate alerts"],
    ["all", "Compare all approaches"],
  ];
  return items
    .map(
      ([v, label]) =>
        `<option value="${v}"${v === selected ? " selected" : ""}>${esc(label)}</option>`,
    )
    .join("\n      ");
}

function textInput(name: string, value: string, placeholder = ""): string {
  const ph = placeholder === "" ? "" : ` placeholder="${esc(placeholder)}"`;
  return `<input name="${name}" value="${esc(value)}"${ph}>`;
}

function renderForm(fv: FormValues): string {
  const a5rows = fv.a5
    .map(
      (r, i) => `<label>burn_rate ${textInput(`a5_burn_rate${i + 1}`, r.burn_rate)}</label>
      <label>window ${textInput(`a5_window${i + 1}`, r.window)}</label>`,
    )
    .map((row, i) => `<p>Tier ${i + 1}: ${row}</p>`)
    .join("\n    ");
  const a6rows = fv.a6
    .map(
      (r, i) => `<label>burn_rate ${textInput(`a6_burn_rate${i + 1}`, r.burn_rate)}</label>
      <label>window ${textInput(`a6_window${i + 1}`, r.window)}</label>
      <label>short_window ${textInput(`a6_short_window${i + 1}`, r.short_window, "window/12")}</label>`,
    )
    .map((row, i) => `<p>Tier ${i + 1}: ${row}</p>`)
    .join("\n    ");

  return `<form method="get" action="/">
  <p>
    <label>Approach <select name="approach" id="approach">
      ${selectOptions(fv.approach)}
    </select></label>
  </p>
  <p>
    <label>SLO target ${textInput("target", fv.target)}</label>
    <label>Period (days) ${textInput("period", fv.period)}</label>
    <label>Error rate ${textInput("error_rate", fv.error_rate)}</label>
  </p>
  <p class="note">target accepts 0.999 or 99.9. error_rate 1.0 = full outage. Durations: 10m / 36h / 3d.</p>
  <fieldset data-approach="1"><legend>1. Target error rate &gt;= SLO threshold</legend>
    <label>window ${textInput("a1_window", fv.a1_window)}</label>
  </fieldset>
  <fieldset data-approach="2"><legend>2. Increased alert window</legend>
    <label>window ${textInput("a2_window", fv.a2_window)}</label>
  </fieldset>
  <fieldset data-approach="3"><legend>3. Incrementing alert duration</legend>
    <label>window ${textInput("a3_window", fv.a3_window)}</label>
    <label>for ${textInput("a3_for", fv.a3_for)}</label>
  </fieldset>
  <fieldset data-approach="4"><legend>4. Alert on burn rate</legend>
    <label>burn_rate ${textInput("a4_burn_rate", fv.a4_burn_rate)}</label>
    <label>window ${textInput("a4_window", fv.a4_window)}</label>
  </fieldset>
  <fieldset data-approach="5"><legend>5. Multiple burn rate alerts</legend>
    ${a5rows}
  </fieldset>
  <fieldset data-approach="6"><legend>6. Multiwindow, multi-burn-rate alerts</legend>
    ${a6rows}
    <p class="note">Leave short_window empty to use window/12.</p>
  </fieldset>
  <p><button type="submit">Calculate</button></p>
</form>`;
}

function renderResultTable(comp: Computation): string {
  const rows = buildRows(comp, "≥");
  const tr = rows
    .map(
      (r) => `<tr>
      <td class="num">${r.approach}</td>
      <td>${esc(r.condition)}</td>
      <td class="num">${esc(r.threshold)}</td>
      <td class="num">${esc(r.budget)}</td>
      <td class="num">${esc(r.detection)}</td>
      <td class="num">${esc(r.reset)}</td>
      <td class="num">${esc(r.exhaustion)}</td>
    </tr>`,
    )
    .join("\n    ");
  const caveats = comp.results
    .map((r) => `<li><strong>${r.approach}. ${esc(r.name)}</strong> - ${esc(r.caveat)}</li>`)
    .join("\n    ");
  return `<h2>Results</h2>
  <p>${esc(inputSummary(comp))}<br>
  Time to exhaust the budget at error_rate=${esc(formatPercent(comp.common.errorRate))}: <strong>${esc(formatMinutes(comp.exhaustionMin))}</strong></p>
  <table>
    <thead><tr>${TABLE_HEAD.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>
    ${tr}
    </tbody>
  </table>
  <p class="note">${esc(EXHAUSTION_NOTE)}</p>
  <ul>
    ${caveats}
  </ul>`;
}

const SCRIPT = `
(function () {
  var sel = document.getElementById('approach');
  if (!sel) return;
  function sync() {
    var sets = document.querySelectorAll('fieldset[data-approach]');
    for (var i = 0; i < sets.length; i++) {
      var on = sets[i].getAttribute('data-approach') === sel.value;
      sets[i].hidden = !on;
      sets[i].disabled = !on;
    }
  }
  sel.addEventListener('change', sync);
  sync();
})();
`;

export function renderPage(fv: FormValues, comp: Computation | null, error?: string): string {
  const body = comp
    ? renderResultTable(comp)
    : `<h2>Results</h2><p class="error">Input error: ${esc(error ?? "unknown error")}</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SLO Alert Calculator</title>
<style>${STYLE}</style>
</head>
<body>
<h1>SLO Alert Calculator</h1>
<p>Given an SLO target and an alert configuration, this calculator tells you how much of
the error budget is lost by the time the alert fires, how long a full outage takes to
detect, how long the alert keeps firing after recovery, and how long until the budget
is exhausted. The approaches correspond to the six iterations in
<a href="https://sre.google/workbook/alerting-on-slos/">Google SRE Workbook Chapter 5 (Alerting on SLOs)</a>.</p>
${renderForm(fv)}
${body}
<footer><p>API: <code>GET /calc?approach=all&amp;target=0.999</code> (JSON or text/plain depending on Accept).</p></footer>
<script>${SCRIPT}</script>
</body>
</html>`;
}
