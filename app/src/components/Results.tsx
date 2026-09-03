// Result display. Markup only: everything shown here is computed in
// worker/table.ts (shared with the server) or handed in via props.

import { useState } from "react";
import { formatMinutes, formatPercent } from "../../../worker/calc";
import { buildRows, firstColumn, inputSummary, tableHead } from "../../../worker/table";
import { CalcResult } from "../state";

export interface ResultsProps {
  result: CalcResult;
  calcUrl: string;
  onUseWorkbookPeriod: () => void;
}

export function Results({ result, calcUrl, onUseWorkbookPeriod }: ResultsProps) {
  if (!result.ok) {
    return (
      <section className="card">
        <p className="error">Input error: {result.error}</p>
      </section>
    );
  }

  const comp = result.comp;
  const first = firstColumn(comp);
  const head = tableHead(comp, first);
  const rows = buildRows(comp, "≥");

  return (
    <section className="card">
      <p className="summary">{inputSummary(comp)}</p>
      <p>
        Time to exhaust the budget at error_rate={formatPercent(comp.common.errorRate)}:{" "}
        <strong>{formatMinutes(comp.exhaustionMin)}</strong>
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {first === "approach" && <td className="num">{r.approach}</td>}
                {first === "tier" && <td className="num">{r.tier}</td>}
                <td className="cond">{r.condition}</td>
                <td className="num">{r.threshold}</td>
                <td className="num">{r.budget}</td>
                <td>
                  <span className={r.fires ? "badge yes" : "badge no"}>
                    {r.fires ? "fires" : "silent"}
                  </span>
                </td>
                <td className="num">{r.detection}</td>
                <td className="num">{r.reset}</td>
                <td className="num">{r.exhaustion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {comp.common.periodDays !== 30 && (
        <p className="note">
          Tip: with{" "}
          <button className="link" onClick={onUseWorkbookPeriod}>
            period=30
          </button>{" "}
          the default burn-rate tiers lose exactly 2% / 5% / 10% of the budget when they fire,
          reproducing the Workbook's table.
        </p>
      )}
      <ul className="caveats">
        {comp.results.map((r) => (
          <li key={r.approach}>
            <strong>
              {r.approach}. {r.name}
            </strong>
            {r.approach === 6 && <span className="badge rec">recommended</span>} — {r.caveat}
          </li>
        ))}
      </ul>
      <CurlSnippet url={calcUrl} />
    </section>
  );
}

function CurlSnippet({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const command = `curl '${url}'`;
  const copy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="curl">
      <code>{command}</code>
      <button onClick={copy}>{copied ? "copied" : "copy"}</button>
    </div>
  );
}
