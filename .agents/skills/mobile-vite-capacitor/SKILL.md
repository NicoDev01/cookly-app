---
name: mobile-vite-capacitor
description: Mobile frontend optimization for Vite + Capacitor apps targeting iOS and Android App Store. This skill should be used when optimizing mobile layouts, fixing safe area issues, improving touch targets, handling keyboard avoidance, optimizing Capacitor WebView performance, or preparing a Vite app for App Store submission. Triggers include "mobile layout", "capacitor", "safe area", "iOS", "Android", "touch target", "app store", "splash screen", "status bar", "keyboard", "WebView".
---

# Mobile Vite + Capacitor Skill

## Purpose

Provide production-ready patterns for building and optimizing React + Vite apps running inside Capacitor WebViews for iOS and Android App Store distribution. Covers safe areas, touch targets, performance, and store submission requirements.

**Stack:** React · Vite · Capacitor · Tailwind CSS · Shadcn UI

---

## When to Apply

Apply this skill when the task involves:
- Safe area / notch / home indicator layout issues
- Status bar color or visibility
- Keyboard pushing content or overlapping inputs
- Touch target sizing complaints
- iOS auto-zoom on input focus
- Android hardware back button handling
- Splash screen configuration
- WebView performance (jank, slow scroll, white flash)
- App Store / Play Store submission preparation
- Bundle size optimization for WebView

---

## 1. Safe Areas & Viewport

Set `viewport-fit=cover` in `index.html`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

Use CSS environment variables for insets:
```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
padding-left: env(safe-area-inset-left);
padding-right: env(safe-area-inset-right);
```

Prefer `100dvh` over `100vh` — `100vh` ignores the browser chrome on mobile:
```css
min-height: 100dvh; /* dynamic viewport height */
```

Define CSS custom properties once on `:root` and reuse everywhere (see `references/css-mobile-patterns.md`).

---

## 2. Touch Targets

- **Apple HIG minimum:** 44×44 pt
- **Material Design minimum:** 48×48 dp
- Never use touch targets smaller than `min-h-[44px] min-w-[44px]`
- Use `p-3` (12px) padding on icon buttons to expand hit area without changing visual size
- Apply `touch-manipulation` to interactive elements to eliminate 300ms tap delay:
  ```css
  touch-action: touch-manipulation;
  ```
- Tailwind shorthand: `min-h-[44px] min-w-[44px] flex items-center justify-center`

---

## 3. Typography Rules

- Set minimum `font-size: 16px` on all `<input>`, `<textarea>`, `<select>` — iOS zooms in on anything smaller
- Use system font stack for native feel and zero font-loading cost:
  ```css
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  ```
- Apply `user-select: none` to non-text UI elements (buttons, nav, icons) to prevent accidental text selection on long-press
- Avoid `text-size-adjust: none` — it breaks accessibility

---

## 4. Capacitor-Specific

### Status Bar
Use `@capacitor/status-bar` to control color and style:
```ts
import { StatusBar, Style } from '@capacitor/status-bar';
await StatusBar.setStyle({ style: Style.Dark });
await StatusBar.setBackgroundColor({ color: '#ffffff' });
```
Call on `app` resume and after navigation to dark/light screens.

### Keyboard Avoidance
Use `@capacitor/keyboard` with `resizeOnFullScreen: true` in `capacitor.config.ts`. Listen to keyboard events to adjust scroll position:
```ts
import { Keyboard } from '@capacitor/keyboard';
Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
  // shift focused input into view
});
```
Never rely on CSS `position: fixed` for inputs — it breaks on iOS when keyboard opens.

### Hardware Back Button (Android)
Register a listener to prevent accidental app exit and handle modal/sheet dismissal:
```ts
import { App } from '@capacitor/app';
App.addListener('backButton', ({ canGoBack }) => {
  if (!canGoBack) App.exitApp();
  else window.history.back();
});
```
See `docs/ANDROID_BACK_BUTTON.md` for the full pattern used in this project.

### Splash Screen
Configure `@capacitor/splash-screen` in `capacitor.config.ts`. Hide programmatically after app is ready:
```ts
import { SplashScreen } from '@capacitor/splash-screen';
await SplashScreen.hide({ fadeOutDuration: 300 });
```
Never auto-hide — wait for data/auth to load first to avoid flash of unauthenticated content.

### WebView Differences
- iOS WKWebView: no IndexedDB persistence across app restarts without entitlement; use Capacitor Preferences for small data
- Android WebView: enable hardware acceleration in `AndroidManifest.xml`
- Both: `position: fixed` elements can flicker during scroll — use `transform: translateZ(0)` to promote to GPU layer

---

## 5. CSS Performance

Use `transform` instead of `top`/`left`/`margin` for animations — avoids layout reflow:
```css
/* ✅ GPU-composited */
transform: translateX(100%);
/* ❌ triggers layout */
left: 100%;
```

Apply `will-change: transform` only on elements that will animate — overuse wastes GPU memory.

Target 60fps: keep animations under 16ms. Use `transition: transform 200ms ease-out` for sheet/modal entrances.

Use `content-visibility: auto` on long off-screen lists to skip rendering:
```css
.recipe-card { content-visibility: auto; contain-intrinsic-size: 0 200px; }
```

---

## 6. Scroll Behavior

Enable momentum scrolling on iOS scroll containers:
```css
overflow-y: scroll;
-webkit-overflow-scrolling: touch;
```

Prevent pull-to-refresh on the root element (Capacitor apps should not trigger browser refresh):
```css
body { overscroll-behavior-y: none; }
```

Allow overscroll on inner scroll containers where it makes sense:
```css
.scroll-container { overscroll-behavior-y: contain; }
```

---

## 7. Navigation Patterns

Bottom tab bar must account for home indicator on iPhone:
```css
.bottom-nav {
  padding-bottom: calc(env(safe-area-inset-bottom) + 8px);
}
```

Do not block horizontal swipe gestures — iOS uses edge swipe for back navigation. Avoid `overflow-x: hidden` on full-screen containers; use `overflow-x: clip` instead.

Use `pointer-events: none` on decorative overlays to keep swipe gestures passthrough.

---

## 8. React Performance (WebView Bundle Optimization)

Follow Vercel React Best Practices adapted for WebView constraints:

**No barrel imports** — they force the entire module graph to load eagerly:
```ts
// ❌ barrel import
import { Button, Card, Input } from '@/components/ui';
// ✅ direct import
import { Button } from '@/components/ui/button';
```

**Dynamic imports** for heavy screens (image editor, onboarding, modals):
```ts
const ImageEditor = lazy(() => import('./components/addRecipeModal/ImageEditor'));
```

**Parallel data fetching** — never waterfall:
```ts
const [recipes, categories] = await Promise.all([
  fetchRecipes(),
  fetchCategories(),
]);
```

**Vite bundle splitting** — configure `manualChunks` in `vite.config.ts` to separate vendor, Capacitor plugins, and app code.

**Avoid large dependencies** in the critical path — defer analytics, crash reporting, and non-essential plugins.

---

## 9. App Store Checklist

### iOS (App Store Connect)
- [ ] `viewport-fit=cover` set in `index.html`
- [ ] Safe area insets applied to all fixed/sticky elements
- [ ] No inputs with `font-size < 16px`
- [ ] Status bar style configured per screen
- [ ] Splash screen hides after content loads
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) added if using required reason APIs
- [ ] App icons: 1024×1024 PNG (no alpha), all required sizes generated
- [ ] Tested on notch device (iPhone 14+) and Dynamic Island device (iPhone 15+)
- [ ] Tested on iPad if universal app

### Android (Google Play Console)
- [ ] Hardware back button handled (no accidental exit)
- [ ] `android:windowSoftInputMode="adjustResize"` in `AndroidManifest.xml`
- [ ] Hardware acceleration enabled
- [ ] Target SDK ≥ 34 (current Play Store requirement)
- [ ] 64-bit APK/AAB
- [ ] App icons: adaptive icon with foreground + background layers
- [ ] Tested on Android 8+ (API 26+)
- [ ] Tested with gesture navigation (no bottom nav overlap)

---

## 10. Common Pitfalls

| Problem | Cause | Fix |
|---|---|---|
| White flash on app start | Splash screen hides too early | Hide after auth + first data load |
| iOS keyboard covers input | `position: fixed` input | Use Keyboard plugin + scroll into view |
| Android back exits app | No back button listener | Register `App.addListener('backButton')` |
| iOS auto-zoom on input | `font-size < 16px` | Set `font-size: 16px` minimum on inputs |
| Janky scroll | CSS `top/left` animation | Use `transform` only |
| Notch overlap | Missing `viewport-fit=cover` | Add to meta viewport tag |
| Home indicator overlap | Missing safe-area-inset-bottom | Add `pb-safe` or `env(safe-area-inset-bottom)` |
| Large bundle / slow start | Barrel imports, no code splitting | Direct imports + `React.lazy` |
| Pull-to-refresh triggers | Default browser overscroll | `overscroll-behavior-y: none` on body |

---

## References

- [`references/capacitor-config-patterns.md`](references/capacitor-config-patterns.md) — `capacitor.config.ts`, plugin configs, native manifest settings
- [`references/css-mobile-patterns.md`](references/css-mobile-patterns.md) — CSS custom properties, Tailwind classes, scroll/animation patterns
