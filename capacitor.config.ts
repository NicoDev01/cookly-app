import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: 'com.cookly.recipe',
  appName: 'Cookly',
  webDir: 'dist',
  server: {
    androidScheme: 'https', // Oder 'cookly'
    hostname: 'cookly-app.com',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#ffffff",
    },
    LottieSplashScreen: {
      enabled: true,
      animationLight: "public/lottie.json", // Light mode animation
      animationDark: "public/lottie.json",  // Optional: same animation for dark mode (can be separate file)
      backgroundLight: "#ffffff",          // Always white (no dark mode support)
      backgroundDark: "#ffffff",           // Always white (no dark mode support)
      autoHide: false,                      // We control hide manually via appLoaded()
      loop: true,                           // Keep looping until app is fully ready (smooth transition)
    },
  },
  android: {
    allowMixedContent: false, // SECURITY: Only HTTPS in production
    captureInput: false, // FIX: Enable keyboard autocomplete suggestions
    webContentsDebuggingEnabled: false,
    allowNavigation: [
      'cookly-app.com',
      '*.convex.cloud',             // Convex backend (WebSocket + HTTP)
      '*.convex.site',              // Convex Auth HTTP routes
      'accounts.google.com',
      'accounts.youtube.com',
      'oauth.googleusercontent.com',
    ],
  },
};

export default config;
