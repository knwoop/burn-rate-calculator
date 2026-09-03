// Integration tests for the fetch handler, calling it directly with Node's
// Request / Response.
import { describe, expect, it } from "vitest";
import worker from "../src/index";

function get(path: string, accept?: string): Response {
  const headers = accept ? { accept } : undefined;
  return worker.fetch(new Request(`http://localhost${path}`, { headers }) as never) as Response;
}

describe("GET /calc", () => {
  it("returns a text/plain table by default (as curl would)", async () => {
    const res = get("/calc?approach=all&target=0.999");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    for (const n of [1, 2, 3, 4, 5, 6]) expect(body).toContain(`\n${n}. `);
    expect(body).toContain("14.4");
  });

  it("returns JSON when Accept is application/json", async () => {
    const res = get("/calc?approach=6&target=0.999", "application/json");
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
      const res = get(`/calc?approach=4&target=${target}`, "application/json");
      const body = (await res.json()) as { approaches: { lines: { threshold: number }[] }[] };
      return body.approaches[0]!.lines[0]!.threshold;
    };
    expect(await at("99.9")).toBeCloseTo((await at("99.99")) * 10, 10);
  });

  it("returns 400 for an invalid window", async () => {
    const res = get("/calc?approach=1&window=10s");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("10m / 36h / 3d");
  });
});

describe("GET /", () => {
  it("returns HTML with the form and the result table", async () => {
    const res = get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("<form");
    expect(body).toContain('name="approach"');
    expect(body).toContain("<table>");
  });

  it("renders the same calculation as /calc when given the same query", async () => {
    const res = get("/?approach=4&target=0.999&burn_rate=14.4&window=10m");
    const body = await res.text();
    expect(body).toContain("0.36%"); // budget lost
  });

  it("displayed threshold drops to 1/10 when target changes to 99.99", async () => {
    const at999 = await get("/?approach=6&target=99.9").text();
    const at9999 = await get("/?approach=6&target=99.99").text();
    expect(at999).toContain("1.44%");
    expect(at9999).toContain("0.14%");
  });

  it("keeps the form visible and returns 400 on invalid input", async () => {
    const res = get("/?approach=1&window=xyz");
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("Input error");
    expect(body).toContain("<form");
  });
});

describe("other paths", () => {
  it("returns 404", () => {
    expect(get("/nope").status).toBe(404);
  });
});
