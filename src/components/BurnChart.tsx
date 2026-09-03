// The timeline chart. Markup only: it maps the ChartModel's data coordinates
// (linear time, log error rate) to pixels and draws SVG.

import { ChartModel, SeriesPoint } from "../chart";

const W = 720;
const H = 280;
const M = { l: 62, r: 122, t: 18, b: 36 };

export function BurnChart({ model }: { model: ChartModel }) {
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const logMin = Math.log10(model.yMin);
  const logMax = Math.log10(model.yMax);
  const lx = (x: number) => M.l + (x / model.xMax) * plotW;
  const ly = (y: number) => {
    const t = (Math.log10(Math.max(y, model.yMin)) - logMin) / (logMax - logMin);
    return M.t + (1 - Math.max(0, Math.min(1, t))) * plotH;
  };
  const path = (points: SeriesPoint[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${lx(p.x).toFixed(1)},${ly(p.y).toFixed(1)}`).join("");

  return (
    <figure className="chart">
      <figcaption>{model.title}</figcaption>
      <div className="legend">
        {model.series.map((s) => (
          <span key={s.label}>
            <i className={`sw c${s.colorIndex}`} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={model.title}>
        {model.yTicks.map((tick) => (
          <g key={tick.v}>
            <line x1={M.l} x2={W - M.r} y1={ly(tick.v)} y2={ly(tick.v)} className="grid" />
            <text x={M.l - 7} y={ly(tick.v)} className="tick y">
              {tick.label}
            </text>
          </g>
        ))}
        {model.xTicks.map((tick, i) => (
          <text
            key={tick.v}
            x={lx(tick.v)}
            y={H - M.b + 18}
            className={`tick x${i === 0 ? " first" : ""}${i === model.xTicks.length - 1 ? " last" : ""}`}
          >
            {tick.label}
          </text>
        ))}
        {model.levels.map((level) => (
          <g key={level.label}>
            <line
              x1={M.l}
              x2={W - M.r}
              y1={ly(level.y)}
              y2={ly(level.y)}
              className={`level ${level.kind}`}
            />
            <text x={W - M.r + 7} y={ly(level.y)} className="level-label">
              {level.label}
            </text>
          </g>
        ))}
        {model.series.map((s) => (
          <path key={s.label} d={path(s.points)} className={`line c${s.colorIndex}`} />
        ))}
        {model.markers.map((m, i) => (
          <g key={`${m.x}-${m.y}`}>
            <circle cx={lx(m.x)} cy={ly(m.y)} r={4.5} className={`pt c${m.colorIndex}`}>
              <title>{`${m.label}: ${m.detail}`}</title>
            </circle>
            <text x={lx(m.x) + 7} y={ly(m.y) + (i % 2 === 0 ? -8 : 16)} className="pt-label">
              {m.label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
