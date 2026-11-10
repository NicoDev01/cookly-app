import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

// WebView-Remote-Debugging (chrome://inspect) ist standardmäßig AUS (Release sicher).
// Für eine inspizierbare Debug-APK gezielt aktivieren:
//   COOKLY_DEBUG_WEBVIEW=1 npm run build:android   (bzw. npx cap sync android)
// Bewusst ein explizites Opt-in-Flag statt NODE_ENV: `cap sync` läuft als eigener
// Prozess, in dem NODE_ENV nicht zuverlässig auf "production" steht – ein Default
// über NODE_ENV würde Release-Builds versehentlich debuggbar machen.
const webContentsDebuggingEnabled = process.env.COOKLY_DEBUG_WEBVIEW === '1';

const config: CapacitorConfig = {
  appId: 'com.cookly.recipe',
  appName: 'Cookly',
  webDir: 'dist',
  server: {
    androidScheme: 'https', // Oder 'cookly'
    // https statt capacitor://: gleicher Origin wie Android/Web, damit localStorage
    // (Convex-Auth-Token) geteilt bleibt — Login-Persistenz muss auf dem Mac gegen
    // den echten Convex-Login getestet werden.
    iosScheme: 'https',
    hostname: 'cookly-app.com',
    allowNavigation: [
      'cookly-app.com',
      '*.convex.cloud',             // Convex backend (WebSocket + HTTP)
      '*.convex.site',              // Convex Auth HTTP routes
      'accounts.google.com',
      'accounts.youtube.com',
      'oauth.googleusercontent.com',
    ],
  },

  plugins: {
    // iOS: Die WebView schrumpft mit der Tastatur, statt dass WKWebView die ganze Seite nach oben schiebt.
    // Die Shell (fixed inset-0) und vh-Sheets passen sich damit von selbst an; die Tab-Leiste blendet
    // App.tsx bei offener Tastatur aus. Helle Tastatur, weil Cookly nur ein helles Theme hat.
    Keyboard: {
      resize: KeyboardResize.Native,
      style: KeyboardStyle.Light,
      // Hinter der Tastatur liegt nach dem Verkleinern das UIWindow (Standard schwarz); an den runden
      // Tastatur-Ecken blitzte es schwarz. 'auto' färbt das Fenster in ios.backgroundColor (#f0f2f5).
      autoBackdropColor: 'auto',
    },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#f0f2f5",
    },
    LottieSplashScreen: {
      enabled: true,
      animationLight: "public/lottie.json", // Light mode animation
      animationDark: "public/lottie.json",  // Optional: same animation for dark mode (can be separate file)
      backgroundLight: "#f0f2f5",
      backgroundDark: "#f0f2f5",
      autoHide: false,                      // We control hide manually via appLoaded()
      loop: true,                           // Keep looping until app is fully ready (smooth transition)
    },
  },
  android: {
    allowMixedContent: false, // SECURITY: Only HTTPS in production
    captureInput: false, // FIX: Enable keyboard autocomplete suggestions
    webContentsDebuggingEnabled,
  },
  ios: {
    // Default in Capacitor ist 'never' (UIScrollViewContentInsetAdjustmentNever).
    // Bewusst 'never' statt 'always': Cookly nutzt viewport-fit=cover und handhabt
    // Safe Areas (Notch, Home-Indicator) selbst per CSS (env(safe-area-inset-*)).
    // 'always' würde die WKWebView künstlich einrücken und zu doppelten Insets führen.
    contentInset: 'never',
    // Gleiche Farbe wie LaunchScreen.storyboard und App-Hintergrund: kein weißer Blitz beim Start.
    backgroundColor: '#f0f2f5',
    // Capacitor-Default ist true: Langes Drücken auf einen Link (jeder Tab, jede Rezeptkarte)
    // öffnet sonst Safaris Link-Vorschau statt des eigenen Long-Press-Menüs.
    allowsLinkPreview: false,
  },
};

export default config;
