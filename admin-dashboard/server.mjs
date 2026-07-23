import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.ADMIN_PORT || 4174);
const convexUrl = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");
const adminToken = process.env.COOKLY_ADMIN_TOKEN;

const send = (response, status, body, type = "application/json; charset=utf-8") => {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": type.startsWith("text/html") ? "no-store" : "private, no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

const body = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
};

const convex = async (path, init = {}) => {
  if (!convexUrl || !adminToken) throw new Error("CONVEX_SITE_URL oder COOKLY_ADMIN_TOKEN fehlt");
  const response = await fetch(`${convexUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Convex ${response.status}: ${await response.text()}`);
  return response.json();
};

const external = async (url, headers, init = {}) => {
  const response = await fetch(url, { ...init, headers: { ...headers, ...init.headers } });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
};

const connectorData = async () => {
  const settled = await Promise.allSettled([
    process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
      ? external(
          `https://sentry.io/api/0/projects/${process.env.SENTRY_ORG}/${process.env.SENTRY_PROJECT}/issues/?query=is%3Aunresolved+level%3A%5Berror%2Cfatal%5D`,
          { authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
        )
      : Promise.resolve([]),
    process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID
      ? external(
          `${process.env.POSTHOG_API_HOST || "https://eu.posthog.com"}/api/projects/${process.env.POSTHOG_PROJECT_ID}/feature_flags/`,
          { authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}` },
        )
      : Promise.resolve({ results: [] }),
    process.env.STRIPE_SECRET_KEY
      ? external("https://api.stripe.com/v1/balance_transactions?limit=100", {
          authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        })
      : Promise.resolve({ data: [] }),
    process.env.REVENUECAT_CHARTS_URL && process.env.REVENUECAT_SECRET_KEY
      ? external(process.env.REVENUECAT_CHARTS_URL, {
          authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}`,
        })
      : Promise.resolve(null),
    process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID
      ? external(
          `${process.env.POSTHOG_API_HOST || "https://eu.posthog.com"}/api/projects/${process.env.POSTHOG_PROJECT_ID}/surveys/`,
          { authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}` },
        )
      : Promise.resolve({ results: [] }),
  ]);
  const value = (index, fallback) => settled[index].status === "fulfilled" ? settled[index].value : fallback;
  return {
    sentryIssues: value(0, []),
    featureFlags: value(1, { results: [] }).results ?? value(1, []),
    stripeTransactions: value(2, { data: [] }).data ?? [],
    revenueCat: value(3, null),
    surveys: value(4, { results: [] }).results ?? value(4, []),
    posthogProjectUrl: process.env.POSTHOG_PROJECT_ID
      ? `${process.env.POSTHOG_API_HOST || "https://eu.posthog.com"}/project/${process.env.POSTHOG_PROJECT_ID}`
      : null,
    errors: settled.flatMap((result, index) =>
      result.status === "rejected" ? [{ connector: ["sentry", "posthog", "stripe", "revenuecat", "posthog-surveys"][index], message: result.reason.message }] : []),
  };
};

const api = async (request, response, url) => {
  if (url.pathname === "/api/snapshot" && request.method === "GET") {
    const [snapshot, connectors] = await Promise.all([convex("/admin/snapshot"), connectorData()]);
    return send(response, 200, { ...snapshot, connectors });
  }
  if (url.pathname === "/api/users" && request.method === "GET") {
    return send(response, 200, await convex(`/admin/users?search=${encodeURIComponent(url.searchParams.get("search") || "")}`));
  }
  if (url.pathname === "/api/user" && request.method === "GET") {
    return send(response, 200, await convex(`/admin/user?billingUserId=${encodeURIComponent(url.searchParams.get("billingUserId") || "")}`));
  }
  if (url.pathname === "/api/campaigns" && request.method === "GET") {
    return send(response, 200, await convex("/admin/campaigns"));
  }
  if (url.pathname === "/api/campaigns" && request.method === "POST") {
    return send(response, 201, await convex("/admin/campaigns", { method: "POST", body: JSON.stringify(await body(request)) }));
  }
  if (url.pathname === "/api/campaigns/status" && request.method === "PATCH") {
    return send(response, 200, await convex("/admin/campaigns/status", { method: "PATCH", body: JSON.stringify(await body(request)) }));
  }
  if (url.pathname === "/api/experiments" && request.method === "POST") {
    if (!process.env.POSTHOG_PERSONAL_API_KEY || !process.env.POSTHOG_PROJECT_ID) throw new Error("PostHog Admin-Zugang fehlt");
    const data = await body(request);
    const variants = data.variants?.length ? data.variants : ["control", "test"];
    const percentage = Math.floor(100 / variants.length);
    const flag = await external(
      `${process.env.POSTHOG_API_HOST || "https://eu.posthog.com"}/api/projects/${process.env.POSTHOG_PROJECT_ID}/feature_flags/`,
      { authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}` },
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: data.key,
          name: data.name,
          active: false,
          filters: {
            groups: [{ properties: [], rollout_percentage: data.rollout }],
            multivariate: { variants: variants.map((key, index) => ({
              key,
              rollout_percentage: index === variants.length - 1 ? 100 - percentage * index : percentage,
            })) },
          },
        }),
      },
    );
    return send(response, 201, await convex("/admin/experiments", {
      method: "POST",
      body: JSON.stringify({ ...data, variants, posthogFlagId: flag.id }),
    }));
  }
  if (url.pathname === "/api/experiments/status" && request.method === "PATCH") {
    const data = await body(request);
    if (data.posthogFlagId && process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID) {
      await external(
        `${process.env.POSTHOG_API_HOST || "https://eu.posthog.com"}/api/projects/${process.env.POSTHOG_PROJECT_ID}/feature_flags/${data.posthogFlagId}/`,
        { authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}` },
        { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: data.status === "running" }) },
      );
    }
    return send(response, 200, await convex("/admin/experiments/status", {
      method: "PATCH",
      body: JSON.stringify({ id: data.id, status: data.status, winner: data.winner, result: data.result }),
    }));
  }
  if (url.pathname === "/api/marketing-spend" && request.method === "POST") {
    return send(response, 201, await convex("/admin/marketing-spend", { method: "POST", body: JSON.stringify(await body(request)) }));
  }
  if (url.pathname === "/api/costs" && request.method === "POST") {
    return send(response, 201, await convex("/admin/costs", { method: "POST", body: JSON.stringify(await body(request)) }));
  }
  if (url.pathname.startsWith("/api/feature-flags/") && request.method === "PATCH") {
    if (!process.env.POSTHOG_PERSONAL_API_KEY || !process.env.POSTHOG_PROJECT_ID) throw new Error("PostHog Admin-Zugang fehlt");
    const id = url.pathname.split("/").pop();
    const result = await external(
      `${process.env.POSTHOG_API_HOST || "https://eu.posthog.com"}/api/projects/${process.env.POSTHOG_PROJECT_ID}/feature_flags/${id}/`,
      {
        authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
        "content-type": "application/json",
      },
      { method: "PATCH", body: JSON.stringify(await body(request)) },
    );
    return send(response, 200, result);
  }
  return send(response, 404, { error: "Not found" });
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await api(request, response, url);
    const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!/^[a-z0-9_.-]+$/i.test(path)) return send(response, 404, "Not found", "text/plain");
    send(response, 200, await readFile(join(root, "public", path)), types[extname(path)] || "application/octet-stream");
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Cookly Admin: http://127.0.0.1:${port}`);
});
