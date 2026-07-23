import { Capacitor } from "@capacitor/core";

import { APP_BUILD, APP_VERSION } from "../utils/appInfo";
import {
  EVENT_REGISTRY,
  type AnalyticsProperties,
  type EventName,
} from "../analytics/eventRegistry";
import { convexClient } from "../convexClient";
import { api } from "../convex/_generated/api";
import { createUuid } from "../utils/uuid";

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const key = env?.VITE_POSTHOG_KEY;
const host = env?.VITE_POSTHOG_HOST || "https://eu.i.posthog.com";
const sessionKey = "cookly.sessionId";
const anonymousKey = "cookly.anonymousId";
const firstOpenKey = "cookly.firstOpen";

const storedId = (storage: Storage, name: string) => {
  const existing = storage.getItem(name);
  if (existing) return existing;
  const value = createUuid();
  storage.setItem(name, value);
  return value;
};

let initialized = false;
let context: AnalyticsProperties = {};
let posthog: typeof import("posthog-js").default | undefined;
let identified: { id: string; properties: AnalyticsProperties } | undefined;
const pending: Array<{ name: EventName; properties: AnalyticsProperties }> = [];
const mirroredEvents = new Set<EventName>([
  "signup_started", "signup_submitted", "signup_completed",
  "signin_succeeded", "onboarding_started", "onboarding_completed",
  "paywall_viewed", "checkout_started", "purchase_completed",
  "weekly_meal_added", "shopping_item_checked",
  "recipe_reopened",
  "screen_load_slow",
  "campaign_impression", "campaign_clicked", "campaign_converted",
  "push_opened", "push_converted", "experiment_exposed",
]);

export const getAnalyticsIdentity = () => ({
  anonymousId: storedId(localStorage, anonymousKey),
  sessionId: storedId(sessionStorage, sessionKey),
});

export const initAnalytics = () => {
  if (initialized) return;
  initialized = true;
  const identity = getAnalyticsIdentity();

  if (key) {
    void import("posthog-js").then(({ default: client }) => {
      posthog = client;
      client.init(key, {
        api_host: host,
        person_profiles: "identified_only",
        autocapture: true,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: false,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "[data-private], [data-payment]",
        },
        persistence: "localStorage+cookie",
        loaded: (loadedClient) => {
          loadedClient.register({
            anonymousId: identity.anonymousId,
            sessionId: identity.sessionId,
            platform: Capacitor.getPlatform(),
            appVersion: APP_VERSION,
            buildNumber: APP_BUILD,
            ...context,
          });
          if (identified) loadedClient.identify(identified.id, identified.properties);
          pending.splice(0).forEach((event) => loadedClient.capture(event.name, event.properties));
        },
      });
    }).catch(() => undefined);
  }

  capture(localStorage.getItem(firstOpenKey) ? "app_opened" : "app_first_open");
  localStorage.setItem(firstOpenKey, "1");
};

export const setAnalyticsContext = (next: AnalyticsProperties) => {
  context = { ...context, ...next };
  if (posthog) posthog.register(next);
};

export const identifyAnalyticsUser = (
  billingUserId: string,
  properties: AnalyticsProperties,
) => {
  setAnalyticsContext({ billingUserId });
  identified = { id: billingUserId, properties };
  if (posthog) posthog.identify(billingUserId, properties);
};

export const resetAnalyticsIdentity = () => {
  capture("logout");
  context = {};
  identified = undefined;
  sessionStorage.removeItem(sessionKey);
  localStorage.removeItem(anonymousKey);
  pending.length = 0;
  if (posthog) posthog.reset(true);
};

export const capture = (name: EventName, properties: AnalyticsProperties = {}) => {
  const identity = getAnalyticsIdentity();
  const occurredAt = Date.now();
  const payload = {
    ...identity,
    platform: Capacitor.getPlatform(),
    appVersion: APP_VERSION,
    buildNumber: APP_BUILD,
    ...context,
    ...properties,
    eventVersion: EVENT_REGISTRY[name].version,
  };
  if (posthog) posthog.capture(name, payload);
  else if (key) pending.push({ name, properties: payload });
  if (mirroredEvents.has(name)) {
    void convexClient.mutation(api.analytics.record, {
      eventId: createUuid(),
      name,
      version: EVENT_REGISTRY[name].version,
      anonymousId: identity.anonymousId,
      sessionId: identity.sessionId,
      correlationId: typeof payload.correlationId === "string" ? payload.correlationId : undefined,
      operationId: typeof payload.operationId === "string" ? payload.operationId : undefined,
      platform: String(payload.platform),
      appVersion: String(payload.appVersion),
      screen: typeof payload.screen === "string" ? payload.screen : undefined,
      properties,
      occurredAt,
    }).catch(() => undefined);
  }
};

export const withCorrelation = (correlationId = createUuid()) => {
  setAnalyticsContext({ correlationId });
  return correlationId;
};

export const featureFlag = <T extends string | boolean>(keyName: string, fallback: T): T => {
  if (!key) return fallback;
  return (posthog?.getFeatureFlag(keyName) as T | undefined) ?? fallback;
};

export const exposeExperiment = (experimentId: string, variant: string) =>
  capture("experiment_exposed", { experimentId, variant });
