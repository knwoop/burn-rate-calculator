// Cloudflare Workers fetch handler. It only routes and picks the Content-Type;
// calculations live in src/calc.ts and formatting in src/render.ts.

import { InputError } from "./calc";
import { compute, readForm } from "./params";
import { renderJson, renderPage, renderText } from "./render";

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2) + "\n", {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      const fv = readForm(url.searchParams);
      try {
        return html(renderPage(fv, compute(fv)));
      } catch (e) {
        if (e instanceof InputError) return html(renderPage(fv, null, e.message), 400);
        throw e;
      }
    }

    if (url.pathname === "/calc") {
      const fv = readForm(url.searchParams);
      const wantsJson = (request.headers.get("accept") ?? "").includes("json");
      try {
        const comp = compute(fv);
        return wantsJson ? json(renderJson(comp)) : text(renderText(comp));
      } catch (e) {
        if (e instanceof InputError) {
          return wantsJson ? json({ error: e.message }, 400) : text(`error: ${e.message}\n`, 400);
        }
        throw e;
      }
    }

    return text("not found\n", 404);
  },
} satisfies ExportedHandler;
