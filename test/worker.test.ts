// Integration tests for the /calc API, calling the Hono app directly with
// Node's Request / Response. "/" is served by static assets (the React UI in
// web/), so it is not tested here.
import { describe, expect, it } from "vitest";
import app from "../src/index";

async function get(path: string, accept?: string): Promise<Response> {
  const headers = accept ? { accept } : undefined;
  return app.fetch(new Request(`http://localhost${path}`, { headers }) as never) as Promise<Response>;
}

describe("GET /calc", () => {
  it("returns a text/plain table by default (as curl would)", async () => {
    const res = await get("/calc?approach=all&target=0.999");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    for (const n of [1, 2, 3, 4, 5, 6]) expect(body).toContain(`\n${n}. `);
    expect(body).toContain("14.4");
    expect(body).toContain("Detection @ error_rate=100%");
    expect(body).toContain("Exhaustion @ burn_rate");
  });

  it("shows a # column only for approach=all and a Tier column for multi-tier approaches", async () => {
    const all = await (await get("/calc?approach=all")).text();
    const six = await (await get("/calc?approach=6")).text();
    const four = await (await get("/calc?approach=4")).text();
    expect(all).toContain("#  Condition");
    expect(six).toContain("Tier  Condition");
    expect(four).toContain("Condition");
    expect(four).not.toContain("Tier");
  });

  it("marks non-firing tiers at a partial error rate", async () => {
    const res = await get("/calc?approach=6&error_rate=0.01", "application/json");
    const body = (await res.json()) as { approaches: { lines: { fires: boolean }[] }[] };
    expect(body.approaches[0]!.lines.map((l) => l.fires)).toEqual([false, true, true]);
  });

  it("returns JSON when Accept is application/json", async () => {
    const res = await get("/calc?approach=6&target=0.999", "application/json");
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as {
      input: { error_budget: number };
      approaches: { lines: { threshold: number }[] }[];
    };
    expect(body.input.error_budget).toBeCloseTo(0.001, 10);
    expect(body.approaches[0]!.lines).toHaveLength(3);
    expect(body.approaches[0]!.lines[0]!.threshold).toBeCloseTo(0.0144, 10);
  });

  it("threshold drops to 1/10 when target changes to 99.99", async () => {
    const at = async (target: string) => {
      const res = await get(`/calc?approach=4&target=${target}`, "application/json");
      const body = (await res.json()) as { approaches: { lines: { threshold: number }[] }[] };
      return body.approaches[0]!.lines[0]!.threshold;
    };
    expect(await at("99.9")).toBeCloseTo((await at("99.99")) * 10, 10);
  });

  it("returns 400 for an invalid window", async () => {
    const res = await get("/calc?approach=1&window=10s");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("10m / 36h / 3d");
  });
});

describe("other paths", () => {
  it("returns 404", async () => {
    expect((await get("/nope")).status).toBe(404);
  });
});
