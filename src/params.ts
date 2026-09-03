// Query parameters -> form values -> computation.
//
// Two naming schemes are accepted:
// - Canonical names: window, for, burn_rate, burn_rate1, window1, short_window1, ...
//   (short names for curl; they apply to the selected approach)
// - Prefixed names: a1_window, a3_for, a6_short_window1, ...
//   (used by the HTML form so that fields do not collide when JavaScript is
//   disabled and every fieldset gets submitted)
// When both are present for the same field, the canonical name wins.

import {
  ApproachResult,
  CommonInput,
  InputError,
  approach1,
  approach2,
  approach3,
  approach4,
  approach5,
  approach6,
  budgetExhaustionMin,
  parseDuration,
  parseErrorRate,
  parsePositiveNumber,
  parseTarget,
} from "./calc";

export interface RowValues {
  burn_rate: string;
  window: string;
  /** Empty string means "derive it as window / 12" */
  short_window: string;
}

export interface FormValues {
  approach: string;
  target: string;
  period: string;
  error_rate: string;
  a1_window: string;
  a2_window: string;
  a3_window: string;
  a3_for: string;
  a4_burn_rate: string;
  a4_window: string;
  a5: { burn_rate: string; window: string }[];
  a6: RowValues[];
}

/** Defaults matching the Workbook's example (the 3 tiers of approaches 5 and 6). */
export const ROW_DEFAULTS = [
  { burn_rate: "14.4", window: "1h" },
  { burn_rate: "6", window: "6h" },
  { burn_rate: "1", window: "3d" },
] as const;

export function readForm(q: URLSearchParams): FormValues {
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = q.get(k);
      if (v !== null && v.trim() !== "") return v.trim();
    }
    return undefined;
  };
  return {
    approach: pick("approach") ?? "6",
    target: pick("target") ?? "0.999",
    period: pick("period") ?? "28",
    error_rate: pick("error_rate") ?? "1.0",
    a1_window: pick("window", "a1_window") ?? "10m",
    a2_window: pick("window", "a2_window") ?? "36h",
    a3_window: pick("window", "a3_window") ?? "10m",
    a3_for: pick("for", "a3_for") ?? "10m",
    a4_burn_rate: pick("burn_rate", "a4_burn_rate") ?? "14.4",
    a4_window: pick("window", "a4_window") ?? "1h",
    a5: ROW_DEFAULTS.map((d, i) => ({
      burn_rate: pick(`burn_rate${i + 1}`, `a5_burn_rate${i + 1}`) ?? d.burn_rate,
      window: pick(`window${i + 1}`, `a5_window${i + 1}`) ?? d.window,
    })),
    a6: ROW_DEFAULTS.map((d, i) => ({
      burn_rate: pick(`burn_rate${i + 1}`, `a6_burn_rate${i + 1}`) ?? d.burn_rate,
      window: pick(`window${i + 1}`, `a6_window${i + 1}`) ?? d.window,
      short_window: pick(`short_window${i + 1}`, `a6_short_window${i + 1}`) ?? "",
    })),
  };
}

export interface Computation {
  common: CommonInput;
  /** "1"-"6" or "all" */
  approach: string;
  results: ApproachResult[];
  /** Time (minutes) until the budget is exhausted when burning at error_rate */
  exhaustionMin: number;
}

export function compute(fv: FormValues): Computation {
  const common: CommonInput = {
    target: parseTarget(fv.target),
    periodDays: parsePositiveNumber(fv.period, "period"),
    errorRate: parseErrorRate(fv.error_rate),
  };

  const build = (n: number): ApproachResult => {
    switch (n) {
      case 1:
        return approach1(common, parseDuration(fv.a1_window));
      case 2:
        return approach2(common, parseDuration(fv.a2_window));
      case 3:
        return approach3(common, parseDuration(fv.a3_window), parseDuration(fv.a3_for));
      case 4:
        return approach4(
          common,
          parsePositiveNumber(fv.a4_burn_rate, "burn_rate"),
          parseDuration(fv.a4_window),
        );
      case 5:
        return approach5(
          common,
          fv.a5.map((r, i) => ({
            burnRate: parsePositiveNumber(r.burn_rate, `burn_rate${i + 1}`),
            windowMin: parseDuration(r.window),
          })),
        );
      default:
        return approach6(
          common,
          fv.a6.map((r, i) => {
            const windowMin = parseDuration(r.window);
            return {
              burnRate: parsePositiveNumber(r.burn_rate, `burn_rate${i + 1}`),
              windowMin,
              shortWindowMin: r.short_window === "" ? windowMin / 12 : parseDuration(r.short_window),
            };
          }),
        );
    }
  };

  if (fv.approach === "all") {
    return {
      common,
      approach: "all",
      results: [1, 2, 3, 4, 5, 6].map(build),
      exhaustionMin: budgetExhaustionMin(common),
    };
  }

  const n = Number(fv.approach);
  if (!Number.isInteger(n) || n < 1 || n > 6) {
    throw new InputError(`approach must be 1-6 or all: ${fv.approach}`);
  }
  return {
    common,
    approach: fv.approach,
    results: [build(n)],
    exhaustionMin: budgetExhaustionMin(common),
  };
}
