// Cloudflare Workers entry point. Hono serves the /calc API; the React UI in
// app/ is built to dist/client and served as static assets by the Workers
// runtime (see [assets] in wrangler.toml), so "/" never reaches this code in
// production.

import { Hono } from "hono";
import { InputError } from "./calc";
import { compute, readForm } from "./params";
import { renderJson, renderText } from "./render";

const app = new Hono();

app.get("/calc", (c) => {
  const fv = readForm(new URL(c.req.url).searchParams);
  const wantsJson = (c.req.header("accept") ?? "").includes("json");
  const json = (value: unknown, status: 200 | 400) =>
    c.body(JSON.stringify(value, null, 2) + "\n", status, {
      "content-type": "application/json; charset=utf-8",
    });
  try {
    const comp = compute(fv);
    return wantsJson ? json(renderJson(comp), 200) : c.text(renderText(comp));
  } catch (e) {
    if (e instanceof InputError) {
      return wantsJson ? json({ error: e.message }, 400) : c.text(`error: ${e.message}\n`, 400);
    }
    throw e;
  }
});

export default app;
