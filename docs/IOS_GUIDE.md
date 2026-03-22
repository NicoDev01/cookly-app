# iOS Implementation Guide for Cookly

This guide outlines the steps required to make the Cookly Vite + Capacitor app available on iOS and the Apple App Store.

## 1. Prerequisites

To build and deploy an iOS app, you need:
- **macOS Hardware:** A Mac (MacBook, iMac, Mac mini) is required for Xcode.
- **Xcode:** Install the latest version of Xcode from the Mac App Store (Xcode 15+ recommended).
- **CocoaPods:** Install CocoaPods (`sudo gem install cocoapods`) for managing native dependencies.
- **Apple Developer Account:** To publish on the App Store, you need a paid membership ($99/year).

## 2. Adding iOS Platform

Run the following commands in your project root:

```bash
# Install the iOS platform package
npm install @capacitor/ios

# Add the iOS platform to your project
npx cap add ios
```

## 3. Configuration

### capacitor.config.ts
Ensure your `appId` and `appName` are correct. For iOS, the `appId` must match the Bundle Identifier in Xcode.

### Clerk (Authentication)
For iOS, you need to handle deep links so that Clerk can redirect back to your app after authentication.
1. In Xcode, go to **Info** -> **URL Types**.
2. Add a new URL Type with an identifier like `com.cookly.recipe` and a URL Scheme (e.g., `cookly`).
3. Update your Clerk configuration to use this scheme for redirects.

## 4. Assets Generation (Icons & Splash Screen)

Capacitor uses a tool called `@capacitor/assets` to generate all required image sizes from a single source file.

1. Prepare a `assets/logo.png` (1024x1024) and `assets/splash.png` (2732x2732).
2. Run the generation tool:
```bash
npx capacitor-assets generate --ios
```

## 5. Building and Syncing

Whenever you make changes to the web code, follow this workflow:

```bash
# 1. Build the Vite project
npm run build

# 2. Sync the web code and plugins to the iOS project
npx cap sync ios

# 3. Open Xcode to run or archive the app
npx cap open ios
```

## 6. Important Considerations for iOS

### ⚠️ Apple App Store Guidelines (Stripe vs. IAP)
**Critical:** Apple's Guideline 3.1.1 requires that any digital content or features (like "Pro" subscriptions) unlocked within the app **must** use Apple's **In-App Purchase (IAP)** system.
- Using Stripe for digital subscriptions on iOS will likely lead to **app rejection**.
- **Solution:** You must implement the `@capacitor/revenue-cat` or `@capacitor-community/apple-pay` (if selling physical goods, which isn't the case here) or direct Apple IAP logic for the iOS version.

### Safe Area
iOS devices with notches (iPhone X and newer) require "Safe Area" handling.
- Ensure your CSS uses `padding-top: env(safe-area-inset-top)` and `padding-bottom: env(safe-area-inset-bottom)` to avoid content being covered by the notch or home indicator.
- The current Tailwind configuration should already handle some of this, but verify the `BottomNav`.

### Permissions
If you use the Camera (Recipe Scanner), you must provide a "Purpose String" in `Info.plist`:
- `NSCameraUsageDescription`: "Cookly needs access to your camera to scan recipes from photos."

### Share Extension (Optional)
The "Share to Cookly" feature currently uses `capacitor-send-intent`, which is Android-specific. To support sharing from other apps on iOS (e.g., Safari to Cookly):
1. You must add a **Share Extension** target in your Xcode project.
2. Configure it to open your app using your custom URL scheme (e.g., `cookly://share?url=...`).
3. Handle this deep link in `services/deepLinkHandler.ts`.

## 7. App Store Submission

### Checklist before submission
- [ ] **App Store Connect:** Create a new app entry at [appstoreconnect.apple.com](https://appstoreconnect.apple.com).
- [ ] **Privacy Policy:** Required for all App Store apps.
- [ ] **Screenshots:** Provide screenshots for 6.5" (iPhone 13/14/15 Pro Max) and 5.5" (iPhone 8 Plus) displays.
- [ ] **Review Account:** Provide a test user account (Clerk login) for the Apple Review team to test the app.
- [ ] **Guideline 3.1.1:** Ensure you are NOT using Stripe for digital subscriptions. Switch to Apple In-App Purchases (IAP).

### Uploading the build
1. **Archive the App:** In Xcode, select "Any iOS Device (arm64)" as the destination. Go to `Product` -> `Archive`.
2. **Validate:** Once the archive is created, click "Validate App" to check for common issues.
3. **Distribute:** Click "Distribute App" and follow the prompts to upload it to App Store Connect.
4. **TestFlight:** Once uploaded and processed, you can invite testers via TestFlight before official submission.
5. **Submit for Review:** In App Store Connect, select the build and click "Submit for Review".
