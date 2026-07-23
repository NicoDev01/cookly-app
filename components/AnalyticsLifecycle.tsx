import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocation } from "react-router-dom";

import { api } from "../convex/_generated/api";
import {
  capture,
  getAnalyticsIdentity,
  identifyAnalyticsUser,
  initAnalytics,
  setAnalyticsContext,
} from "../services/analytics";
import {
  setObservabilityContext,
  setObservabilityIdentity,
} from "../services/observability";
import {
  captureInstallAttribution,
  captureWebAttribution,
  storedAttribution,
} from "../services/attribution";

const screenName = (pathname: string) =>
  pathname
    .replace(/^\/+/, "")
    .replace(/\/[^/]+$/, (part) => (/^\/(tabs|categories|profile|weekly|shopping|favorites|subscribe)$/.test(part) ? part : "/:id"))
    || "root";

export const AnalyticsLifecycle = () => {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");
  const touchActivity = useMutation(api.users.touchActivity);
  const recordAttribution = useMutation(api.users.recordAttribution);
  const location = useLocation();
  const previous = useRef<string | undefined>(undefined);
  const enteredAt = useRef(0);
  const syncedUser = useRef<string>();

  useEffect(() => {
    initAnalytics();
    captureWebAttribution();
    void captureInstallAttribution().then((attribution) => {
      if (!attribution || localStorage.getItem("cookly.installTracked")) return;
      localStorage.setItem("cookly.installTracked", "1");
      capture("app_installed", {
        acquisitionSource: attribution.firstTouch.source,
        acquisitionCampaign: attribution.firstTouch.campaign,
      });
    });
    const { anonymousId, sessionId } = getAnalyticsIdentity();
    setObservabilityContext({ anonymousId, sessionId });

    const offline = () => capture("network_offline");
    const online = () => capture("network_restored");
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  useEffect(() => {
    if (!user?.billingUserId) {
      setObservabilityIdentity();
      return;
    }
    const properties = {
      plan: user.subscription ?? "free",
      subscriptionStatus: user.subscriptionStatus ?? "active",
      onboardingGoal: user.onboardingGoal,
      acquisitionSource: user.acquisitionSource,
      acquisitionCampaign: user.acquisitionCampaign,
    };
    identifyAnalyticsUser(user.billingUserId, properties);
    setObservabilityIdentity(user.billingUserId);
    setObservabilityContext({
      plan: String(properties.plan),
      subscriptionStatus: String(properties.subscriptionStatus),
    });
  }, [
    user?.billingUserId,
    user?.subscription,
    user?.subscriptionStatus,
    user?.onboardingGoal,
    user?.acquisitionSource,
    user?.acquisitionCampaign,
  ]);

  useEffect(() => {
    if (!user?._id) {
      syncedUser.current = undefined;
      return;
    }
    if (syncedUser.current === user._id) return;
    syncedUser.current = user._id;

    void touchActivity();
    const attribution = storedAttribution();
    if (attribution) void recordAttribution({ touch: attribution.lastTouch });
  }, [user?._id, touchActivity, recordAttribution]);

  useEffect(() => {
    const screen = screenName(location.pathname);
    const now = performance.now();
    if (previous.current) {
      capture("screen_left", {
        screen: previous.current,
        nextScreen: screen,
        durationMs: Math.round(now - enteredAt.current),
      });
    }
    setAnalyticsContext({ screen, previousScreen: previous.current });
    setObservabilityContext({ screen });
    capture("screen_viewed", { screen, previousScreen: previous.current });
    previous.current = screen;
    enteredAt.current = now;

    const frame = requestAnimationFrame(() => {
      const durationMs = Math.round(performance.now() - now);
      capture(durationMs > 2_000 ? "screen_load_slow" : "screen_load_completed", {
        screen,
        durationMs,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);

  return null;
};
