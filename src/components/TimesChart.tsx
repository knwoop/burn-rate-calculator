// Detection-vs-reset dumbbell plot on a log time axis. Markup only: data
// comes from the TimesChartModel built in chart.ts.

import { TimesChartModel } from "../chart";

const W = 720;
const ROW_H = 27;
const M = { l: 64, r: 28, t: 8, b: 34 };

export function TimesChart({ model }: { model: TimesChartModel }) {
  const plotW = W - M.l - M.r;
  const H = M.t + model.rows.length * ROW_H + M.b;
  const logMin = Math.log10(model.xMin);
  const logMax = Math.log10(model.xMax);
  const lx = (v: number) =>
    M.l + ((Math.log10(v) - logMin) / (logMax - logMin)) * plotW;
  const ry = (i: number) => M.t + i * ROW_H + ROW_H / 2;

  return (
    <figure className="chart">
      <figcaption>{model.title}</figcaption>
      <div className="legend">
        <span>
          <i className="dot-sw det" />
          detection
        </span>
        <span>
          <i className="dot-sw res" />
          reset
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={model.title}>
        {model.xTicks.map((tick) => (
          <g key={tick.v}>
            <line x1={lx(tick.v)} x2={lx(tick.v)} y1={M.t} y2={H - M.b} className="grid" />
            <text x={lx(tick.v)} y={H - M.b + 18} className="tick x">
              {tick.label}
            </text>
          </g>
        ))}
        {model.rows.map((row, i) => (
          <g key={row.label + i} className={row.fires ? undefined : "silent"}>
            <text x={M.l - 8} y={ry(i)} className="row-label">
              {row.label}
            </text>
            {row.detectionMin !== null && (
              <line
                x1={lx(row.detectionMin)}
                x2={lx(row.resetMin)}
                y1={ry(i)}
                y2={ry(i)}
                className="dumbbell"
              />
            )}
            {row.detectionMin !== null && (
              <circle cx={lx(row.detectionMin)} cy={ry(i)} r={5} className="dot det">
                <title>{`${row.label}: ${row.detail}`}</title>
              </circle>
            )}
            <circle cx={lx(row.resetMin)} cy={ry(i)} r={5} className="dot res">
              <title>{`${row.label}: ${row.detail}`}</title>
            </circle>
            {row.detectionMin === null && (
              <text x={lx(row.resetMin) + 10} y={ry(i)} className="never-label">
                never fires
              </text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}
