// Calculations for the 6 approaches in Google SRE Workbook Chapter 5
// (Alerting on SLOs). All durations are kept in minutes internally and
// formatted only for display.
// https://sre.google/workbook/alerting-on-slos/

export const MIN_PER_DAY = 24 * 60;

/** Thrown on invalid input; the fetch handler turns it into a 400. */
export class InputError extends Error {}

export interface CommonInput {
  /** SLO target (0 < target < 1) */
  target: number;
  /** Evaluation period in days */
  periodDays: number;
  /** Actual error rate (0 < errorRate <= 1). 1.0 means a full outage */
  errorRate: number;
}

/** One alert condition. Approaches 1-4 have one line; 5 and 6 have three. */
export interface AlertLine {
  label: string;
  burnRate: number;
  windowMin: number;
  shortWindowMin?: number;
  forMin?: number;
  /** Error-rate threshold to configure in the monitor (E or burn_rate x E) */
  threshold: number;
  /** Error budget consumed by the time the alert fires (fraction of budget) */
  budgetAtAlert: number;
  /** Time to fire at errorRate; null if the rate is below the threshold and it never fires */
  detectionMin: number | null;
  /** Time until the alert stops firing after the incident is resolved */
  resetMin: number;
  /** Time to exhaust the budget when burning exactly at burn_rate (approaches 4-6 only) */
  exhaustAtBurnRateMin?: number;
}

export interface ApproachResult {
  approach: number;
  name: string;
  lines: AlertLine[];
  /** What this approach cannot catch (from the Workbook's pros/cons) */
  caveat: string;
}

export const APPROACH_NAMES: Record<number, string> = {
  1: "Target error rate >= SLO threshold",
  2: "Increased alert window",
  3: "Incrementing alert duration",
  4: "Alert on burn rate",
  5: "Multiple burn rate alerts",
  6: "Multiwindow, multi-burn-rate alerts",
};

export const APPROACH_CAVEATS: Record<number, string> = {
  1: "Fires on even a tiny excursion above the threshold, so precision is low and most alerts need no action.",
  2: "Precision improves, but the alert keeps firing until errors leave the window: reset takes 36h. Long windows are also expensive to compute.",
  3: "The duration ignores how large the error rate is, so a slight excursion that persists still fires (precision stays low) and even a full outage waits the full `for`.",
  4: "An error rate below burn_rate x E never fires, so slow burns that still exhaust the budget go unnoticed (lower recall).",
  5: "Recall and detection improve, but one incident fires several rows at once, and rows with long windows are slow to reset.",
  6: "The Workbook's recommended setup. The short window makes resets fast, at the cost of the most parameters to manage and reason about.",
};

export function errorBudget(c: CommonInput): number {
  return 1 - c.target;
}

export function periodMin(c: CommonInput): number {
  return c.periodDays * MIN_PER_DAY;
}

/** Time (minutes) until the error budget is exhausted when burning at errorRate. */
export function budgetExhaustionMin(c: CommonInput): number {
  return (periodMin(c) * errorBudget(c)) / c.errorRate;
}

// ---- input parsing ----

/** Accepts either "0.999" or "99.9". */
export function parseTarget(raw: string): number {
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new InputError(`target is not a number: ${raw}`);
  const t = v > 1 ? v / 100 : v;
  if (t <= 0 || t >= 1) {
    throw new InputError(
      `target must be a decimal in (0, 1) or a percentage in (1, 100): ${raw}`,
    );
  }
  return t;
}

const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(m|h|d)$/;

/** Converts "10m" / "36h" / "3d" to minutes. Anything else is an error. */
export function parseDuration(raw: string): number {
  const m = DURATION_RE.exec(raw.trim());
  if (!m) throw new InputError(`durations must look like 10m / 36h / 3d: ${raw}`);
  const v = Number(m[1]);
  if (v <= 0) throw new InputError(`durations must be positive: ${raw}`);
  switch (m[2]) {
    case "m":
      return v;
    case "h":
      return v * 60;
    default:
      return v * MIN_PER_DAY;
  }
}

export function parsePositiveNumber(raw: string, name: string): number {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) {
    throw new InputError(`${name} must be a positive number: ${raw}`);
  }
  return v;
}

export function parseErrorRate(raw: string): number {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0 || v > 1) {
    throw new InputError(`error_rate must be a decimal in (0, 1] (1.0 = full outage): ${raw}`);
  }
  return v;
}

// ---- per-approach calculations ----

/** Time (minutes) for err(window) to reach the threshold when burning at errorRate. */
function detectionMin(c: CommonInput, threshold: number, windowMin: number): number | null {
  if (c.errorRate < threshold) return null;
  return (threshold * windowMin) / c.errorRate;
}

/** Approach 1: alert when the error rate over a short window exceeds E. */
export function approach1(c: CommonInput, windowMin: number): ApproachResult {
  return thresholdApproach(1, c, windowMin);
}

/** Approach 2: same condition as 1 with a longer window. */
export function approach2(c: CommonInput, windowMin: number): ApproachResult {
  return thresholdApproach(2, c, windowMin);
}

function thresholdApproach(n: number, c: CommonInput, windowMin: number): ApproachResult {
  const E = errorBudget(c);
  return {
    approach: n,
    name: APPROACH_NAMES[n]!,
    caveat: APPROACH_CAVEATS[n]!,
    lines: [
      {
        label: `window ${formatMinutes(windowMin)}`,
        burnRate: 1,
        windowMin,
        threshold: E,
        budgetAtAlert: windowMin / periodMin(c),
        detectionMin: detectionMin(c, E, windowMin),
        resetMin: windowMin,
      },
    ],
  };
}

/** Approach 3: alert when err(window) >= E holds for `for` minutes. */
export function approach3(c: CommonInput, windowMin: number, forMin: number): ApproachResult {
  const E = errorBudget(c);
  return {
    approach: 3,
    name: APPROACH_NAMES[3]!,
    caveat: APPROACH_CAVEATS[3]!,
    lines: [
      {
        label: `window ${formatMinutes(windowMin)}, for ${formatMinutes(forMin)}`,
        burnRate: 1,
        windowMin,
        forMin,
        // The budget keeps burning at errorRate for the whole duration,
        // so the consumption is proportional to errorRate.
        budgetAtAlert: (c.errorRate * forMin) / (E * periodMin(c)),
        threshold: E,
        // Fixed at `for` regardless of the error rate
        // (Workbook: detection time is pinned by the duration).
        detectionMin: c.errorRate >= E ? forMin : null,
        resetMin: windowMin,
      },
    ],
  };
}

export interface BurnRateRow {
  burnRate: number;
  windowMin: number;
  shortWindowMin?: number;
}

function burnRateLine(c: CommonInput, row: BurnRateRow): AlertLine {
  const threshold = row.burnRate * errorBudget(c);
  const label =
    row.shortWindowMin !== undefined
      ? `${formatNumber(row.burnRate)}x / ${formatMinutes(row.windowMin)} (short ${formatMinutes(row.shortWindowMin)})`
      : `${formatNumber(row.burnRate)}x / ${formatMinutes(row.windowMin)}`;
  return {
    label,
    burnRate: row.burnRate,
    windowMin: row.windowMin,
    shortWindowMin: row.shortWindowMin,
    threshold,
    budgetAtAlert: (row.burnRate * row.windowMin) / periodMin(c),
    detectionMin: detectionMin(c, threshold, row.windowMin),
    // With multiple windows the alert resets once errors leave the short window.
    resetMin: row.shortWindowMin ?? row.windowMin,
    exhaustAtBurnRateMin: periodMin(c) / row.burnRate,
  };
}

/** Approach 4: alert when err(window) >= burn_rate x E. */
export function approach4(c: CommonInput, burnRate: number, windowMin: number): ApproachResult {
  return {
    approach: 4,
    name: APPROACH_NAMES[4]!,
    caveat: APPROACH_CAVEATS[4]!,
    lines: [burnRateLine(c, { burnRate, windowMin })],
  };
}

/** Approach 5: several tiers of burn rate and window. */
export function approach5(c: CommonInput, rows: BurnRateRow[]): ApproachResult {
  return {
    approach: 5,
    name: APPROACH_NAMES[5]!,
    caveat: APPROACH_CAVEATS[5]!,
    lines: rows.map((row) => burnRateLine(c, { burnRate: row.burnRate, windowMin: row.windowMin })),
  };
}

/** Approach 6: adds a short window per tier; fires only when both windows exceed the threshold. */
export function approach6(c: CommonInput, rows: BurnRateRow[]): ApproachResult {
  return {
    approach: 6,
    name: APPROACH_NAMES[6]!,
    caveat: APPROACH_CAVEATS[6]!,
    lines: rows.map((row) =>
      burnRateLine(c, { ...row, shortWindowMin: row.shortWindowMin ?? row.windowMin / 12 }),
    ),
  };
}

// ---- display formatting ----

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** Rounds to 2-3 significant digits and drops trailing zeros. */
export function formatNumber(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 100) return trimZeros(v.toFixed(0));
  if (abs >= 10) return trimZeros(v.toFixed(1));
  if (abs >= 1) return trimZeros(v.toFixed(2));
  return trimZeros(v.toPrecision(2));
}

/** Formats minutes with a readable unit (s / m / h / d). null means "never". */
export function formatMinutes(min: number | null): string {
  if (min === null) return "never";
  if (min < 1) return `${formatNumber(min * 60)}s`;
  if (min < 60) return `${formatNumber(min)}m`;
  // Keep the Workbook's "36h" (= 1.5d) in hours: switch to days only at
  // 2 days or more, or when the value is an exact multiple of a day.
  if (min < 2 * MIN_PER_DAY && min % MIN_PER_DAY !== 0) return `${formatNumber(min / 60)}h`;
  return `${formatNumber(min / MIN_PER_DAY)}d`;
}

/** Formats a fraction (0-1) as a percentage. */
export function formatPercent(frac: number): string {
  return `${formatNumber(frac * 100)}%`;
}
