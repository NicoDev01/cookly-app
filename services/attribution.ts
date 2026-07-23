import { Capacitor, registerPlugin } from "@capacitor/core";

const storageKey = "cookly.attribution";

type AttributionTouch = {
  source?: string;
  medium?: string;
  campaign?: string;
  adSet?: string;
  creative?: string;
  keyword?: string;
  clickId?: string;
  referrer?: string;
  landingPage?: string;
  capturedAt: number;
};

type AttributionData = {
  firstTouch: AttributionTouch;
  lastTouch: AttributionTouch;
};

const useful = (touch: AttributionTouch) =>
  Boolean(touch.source || touch.campaign || touch.clickId || touch.referrer);

export const captureWebAttribution = (): AttributionData | null => {
  const params = new URLSearchParams(window.location.search);
  const touch: AttributionTouch = {
    source: params.get("utm_source") || undefined,
    medium: params.get("utm_medium") || undefined,
    campaign: params.get("utm_campaign") || undefined,
    adSet: params.get("utm_adset") || undefined,
    creative: params.get("utm_content") || undefined,
    keyword: params.get("utm_term") || undefined,
    clickId: params.get("gclid") || params.get("fbclid") || undefined,
    referrer: document.referrer || undefined,
    landingPage: window.location.href,
    capturedAt: Date.now(),
  };
  const stored = localStorage.getItem(storageKey);
  const existing = stored ? JSON.parse(stored) as AttributionData : null;
  if (!useful(touch)) return existing;
  const value = { firstTouch: existing?.firstTouch ?? touch, lastTouch: touch };
  localStorage.setItem(storageKey, JSON.stringify(value));
  return value;
};

export const storedAttribution = () => {
  const value = localStorage.getItem(storageKey);
  return value ? JSON.parse(value) as AttributionData : null;
};

type InstallReferrerResult = {
  referrer: string;
  clickAt: number;
  installAt: number;
};

const InstallReferrer = registerPlugin<{ get(): Promise<InstallReferrerResult> }>("InstallReferrer");

export const captureInstallAttribution = async () => {
  if (Capacitor.getPlatform() !== "android") return storedAttribution();
  try {
    const result = await InstallReferrer.get();
    const params = new URLSearchParams(result.referrer);
    const touch: AttributionTouch = {
      source: params.get("utm_source") || params.get("source") || "google_play",
      medium: params.get("utm_medium") || "install_referrer",
      campaign: params.get("utm_campaign") || undefined,
      creative: params.get("utm_content") || undefined,
      keyword: params.get("utm_term") || undefined,
      clickId: params.get("gclid") || undefined,
      landingPage: "google-play",
      capturedAt: result.clickAt || result.installAt || Date.now(),
    };
    const existing = storedAttribution();
    const value = { firstTouch: existing?.firstTouch ?? touch, lastTouch: touch };
    localStorage.setItem(storageKey, JSON.stringify(value));
    return value;
  } catch {
    return storedAttribution();
  }
};
