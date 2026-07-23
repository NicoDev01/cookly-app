import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useConvexAuth, useMutation } from "convex/react";

import { api } from "../convex/_generated/api";
import { capture } from "../services/analytics";
import { APP_VERSION } from "../utils/appInfo";
import { logger } from "../utils/logger";
import { createUuid } from "../utils/uuid";
import type { Id } from "../convex/_generated/dataModel";

const deviceKey = "cookly.deviceId";
const pushEnabled = import.meta.env.VITE_PUSH_NOTIFICATIONS_ENABLED === "true";
const deviceId = () => {
  const existing = localStorage.getItem(deviceKey);
  if (existing) return existing;
  const value = createUuid();
  localStorage.setItem(deviceKey, value);
  return value;
};

export const PushLifecycle = () => {
  const { isAuthenticated } = useConvexAuth();
  const registerDevice = useMutation(api.push.registerDevice);
  const recordDelivery = useMutation(api.marketing.recordDelivery);

  useEffect(() => {
    if (!pushEnabled || !isAuthenticated || !Capacitor.isNativePlatform()) return;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    let registered = false;

    const setup = async () => {
      if (registered) return;
      const permission = await PushNotifications.checkPermissions();
      if (permission.receive !== "granted") return;
      registered = true;
      await PushNotifications.register();
      handles.push(await PushNotifications.addListener("registration", ({ value: token }) => {
        registerDevice({
          token,
          platform: Capacitor.getPlatform() === "ios" ? "ios" : "android",
          deviceId: deviceId(),
          locale: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          appVersion: APP_VERSION,
        }).catch((error) => logger.warn("Push", "Device registration failed", error));
      }));
      handles.push(await PushNotifications.addListener("pushNotificationReceived", (notification) => {
        capture("push_received", { campaignId: notification.data?.campaignId });
        if (notification.data?.campaignId) {
          void recordDelivery({ campaignId: notification.data.campaignId as Id<"campaigns">, event: "impression" });
        }
      }));
      handles.push(await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        capture("push_opened", { campaignId: notification.data?.campaignId });
        if (notification.data?.campaignId) {
          void recordDelivery({ campaignId: notification.data.campaignId as Id<"campaigns">, event: "clicked" });
        }
        const deepLink = notification.data?.deepLink;
        if (typeof deepLink === "string" && deepLink) window.location.hash = deepLink.replace(/^#/, "");
      }));
      handles.push(await PushNotifications.addListener("registrationError", (error) => {
        capture("push_failed", { errorCode: "TOKEN_REGISTRATION_FAILED" });
        logger.warn("Push", "Token registration failed", error);
      }));
    };

    setup().catch((error) => logger.warn("Push", "Push setup failed", error));
    const permissionGranted = () => setup().catch((error) => logger.warn("Push", "Push setup failed", error));
    window.addEventListener("cookly:notification-permission-granted", permissionGranted);
    return () => {
      window.removeEventListener("cookly:notification-permission-granted", permissionGranted);
      handles.forEach((handle) => void handle.remove());
    };
  }, [isAuthenticated, registerDevice, recordDelivery]);

  return null;
};
