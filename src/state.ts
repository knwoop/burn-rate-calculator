// All page logic lives here: form state, URL sync, and deriving everything
// the page displays. Components under components/ are markup only — they
// render the view data this module hands them and never compute anything.

import { useEffect, useMemo, useState } from "react";
import { ChartModel, TimesChartModel, buildChart, buildTimesChart } from "./chart";
import {
  InputError,
  MIN_PER_DAY,
  formatMinutes,
  formatPercent,
  parseDuration,
  parsePositiveNumber,
} from "../worker/calc";
import { FormValues, compute, readForm, toQuery } from "../worker/params";
import {
  Column,
  EXHAUSTION_COLUMN_NOTE,
  FirstColumn,
  Row,
  buildRows,
  firstColumn,
  inputSummary,
  tableColumns,
} from "../worker/table";

export type TierPatch = Partial<{ burn_rate: string; window: string; short_window: string }>;

/** Everything the results section displays, fully formatted. */
export interface ResultView {
  summary: string;
  errorRatePercent: string;
  exhaustion: string;
  first: FirstColumn;
  columns: Column[];
  rows: Row[];
  chart: ChartModel;
  timesChart: TimesChartModel;
  exhaustionNote: string;
  showWorkbookTip: boolean;
  approaches: { approach: number; name: string; caveat: string; recommended: boolean }[];
}

export type CalcResult = { ok: true; view: ResultView } | { ok: false; error: string };

export function calculate(fv: FormValues): CalcResult {
  try {
    const comp = compute(fv);
    const first = firstColumn(comp);
    return {
      ok: true,
      view: {
        summary: inputSummary(comp),
        errorRatePercent: formatPercent(comp.common.errorRate),
        exhaustion: formatMinutes(comp.exhaustionMin),
        first,
        columns: tableColumns(comp, first),
        rows: buildRows(comp, "≥"),
        chart: buildChart(comp),
        timesChart: buildTimesChart(comp),
        exhaustionNote: EXHAUSTION_COLUMN_NOTE,
        showWorkbookTip: comp.common.periodDays !== 30,
        approaches: comp.results.map((r) => ({
          approach: r.approach,
          name: r.name,
          caveat: r.caveat,
          recommended: r.approach === 6,
        })),
      },
    };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, error: e.message };
    throw e;
  }
}

export interface Calculator {
  fv: FormValues;
  result: CalcResult;
  /** The /calc URL that reproduces the current inputs (for curl / sharing) */
  calcUrl: string;
  set: (patch: Partial<FormValues>) => void;
  setTier: (approach: "5" | "6", index: number, patch: TierPatch) => void;
  /**
   * Fills each tier's burn rate so the tiers spend 2% / 5% / 10% of the error
   * budget when they fire (the Workbook's recommendation), derived from the
   * current period and each tier's window: burn_rate = spend × period ÷ window.
   */
  fillRecommendedTiers: (approach: "5" | "6") => void;
}

/** The Workbook's recommended budget spend per tier when the alert fires. */
const TIER_BUDGET_SPENDS = [0.02, 0.05, 0.1];

function recommendedBurnRate(spend: number, periodMin: number, windowRaw: string): string | null {
  try {
    const v = (spend * periodMin) / parseDuration(windowRaw);
    const s = v.toPrecision(4);
    return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  } catch (e) {
    if (e instanceof InputError) return null;
    throw e;
  }
}

export function useCalculator(): Calculator {
  const [fv, setFv] = useState<FormValues>(() =>
    readForm(new URLSearchParams(window.location.search)),
  );
  const result = useMemo(() => calculate(fv), [fv]);

  // Keep the address bar shareable: the same query works on / and /calc.
  useEffect(() => {
    window.history.replaceState(null, "", `/?${toQuery(fv)}`);
  }, [fv]);

  const set = (patch: Partial<FormValues>) => setFv((v) => ({ ...v, ...patch }));
  const setTier = (approach: "5" | "6", index: number, patch: TierPatch) =>
    setFv((v) =>
      approach === "5"
        ? { ...v, a5: v.a5.map((r, i) => (i === index ? { ...r, ...patch } : r)) }
        : { ...v, a6: v.a6.map((r, i) => (i === index ? { ...r, ...patch } : r)) },
    );
  const fillRecommendedTiers = (approach: "5" | "6") =>
    setFv((v) => {
      let periodMin: number;
      try {
        periodMin = parsePositiveNumber(v.period, "period") * MIN_PER_DAY;
      } catch (e) {
        if (e instanceof InputError) return v;
        throw e;
      }
      const fill = <T extends { burn_rate: string; window: string }>(r: T, i: number): T => {
        const burn = recommendedBurnRate(TIER_BUDGET_SPENDS[i] ?? 0.1, periodMin, r.window);
        return burn === null ? r : { ...r, burn_rate: burn };
      };
      return approach === "5" ? { ...v, a5: v.a5.map(fill) } : { ...v, a6: v.a6.map(fill) };
    });

  return {
    fv,
    result,
    calcUrl: `${window.location.origin}/calc?${toQuery(fv)}`,
    set,
    setTier,
    fillRecommendedTiers,
  };
}
