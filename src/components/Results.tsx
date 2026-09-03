// Result display. Markup only: everything shown here arrives fully
// formatted in the ResultView built by state.ts.

import { useState } from "react";
import { CalcResult } from "../state";
import { BurnChart } from "./BurnChart";
import { TimesChart } from "./TimesChart";

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

  const view = result.view;
  return (
    <section className="card">
      <p className="summary">{view.summary}</p>
      <p>
        Time to exhaust the budget at error_rate={view.errorRatePercent}:{" "}
        <strong>{view.exhaustion}</strong>
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {view.columns.map((c) => (
                <th key={c.label}>
                  {c.label}
                  {c.sub && <span className="th-sub">{c.sub}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r, i) => (
              <tr key={i} className={r.fires ? undefined : "silent-row"}>
                {view.first === "approach" && <td className="num">{r.approach}</td>}
                {view.first === "tier" && <td className="num">{r.tier}</td>}
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
      <p className="note">{view.exhaustionNote}</p>
      <BurnChart model={view.chart} />
      <TimesChart model={view.timesChart} />
      {view.showWorkbookTip && (
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
        {view.approaches.map((a) => (
          <li key={a.approach}>
            <strong>
              {a.approach}. {a.name}
            </strong>
            {a.recommended && <span className="badge rec">recommended</span>} — {a.caveat}
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
