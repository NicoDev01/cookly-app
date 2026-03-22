# Google OAuth mit Clerk & Capacitor - Troubleshooting Guide

## Das Problem

Der OAuth-Login funktionierte im Browser, aber auf der nativen Android-App (Capacitor) nicht. Nach der Google-Anmeldung wurde der User zu `cookly.recipe/sso-callback` weitergeleitet, was zu "Seite nicht erreichbar" führte.

## Ursache

1. **Falsches Redirect-URL-Schema für native Apps** - Die App versuchte HTTPS-URLs zu öffnen, anstatt das Custom URL Schema
2. **Clerk erwartet App-spezifische Schemas** für native Plattformen
3. **Deep Link Handler** war nicht für das verwendete Schema konfiguriert

## Die Lösung

### 1. Code-Änderungen

#### WelcomePage.tsx & SignInPage.tsx

Für native Plattformen wird das Custom URL Schema verwendet:

```typescript
const handleGoogleSignIn = async () => {
  if (!signIn) return;

  let redirectUrl: string;
  let redirectUrlComplete: string;

  if (Capacitor.isNativePlatform()) {
    // Native Apps: IMMER das Custom URL Schema verwenden
    redirectUrl = 'com.cookly.recipe://sso-callback';
    redirectUrlComplete = 'com.cookly.recipe://sso-callback';
  } else {
    // Web: Use origin
    redirectUrl = window.location.origin + '/sso-callback';
    redirectUrlComplete = window.location.origin + '/tabs/categories';
  }

  await signIn.authenticateWithRedirect({
    strategy: 'oauth_google',
    redirectUrl,
    redirectUrlComplete,
  });
};
```

#### App.tsx - RootRedirect

Der RootRedirect erkennt jetzt auch `/sso-callback` URLs:

```typescript
const RootRedirect: React.FC = () => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    return <Navigate to="/tabs/categories" replace />;
  }

  // OAuth-Callback erkennen
  const currentUrl = window.location.href;
  const isOAuthCallback = 
    currentUrl.includes('__clerk_handshake') || 
    currentUrl.includes('__clerk_db_jwt') ||
    currentUrl.includes('/sso-callback');
  
  if (isOAuthCallback) {
    const url = new URL(currentUrl);
    const params = url.searchParams.toString();
    return <Navigate to={`/sso-callback?${params}`} replace />;
  }

  return <Navigate to="/welcome" replace />;
};
```

#### DeepLinkHandler.ts

Handler für alle OAuth-Callback-Schemas:

```typescript
App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
  const url = new URL(event.url);

  // Unterstützte Schemas:
  if (url.protocol === 'cooklyrecipe:') {
    window.location.href = '/sso-callback' + url.search;
    return;
  }

  if (url.protocol === 'com.cookly.recipe:') {
    window.location.href = '/sso-callback' + url.search;
    return;
  }

  if (url.host === 'sso-callback') {
    window.location.href = '/sso-callback' + url.search;
    return;
  }
});
```

### 2. Clerk Dashboard Konfiguration

Unter **Native applications** → **Allowlist for mobile SSO redirect**:

```
com.cookly.recipe://sso-callback
http://localhost:3000/sso-callback
cooklyrecipe://oauth-callback
```

### 3. AndroidManifest.xml

Intent-Filter für alle verwendeten Schemas:

```xml
<!-- Custom URL Scheme: cooklyrecipe://oauth-callback -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="cooklyrecipe" android:host="oauth-callback" />
</intent-filter>

<!-- Custom URL Scheme: com.cookly.recipe://sso-callback -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.cookly.recipe" android:host="sso-callback" />
</intent-filter>
```

## Wichtige Erkenntnisse

### Für native Apps: KEINE HTTPS-URLs verwenden

| Plattform | redirectUrl | redirectUrlComplete |
|-----------|-------------|-------------------|
| Web | `{origin}/sso-callback` | `{origin}/tabs/categories` |
| Native (Android/iOS) | `com.cookly.recipe://sso-callback` | `com.cookly.recipe://sso-callback` |

### Clerk OAuth Flow

```
1. User klickt "Mit Google anmelden"
2. Clerk öffnet Google OAuth im Browser
3. Nach erfolgreicher Auth → Clerk leitet zu redirectUrl weiter
4. Deep Link Handler fängt den Callback ab
5. Navigiert zu /sso-callback
6. handleRedirectCallback() verarbeitet den Token
7. Session wird erstellt → User ist eingeloggt
```

### Nicht verwenden

- ❌ `https://cookly.recipe/sso-callback` (funktioniert nicht für native Apps)
- ❌ `cooklyrecipe://oauth-callback` (war nicht in der Clerk Allowlist)

### Richtig verwenden

- ✅ `com.cookly.recipe://sso-callback` (in Clerk Allowlist + AndroidManifest)

## Build-Prozess

Nach Code-Änderungen:

```bash
npm run build
npx cap sync android
```

Dann die APK neu installieren.

## Troubleshooting

### "Seite nicht erreichbar" Fehler

→ Prüfen ob das richtige Custom URL Schema verwendet wird
→ Clerk Allowlist prüfen
→ Deep Link Handler Logs im Logcat

### Token wird nicht verarbeitet

→ RootRedirect erkennt OAuth-Callback nicht
→ Prüfen: `currentUrl.includes('/sso-callback')` in App.tsx

### App wird nicht geöffnet nach OAuth

→ AndroidManifest.xml Intent-Filter fehlt
→ Deep Link Handler nicht initialisiert
