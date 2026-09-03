// Input controls. Markup only: values and change handlers come from props.

import { FormValues } from "../../worker/params";
import { TierPatch } from "../state";

const APPROACH_OPTIONS: [string, string][] = [
  ["1", "1. Target error rate ≥ SLO threshold"],
  ["2", "2. Increased alert window"],
  ["3", "3. Incrementing alert duration"],
  ["4", "4. Alert on burn rate"],
  ["5", "5. Multiple burn rate alerts"],
  ["6", "6. Multiwindow, multi-burn-rate alerts"],
  ["all", "Compare all approaches"],
];

export interface ControlsProps {
  fv: FormValues;
  onChange: (patch: Partial<FormValues>) => void;
  onTierChange: (approach: "5" | "6", index: number, patch: TierPatch) => void;
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Controls({ fv, onChange, onTierChange }: ControlsProps) {
  return (
    <section className="card">
      <div className="row">
        <label className="field grow">
          <span>Approach</span>
          <select value={fv.approach} onChange={(e) => onChange({ approach: e.target.value })}>
            {APPROACH_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <Field label="SLO target" value={fv.target} onChange={(v) => onChange({ target: v })} />
        <Field label="Period (days)" value={fv.period} onChange={(v) => onChange({ period: v })} />
        <Field
          label="Error rate to simulate"
          value={fv.error_rate}
          onChange={(v) => onChange({ error_rate: v })}
        />
      </div>
      <p className="note">
        target accepts 0.999 or 99.9 · error rate is the incident you are simulating (1.0 = full
        outage) · durations: 10m / 36h / 3d
      </p>
      <ApproachFields fv={fv} onChange={onChange} onTierChange={onTierChange} />
    </section>
  );
}

function ApproachFields({ fv, onChange, onTierChange }: ControlsProps) {
  switch (fv.approach) {
    case "1":
      return (
        <div className="row">
          <Field label="window" value={fv.a1_window} onChange={(v) => onChange({ a1_window: v })} />
        </div>
      );
    case "2":
      return (
        <div className="row">
          <Field label="window" value={fv.a2_window} onChange={(v) => onChange({ a2_window: v })} />
        </div>
      );
    case "3":
      return (
        <div className="row">
          <Field label="window" value={fv.a3_window} onChange={(v) => onChange({ a3_window: v })} />
          <Field label="for" value={fv.a3_for} onChange={(v) => onChange({ a3_for: v })} />
        </div>
      );
    case "4":
      return (
        <div className="row">
          <Field
            label="burn_rate"
            value={fv.a4_burn_rate}
            onChange={(v) => onChange({ a4_burn_rate: v })}
          />
          <Field label="window" value={fv.a4_window} onChange={(v) => onChange({ a4_window: v })} />
        </div>
      );
    case "5":
      return (
        <>
          {fv.a5.map((tier, i) => (
            <div className="row tier" key={i}>
              <span className="tier-label">Tier {i + 1}</span>
              <Field
                label="burn_rate"
                value={tier.burn_rate}
                onChange={(v) => onTierChange("5", i, { burn_rate: v })}
              />
              <Field
                label="window"
                value={tier.window}
                onChange={(v) => onTierChange("5", i, { window: v })}
              />
            </div>
          ))}
        </>
      );
    case "6":
      return (
        <>
          {fv.a6.map((tier, i) => (
            <div className="row tier" key={i}>
              <span className="tier-label">Tier {i + 1}</span>
              <Field
                label="burn_rate"
                value={tier.burn_rate}
                onChange={(v) => onTierChange("6", i, { burn_rate: v })}
              />
              <Field
                label="window"
                value={tier.window}
                onChange={(v) => onTierChange("6", i, { window: v })}
              />
              <Field
                label="short_window"
                value={tier.short_window}
                placeholder="window/12"
                onChange={(v) => onTierChange("6", i, { short_window: v })}
              />
            </div>
          ))}
        </>
      );
    default:
      return (
        <p className="note">
          Comparing all six approaches with their defaults. Pick a single approach to edit its
          windows and burn rates.
        </p>
      );
  }
}
