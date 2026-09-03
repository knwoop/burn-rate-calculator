import { describe, expect, it } from "vitest";
import {
  CommonInput,
  InputError,
  approach1,
  approach3,
  approach4,
  approach5,
  approach6,
  budgetExhaustionMin,
  formatMinutes,
  formatPercent,
  parseDuration,
  parseTarget,
} from "../worker/calc";
import { compute, readForm } from "../worker/params";

const base: CommonInput = { target: 0.999, periodDays: 28, errorRate: 1 };

describe("parseTarget", () => {
  it("accepts both a decimal and a percentage", () => {
    expect(parseTarget("0.999")).toBeCloseTo(0.999, 10);
    expect(parseTarget("99.9")).toBeCloseTo(0.999, 10);
    expect(parseTarget("99.99")).toBeCloseTo(0.9999, 10);
  });

  it("rejects out-of-range values", () => {
    expect(() => parseTarget("0")).toThrow(InputError);
    expect(() => parseTarget("1")).toThrow(InputError);
    expect(() => parseTarget("100")).toThrow(InputError);
    expect(() => parseTarget("abc")).toThrow(InputError);
  });
});

describe("parseDuration", () => {
  it("converts m / h / d to minutes", () => {
    expect(parseDuration("10m")).toBe(10);
    expect(parseDuration("36h")).toBe(36 * 60);
    expect(parseDuration("3d")).toBe(3 * 24 * 60);
    expect(parseDuration("1.5h")).toBe(90);
  });

  it("rejects anything but m / h / d", () => {
    expect(() => parseDuration("10s")).toThrow(InputError);
    expect(() => parseDuration("10")).toThrow(InputError);
    expect(() => parseDuration("abc")).toThrow(InputError);
    expect(() => parseDuration("")).toThrow(InputError);
  });
});

describe("approach 1 (Workbook check values)", () => {
  it("target=0.999, window=10m: full-outage detection under 1 second", () => {
    const r = approach1(base, 10);
    const detectionSeconds = r.lines[0]!.detectionMin! * 60;
    expect(detectionSeconds).toBeLessThan(1);
  });

  it("target=0.999, window=10m: budget lost is 0.025%", () => {
    const r = approach1(base, 10);
    expect(formatPercent(r.lines[0]!.budgetAtAlert)).toBe("0.025%");
  });

  it("threshold is E itself", () => {
    const r = approach1(base, 10);
    expect(r.lines[0]!.threshold).toBeCloseTo(0.001, 10);
  });
});

describe("approach 3", () => {
  it("detection time stays at `for` regardless of error_rate", () => {
    const fullOutage = approach3({ ...base, errorRate: 1.0 }, 10, 10);
    const slowBurn = approach3({ ...base, errorRate: 0.002 }, 10, 10);
    expect(fullOutage.lines[0]!.detectionMin).toBe(10);
    expect(slowBurn.lines[0]!.detectionMin).toBe(10);
  });

  it("never fires below E", () => {
    const r = approach3({ ...base, errorRate: 0.0005 }, 10, 10);
    expect(r.lines[0]!.detectionMin).toBeNull();
  });

  it("budget lost is proportional to error_rate (24.8% on a full outage)", () => {
    const r = approach3(base, 10, 10);
    // 1.0 / 0.001 * 10m / (28 * 1440m) = 24.8%
    expect(formatPercent(r.lines[0]!.budgetAtAlert)).toBe("24.8%");
  });
});

describe("approach 4 (Workbook check values)", () => {
  it("period=28, burn_rate=14.4, window=10m: budget lost is 0.36%", () => {
    const r = approach4(base, 14.4, 10);
    expect(formatPercent(r.lines[0]!.budgetAtAlert)).toBe("0.36%");
  });

  it("threshold is burn_rate x E, and drops to 1/10 at target 99.99", () => {
    const r999 = approach4(base, 14.4, 60);
    const r9999 = approach4({ ...base, target: 0.9999 }, 14.4, 60);
    expect(r999.lines[0]!.threshold).toBeCloseTo(0.0144, 10);
    expect(r9999.lines[0]!.threshold).toBeCloseTo(0.00144, 10);
  });

  it("never fires below burn_rate x E", () => {
    const r = approach4({ ...base, errorRate: 0.01 }, 14.4, 60);
    expect(r.lines[0]!.detectionMin).toBeNull();
  });

  it("exhaustion when burning at burn_rate is period / burn_rate", () => {
    const r = approach4(base, 14.4, 60);
    expect(r.lines[0]!.exhaustAtBurnRateMin).toBeCloseTo((28 * 1440) / 14.4, 6);
  });
});

const WORKBOOK_ROWS = [
  { burnRate: 14.4, windowMin: 60 },
  { burnRate: 6, windowMin: 360 },
  { burnRate: 1, windowMin: 3 * 1440 },
];

describe("approach 6 (Workbook check values)", () => {
  it("period=30: 14.4/1h is 2%, 6/6h is 5%, 1/3d is 10%", () => {
    const r = approach6({ ...base, periodDays: 30 }, WORKBOOK_ROWS);
    expect(formatPercent(r.lines[0]!.budgetAtAlert)).toBe("2%");
    expect(formatPercent(r.lines[1]!.budgetAtAlert)).toBe("5%");
    expect(formatPercent(r.lines[2]!.budgetAtAlert)).toBe("10%");
  });

  it("short_window defaults to window/12, and reset uses the short window", () => {
    const r = approach6(base, WORKBOOK_ROWS);
    expect(r.lines[0]!.shortWindowMin).toBe(5);
    expect(r.lines[0]!.resetMin).toBe(5);
    expect(r.lines[2]!.shortWindowMin).toBe(360);
  });

  it("detection time matches approach 4", () => {
    const r6 = approach6(base, WORKBOOK_ROWS);
    const r4 = approach4(base, 14.4, 60);
    expect(r6.lines[0]!.detectionMin).toBeCloseTo(r4.lines[0]!.detectionMin!, 10);
  });
});

describe("approach 5", () => {
  it("each row matches approach 4, with reset at the row's window", () => {
    const r5 = approach5(base, WORKBOOK_ROWS);
    const r4 = approach4(base, 6, 360);
    expect(r5.lines[1]!.budgetAtAlert).toBeCloseTo(r4.lines[0]!.budgetAtAlert, 10);
    expect(r5.lines[1]!.resetMin).toBe(360);
  });
});

describe("time to exhaust the budget", () => {
  it("is period x E / error_rate", () => {
    // 28d * 0.001 / 1.0 = 40.32 minutes
    expect(budgetExhaustionMin(base)).toBeCloseTo(40.32, 6);
    expect(budgetExhaustionMin({ ...base, errorRate: 0.002 })).toBeCloseTo(20160, 3);
  });
});

describe("formatting", () => {
  it("picks s / m / h / d for durations", () => {
    expect(formatMinutes(0.6 / 60)).toBe("0.6s");
    expect(formatMinutes(10)).toBe("10m");
    expect(formatMinutes(36 * 60)).toBe("36h");
    expect(formatMinutes(3 * 1440)).toBe("3d");
    expect(formatMinutes(null)).toBe("never");
  });

  it("uses two units for in-between values", () => {
    expect(formatMinutes(2.16)).toBe("2m 10s");
    expect(formatMinutes(51.84 / 60)).toBe("52s");
    expect(formatMinutes(2800)).toBe("46h 40m");
    expect(formatMinutes(4.6667 * 1440)).toBe("4d 16h");
    expect(formatMinutes(40.32)).toBe("40m 19s");
  });
});

describe("which tiers fire", () => {
  it("at error_rate=1% only the tiers whose threshold is below it fire", () => {
    // thresholds: 14.4xE = 1.44% (no), 6xE = 0.6% (yes), 1xE = 0.1% (yes)
    const r = approach6({ ...base, errorRate: 0.01 }, WORKBOOK_ROWS);
    expect(r.lines.map((l) => l.detectionMin !== null)).toEqual([false, true, true]);
  });
});

describe("exhaustion at the line's burn rate", () => {
  it("is the whole period for approaches 1-3 (their burn rate is 1)", () => {
    const r = approach1(base, 10);
    expect(r.lines[0]!.exhaustAtBurnRateMin).toBe(28 * 1440);
  });
});

describe("computing from a query", () => {
  it("approach=all returns all 6 approaches", () => {
    const comp = compute(readForm(new URLSearchParams("approach=all&target=0.999")));
    expect(comp.results.map((r) => r.approach)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("defaults are approach=all, target=0.999, period=28, error_rate=1", () => {
    const comp = compute(readForm(new URLSearchParams("")));
    expect(comp.approach).toBe("all");
    expect(comp.results).toHaveLength(6);
    expect(comp.common).toEqual({ target: 0.999, periodDays: 28, errorRate: 1 });
  });

  it("canonical names win over prefixed ones", () => {
    const q = new URLSearchParams("approach=1&window=5m&a1_window=20m");
    const comp = compute(readForm(q));
    expect(comp.results[0]!.lines[0]!.windowMin).toBe(5);
  });

  it("rejects an out-of-range approach", () => {
    expect(() => compute(readForm(new URLSearchParams("approach=7")))).toThrow(InputError);
  });
});
