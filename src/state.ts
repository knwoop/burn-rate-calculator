// All page logic lives here: form state, URL sync, and deriving everything
// the page displays. Components under components/ are markup only — they
// render the view data this module hands them and never compute anything.

import { useEffect, useMemo, useState } from "react";
import { ChartModel, TimesChartModel, buildChart, buildTimesChart } from "./chart";
import { InputError, formatMinutes, formatPercent } from "../worker/calc";
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

  return {
    fv,
    result,
    calcUrl: `${window.location.origin}/calc?${toQuery(fv)}`,
    set,
    setTier,
  };
}
