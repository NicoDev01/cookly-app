# Capacitor Config Patterns

## capacitor.config.ts — Full Production Config

```ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourcompany.appname',
  appName: 'AppName',
  webDir: 'dist',
  // Disable live reload in production
  server: {
    androidScheme: 'https',
    // iosScheme: 'https', // default
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,        // hide manually via SplashScreen.hide()
      launchAutoHide: false,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: 'launch_screen',  // Android custom layout
      useDialog: false,
    },
    StatusBar: {
      style: 'DEFAULT',             // 'DARK' | 'LIGHT' | 'DEFAULT'
      backgroundColor: '#ffffff',
      overlaysWebView: false,       // true = status bar floats over content
                                    // requires safe-area-inset-top handling
    },
    Keyboard: {
      resize: 'body',               // 'body' | 'ionic' | 'native' | 'none'
      resizeOnFullScreen: true,     // Android: resize even in fullscreen
      style: 'DARK',                // iOS keyboard appearance
      scrollAssist: true,           // auto-scroll focused input into view
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    contentInset: 'automatic',      // respect safe areas automatically
    backgroundColor: '#ffffff',
    preferredContentMode: 'mobile',
    scrollEnabled: false,           // disable root scroll; handle in app
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    backgroundColor: '#ffffff',
    allowMixedContent: false,       // security: no HTTP in HTTPS app
    captureInput: true,
    webContentsDebuggingEnabled: false, // set true only for dev builds
  },
};

export default config;
```

---

## Status Bar Plugin

```ts
import { StatusBar, Style, Animation } from '@capacitor/status-bar';

// Set style based on screen background
async function setStatusBarForDarkScreen() {
  await StatusBar.setStyle({ style: Style.Light }); // light icons on dark bg
}

async function setStatusBarForLightScreen() {
  await StatusBar.setStyle({ style: Style.Dark }); // dark icons on light bg
}

// Show/hide (e.g., for fullscreen image viewer)
await StatusBar.hide({ animation: Animation.Fade });
await StatusBar.show({ animation: Animation.Fade });

// Get current info
const info = await StatusBar.getInfo();
console.log(info.style, info.visible, info.color);
```

**Pattern:** Call `setStyle` in `useEffect` on each screen that has a different background color. Reset on unmount.

---

## Keyboard Plugin

```ts
import { Keyboard, KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

// Configure (also set in capacitor.config.ts)
await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
await Keyboard.setStyle({ style: KeyboardStyle.Dark });

// Listeners
const showListener = await Keyboard.addListener('keyboardWillShow', (info) => {
  console.log('keyboard height:', info.keyboardHeight);
  // Adjust bottom padding of scroll container
  document.documentElement.style.setProperty(
    '--keyboard-height',
    `${info.keyboardHeight}px`
  );
});

const hideListener = await Keyboard.addListener('keyboardWillHide', () => {
  document.documentElement.style.setProperty('--keyboard-height', '0px');
});

// Cleanup
showListener.remove();
hideListener.remove();

// Programmatic control
await Keyboard.hide();
await Keyboard.show(); // iOS only
```

---

## SplashScreen Plugin

```ts
import { SplashScreen } from '@capacitor/splash-screen';

// In your app entry point, after auth + initial data load:
async function hideSplash() {
  await SplashScreen.hide({
    fadeOutDuration: 300, // ms
  });
}

// Show again (e.g., during heavy navigation)
await SplashScreen.show({
  showDuration: 2000,
  autoHide: true,
  fadeInDuration: 200,
  fadeOutDuration: 300,
});
```

**Pattern used in this project:** `CooklySplashScreen.tsx` renders a custom in-app splash overlay. The native splash hides immediately; the React overlay fades out after auth resolves.

---

## AndroidManifest.xml — Key Settings

```xml
<manifest ...>
  <!-- Internet permission (required for WebView) -->
  <uses-permission android:name="android.permission.INTERNET" />

  <application
    android:hardwareAccelerated="true"   <!-- CRITICAL for WebView performance -->
    android:usesCleartextTraffic="false" <!-- security: block HTTP -->
    ...>

    <activity
      android:name=".MainActivity"
      android:exported="true"
      android:launchMode="singleTask"
      <!-- Resize layout when keyboard appears -->
      android:windowSoftInputMode="adjustResize"
      <!-- Keep screen on during splash -->
      android:screenOrientation="portrait"
      android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
      ...>
    </activity>
  </application>
</manifest>
```

**`adjustResize`** is required for the Keyboard plugin's resize mode to work correctly on Android.

---

## iOS Info.plist — Relevant Settings

Add these keys via Xcode or directly in `ios/App/App/Info.plist`:

```xml
<!-- Allow arbitrary loads only if absolutely necessary (avoid if possible) -->
<!-- <key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <false/>
</dict> -->

<!-- Camera access (if using image capture) -->
<key>NSCameraUsageDescription</key>
<string>Used to scan and photograph recipes.</string>

<!-- Photo library access -->
<key>NSPhotoLibraryUsageDescription</key>
<string>Used to select recipe images from your library.</string>

<!-- Face ID (if using biometric auth) -->
<key>NSFaceIDUsageDescription</key>
<string>Used for quick and secure sign-in.</string>

<!-- Prevent status bar from hiding on launch -->
<key>UIStatusBarHidden</key>
<false/>

<!-- Support all orientations or lock to portrait -->
<key>UISupportedInterfaceOrientations</key>
<array>
  <string>UIInterfaceOrientationPortrait</string>
</array>
```

---

## Capacitor Assets (capacitor-assets.json)

Use `@capacitor/assets` to generate all icon and splash sizes from a single source:

```json
{
  "assetPath": "assets",
  "iconBackgroundColor": "#ffffff",
  "iconBackgroundColorDark": "#111111",
  "splashBackgroundColor": "#ffffff",
  "splashBackgroundColorDark": "#111111"
}
```

Run: `npx @capacitor/assets generate`

Source files needed:
- `assets/icon-only.png` — 1024×1024, no padding, no alpha (iOS requirement)
- `assets/icon-foreground.png` — 1024×1024 with padding for Android adaptive icon
- `assets/icon-background.png` — 1024×1024 solid color or pattern
- `assets/splash.png` — 2732×2732 centered logo
- `assets/splash-dark.png` — dark mode variant
