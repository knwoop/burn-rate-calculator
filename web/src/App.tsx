// Wires the page logic (state.ts) to the display components. No logic here.

import { Controls } from "./components/Controls";
import { Results } from "./components/Results";
import { useCalculator } from "./state";

export function App() {
  const calc = useCalculator();
  return (
    <div className="page">
      <header>
        <h1>SLO Alert Calculator</h1>
        <p>
          Given an SLO target and an alert configuration, see how much error budget is lost by the
          time the alert fires, how long detection and reset take, and how long until the budget is
          exhausted. The approaches are the six iterations in{" "}
          <a href="https://sre.google/workbook/alerting-on-slos/">
            Google SRE Workbook Chapter 5 (Alerting on SLOs)
          </a>
          .
        </p>
      </header>
      <Controls fv={calc.fv} onChange={calc.set} onTierChange={calc.setTier} />
      <Results
        result={calc.result}
        calcUrl={calc.calcUrl}
        onUseWorkbookPeriod={() => calc.set({ period: "30" })}
      />
      <footer>
        <p>
          API: <code>GET /calc</code> returns JSON or plain text depending on Accept ·{" "}
          <a href="https://github.com/knwoop/burn-rate-calculator">source</a>
        </p>
      </footer>
    </div>
  );
}
