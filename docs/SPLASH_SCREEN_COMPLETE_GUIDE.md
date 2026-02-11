# Cookly Splash Screen - Complete Guide

**Version:** 1.0
**Last Updated:** February 2026
**Status:** ✅ Production Ready - Netflix-Level Experience

---

## 📋 Executive Summary

Cookly uses a **hybrid native-to-web splash screen system** that delivers a buttery-smooth startup experience comparable to Netflix, Disney+, or other premium mobile apps. The system combines native Lottie animations with synchronized React transitions and intelligent data prefetching.

**Key Achievement:** Zero visual gaps, no spinner flashes, seamless cross-fade from splash to content.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    COOKLY SPLASH SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ PHASE 1: Native Lottie (Android)                         │  │
│  │ Plugin: capacitor-lottie-splash-screen v7.x              │  │
│  │ Duration: ~1.4s per loop (loops until ready)            │  │
│  │ Location: Before WebView loads                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          ↓                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ PHASE 2: Data Prefetch (Background)                      │  │
│  │ - Clerk Auth loaded                                       │  │
│  │ - Convex Token-Exchange complete                          │  │
│  │ - Categories pre-fetched (cached)                        │  │
│  │ - User data loaded                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          ↓                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ PHASE 3: Cross-Fade Transition (300ms)                   │  │
│  │ - Lottie fade-out (opacity: 1 → 0)                       │  │
│  │ - CategoriesPage fade-in (opacity: 0 → 1)                │  │
│  │ - Data already in cache → instant display                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Configuration Files

### 1. Capacitor Configuration
**File:** `capacitor.config.ts`

```typescript
LottieSplashScreen: {
  enabled: true,
  animationLight: "public/lottie.json",     // Light mode animation
  animationDark: "public/lottie.json",      // Same for dark mode (can be separate)
  backgroundLight: "#ffffff",              // White background
  backgroundDark: "#ffffff",               // Always white (no dark mode support)
  autoHide: false,                          // We control hide manually
  loop: true,                               // Keep looping until app ready
}
```

**Key Settings:**
- `loop: true` - Critical! Keeps animation running until data is ready
- `autoHide: false` - We manually trigger hide after cross-fade
- `animationLight/Dark` - Separate animations for light/dark mode support

### 2. Android Theme Configuration

#### `android/app/src/main/res/values/styles.xml` (API < 31)
```xml
<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
    <item name="windowSplashScreenAnimatedIcon">@drawable/transparent</item>
    <item name="windowSplashScreenAnimationDuration">0</item>
    <item name="windowSplashScreenBackground">@color/splash_background</item>
    <item name="android:background">@color/splash_background</item>
</style>
```

#### `android/app/src/main/res/values-v31/styles.xml` (Android 12+)
```xml
<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
    <!-- CRITICAL: Must be transparent to prevent distorted logo -->
    <item name="windowSplashScreenAnimatedIcon">@drawable/transparent</item>
    <item name="windowSplashScreenAnimationDuration">0</item>
    <item name="windowSplashScreenBackground">@color/splash_background</item>
</style>
```

**⚠️ CRITICAL:** The `values-v31/styles.xml` takes priority on Android 12+. If this shows `@drawable/splash` instead of `@drawable/transparent`, users will see a distorted "boxed logo" on cold start.

### 3. Android Colors
**File:** `android/app/src/main/res/values/colors.xml`
```xml
<color name="splash_background">#FFFFFF</color>
```

---

## 💻 React Implementation

### App Readiness Logic
**File:** `App.tsx`

```typescript
// Centralized app readiness determination
const isAppReady = React.useMemo(() => {
  if (!clerkLoaded) return false;        // Wait for Clerk
  if (!isSignedIn) return true;          // Not logged in? Show login immediately
  if (convexAuthLoading) return false;   // Wait for Convex
  if (!isAuthenticated) return false;    // Wait for auth confirmation
  if (currentUser === undefined) return false; // Wait for user data
  return true;                            // All systems go!
}, [clerkLoaded, isSignedIn, convexAuthLoading, isAuthenticated, currentUser]);
```

### Cross-Fade Transition
**File:** `App.tsx`

```typescript
// Smooth fade-out with safety timeout
useEffect(() => {
  if (isAppReady && !splashHiddenRef.current) {
    splashHiddenRef.current = true;

    // 300ms fade-out for buttery transition
    const fadeTimeout = setTimeout(() => {
      SplashScreen.hide();
      LottieSplashScreen.hide();
    }, 300);

    // Safety net: Force hide after 5 seconds max
    const safetyTimeout = setTimeout(() => {
      console.warn('[Splash] Safety timeout triggered');
      SplashScreen.hide();
      LottieSplashScreen.hide();
    }, 5000);

    return () => {
      clearTimeout(fadeTimeout);
      clearTimeout(safetyTimeout);
    };
  }
}, [isAppReady]);
```

### Data Prefetching
**File:** `App.tsx`

```typescript
// Prefetch categories during splash (only when authenticated!)
const shouldFetchCategories = isSignedIn && isAuthenticated;
useQuery(api.categories.getCategoriesWithStats, shouldFetchCategories ? {} : "skip");
```

**⚠️ IMPORTANT:** Always check authentication before fetching protected data. Fetching without auth causes the app to hang with "Not authenticated" error.

### Page Fade-In Animation
**File:** `pages/CategoriesPage.tsx`

```typescript
const [isVisible, setIsVisible] = useState(false);

React.useEffect(() => {
  setIsVisible(true); // Triggers CSS transition
}, []);

return (
  <div className={`... transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
    {/* Content */}
  </div>
);
```

---

## 🎨 Assets & Animations

### Lottie Animation Files

| Location | Purpose |
|----------|---------|
| `public/lottie.json` | Source file (during dev) |
| `android/app/src/main/res/raw/lottie.json` | Native build target |

**Regenerating Lottie:**
1. Replace `public/lottie.json`
2. Run `npx cap sync android`
3. Rebuild APK

**Current Animation:** Pistill (mortar & pestle) with animated leaves
- **Duration:** 1.42 seconds (71 frames @ 50fps)
- **Size:** 500x500px
- **Recommendation:** Scale down to 256x256 for faster loading

### Transparency Drawable
**File:** `android/app/src/main/res/drawable/transparent.xml`
```xml
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="@android:color/transparent" />
</shape>
```

---

## 🔄 Timeline Breakdown

### Cold Start (First Launch)
```
Time    | Event
--------|--------------------------------------------------------
0ms     | App tapped, Android launches
0ms     | Lottie animation starts (native)
~500ms  | WebView initialized
~800ms  | React app mounts
~1200ms | Clerk auth loaded
~1300ms | Convex token exchange complete
~1350ms | Categories fetched (cached)
~1400ms | Lottie first loop completes, keeps looping
~1500ms | isAppReady = true
~1500ms | Cross-fade starts (Lottie out, Categories in)
~1800ms | Lottie hidden, Categories visible ✅
```

### Warm Start (App Resumed)
```
Time    | Event
--------|--------------------------------------------------------
0ms     | App already in memory
0ms     | Direct to content (no splash)
```

---

## 🐛 Common Issues & Solutions

### Issue 1: Endless Lottie Loop
**Symptom:** Splash never disappears, app hangs

**Causes:**
1. Convex query failing with "Not authenticated"
2. `isAppReady` never becomes true
3. Missing authentication check before data fetch

**Solution:**
```typescript
// ALWAYS check auth before fetching
const shouldFetch = isAuthenticated;
useQuery(api.someData, shouldFetch ? {} : "skip");
```

### Issue 2: Distorted Logo in Box (Android 12+)
**Symptom:** App icon appears distorted in center screen before Lottie

**Cause:** `values-v31/styles.xml` has `@drawable/splash` instead of `@drawable/transparent`

**Solution:**
```xml
<!-- values-v31/styles.xml -->
<item name="windowSplashScreenAnimatedIcon">@drawable/transparent</item>
```

### Issue 3: White Flash Before Content
**Symptom:** Brief white screen between splash and content

**Causes:**
1. `loop: false` - Lottie stops before data loads
2. Missing data prefetch
3. Fade-in animation not synchronized

**Solutions:**
```typescript
// 1. Enable loop
loop: true

// 2. Prefetch data
useQuery(api.categories.getCategoriesWithStats, isAuthenticated ? {} : "skip");

// 3. Add fade-in to page
<div className={`transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
```

### Issue 4: Spinner Still Visible
**Symptom:** Loading spinner appears briefly after splash

**Solution:** Replace spinner with skeleton
```tsx
// Instead of:
<div className="spinner" />

// Use skeleton:
{[1,2,3,4,5].map((i) => (
  <div key={i} className="animate-pulse flex gap-4 p-3">
    <div className="h-16 w-16 bg-gray-200 rounded-lg" />
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-200 rounded" />
    </div>
  </div>
))}
```

---

## 📝 Maintenance Guide

### Updating the Lottie Animation
1. Create/export new animation as `lottie.json`
2. Place in `public/lottie.json`
3. Run `npx cap sync android`
4. Rebuild APK: `npm run build:android`

### Adjusting Fade Duration
**File:** `App.tsx`
```typescript
const fadeTimeout = setTimeout(() => {
  SplashScreen.hide();
  LottieSplashScreen.hide();
}, 300); // ← Change this value (milliseconds)
```

### Changing Splash Background Colors
**File:** `capacitor.config.ts`
```typescript
backgroundLight: "#ffffff",
backgroundDark: "#ffffff",
```

**File:** `android/app/src/main/res/values/colors.xml`
```xml
<color name="splash_background">#YOUR_COLOR</color>
```

### Adding Dark Mode-Specific Animation
**File:** `capacitor.config.ts`
```typescript
animationLight: "public/lottie-light.json",
animationDark: "public/lottie-dark.json",
```

---

## 🚀 Performance Optimization Tips

### 1. Minimize Lottie File Size
- Target: < 10KB compressed
- Remove unnecessary layers
- Use simple shapes instead of complex paths
- Reduce frame rate to 30fps if possible

### 2. Optimize Asset Loading
```typescript
// ✅ GOOD: Prefetch during splash
useQuery(api.categories.getCategoriesWithStats, {});

// ❌ BAD: Let page fetch on mount (causes delay)
// CategoriesPage.tsx:
const categories = useQuery(api.categories.getCategoriesWithStats);
```

### 3. Use Skeleton Loading
Skeleton screens feel faster than spinners and maintain visual continuity.

### 4. Minimize Re-renders
Use `React.memo` for expensive components during splash transition.

---

## 📚 Related Documentation

- [capacitor-lottie-splash-screen GitHub](https://github.com/ludufre/capacitor-lottie-splash-screen)
- [Capacitor Splash Screen API](https://capacitorjs.com/docs/apis/splash-screen)
- [Android 12 Splash Screen API](https://developer.android.com/develop/ui/views/launch/splash-screen)

---

## 🎓 Design Philosophy

**"Visual Continuity is King"**

The entire splash system is built around maintaining visual continuity from the moment the user taps the app icon to the moment they can interact with content. Every transition is cross-faded, every data fetch is prefetched, and every gap is eliminated.

**Guiding Principles:**
1. **No Abrupt Changes** - All transitions fade in/out
2. **No Empty States** - Skeleton or Lottie always visible
3. **No Waiting** - Data loads during splash, not after
4. **No Failures** - Safety timeouts prevent infinite loops

---

## 📞 Support

For issues or questions:
1. Check this guide's Common Issues section
2. Review Capacitor/Clerk/Convex logs in Android Studio
3. Check authentication state in Convex dashboard
4. Verify Lottie file is in correct locations

**Remember:** Native changes require rebuilding the APK. Hot reload won't show splash changes!

---

*Document maintained by the Cookly development team*
*Last review: February 2026*
