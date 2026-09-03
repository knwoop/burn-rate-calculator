// All page logic lives here: form state, derived results, and URL sync.
// Components under components/ are markup only — they receive data and
// callbacks from the useCalculator hook and never compute anything.

import { useEffect, useMemo, useState } from "react";
import { InputError } from "../../worker/calc";
import { Computation, FormValues, compute, readForm, toQuery } from "../../worker/params";

export type TierPatch = Partial<{ burn_rate: string; window: string; short_window: string }>;

export type CalcResult = { ok: true; comp: Computation } | { ok: false; error: string };

export function calculate(fv: FormValues): CalcResult {
  try {
    return { ok: true, comp: compute(fv) };
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
