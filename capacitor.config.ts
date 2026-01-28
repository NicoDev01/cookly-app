import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cookly.recipe",
  appName: "Cookly",
  webDir: "dist",
  icon: "public/logo.png",
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      launchFadeOutDuration: 500,
      backgroundColor: "#b2c8ba",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",

      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,

    },
  },
  android: {
    allowMixedContent: false, // SECURITY: Only HTTPS in production
    captureInput: false, // FIX: Enable keyboard autocomplete suggestions
    webContentsDebuggingEnabled: false, // CRITICAL: Must be false for Play Store
  },
};

export default config;
