import { Capacitor } from "@capacitor/core";
import * as Sentry from "@sentry/react";

import { APP_VERSION } from "../utils/appInfo";
import { registerLogSink, type LogEntry } from "../utils/logger";

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const dsn = env?.VITE_SENTRY_DSN;
const keptIntegrations = new Set(["InboundFilters", "FunctionToString", "LinkedErrors", "Dedupe"]);
const criticalScopes = new Set(["AccountDeletion", "Billing", "Boot", "ErrorBoundary", "Global"]);
const ignoredScopes = new Set(["Auth", "Notifications"]);

const routeTag = () => {
  const [section, child] = window.location.hash.replace(/^#\/?/, "").split(/[/?]/);
  const clean = (value = "") => value.replace(/[^a-z0-9_-]/gi, "");
  return section === "tabs" && child ? `tabs/${clean(child)}` : clean(section) || "root";
};

const errorDetails = (data: unknown) => {
  if (!data || typeof data !== "object") return undefined;
  const outer = data as { error?: unknown; stack?: unknown };
  const value = outer.error instanceof Error ? outer.error : outer;
  return value as { message?: unknown; stack?: unknown };
};

const sentryError = (entry: LogEntry) => {
  const fallback = `[${entry.scope}] ${entry.message}`;
  const source = errorDetails(entry.data);
  const detail =
    typeof source?.message === "string" ? source.message.slice(0, 1_000) : "";
  const message = detail && detail !== entry.message ? `${fallback}: ${detail}` : fallback;
  const error = new Error(message);

  if (typeof source?.stack === "string") {
    error.stack = `${error.name}: ${message}\n${source.stack.split(/\r?\n/).slice(1, 50).join("\n")}`;
  }

  return error;
};

if (dsn && env?.PROD) {
  try {
    Sentry.init({
      dsn,
      release: `cookly@${APP_VERSION}`,
      environment: env.MODE ?? "production",
      sendDefaultPii: false,
      enableLogs: false,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      maxBreadcrumbs: 30,
      integrations: (defaults) => defaults.filter(({ name }) => keptIntegrations.has(name)),
      beforeBreadcrumb: ({ category, level, message, timestamp, type }) => ({
        category,
        level,
        message,
        timestamp,
        type,
      }),
      beforeSend: (event) => {
        delete event.request;
        delete event.user;
        return event;
      },
    });

    registerLogSink((entry) => {
      if (entry.level === "warn") {
        Sentry.addBreadcrumb({ category: entry.scope, level: "warning", message: entry.message });
        return;
      }
      if (ignoredScopes.has(entry.scope)) return;

      Sentry.withScope((scope) => {
        scope.setTags({ platform: Capacitor.getPlatform(), route: routeTag(), scope: entry.scope });
        scope.setLevel(criticalScopes.has(entry.scope) ? "fatal" : "error");
        Sentry.captureException(sentryError(entry));
      });
    });
  } catch {
    // Observability must never prevent the app from starting.
  }
}

export const setObservabilityIdentity = (billingUserId?: string) => {
  Sentry.setTag("billingUserId", billingUserId ?? "anonymous");
};

export const setObservabilityContext = (values: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(values)) {
    if (value) Sentry.setTag(key, value);
  }
};
