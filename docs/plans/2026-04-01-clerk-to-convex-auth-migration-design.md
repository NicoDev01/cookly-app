# Design: Migration von Clerk zu Convex Auth

**Datum:** 2026-04-01
**Status:** Genehmigt
**Kontext:** Das aktuelle Clerk Auth System hat bekannte Probleme mit Google OAuth auf Android (Capacitor). Convex Auth bietet eine schlankerere, integrierte Alternative ohne externe Auth-Abhangigkeiten.

---

## Motivation

- Google OAuth in der Capacitor Android App funktioniert mit Clerk nicht zuverlassig
- Das aktuelle System ist komplex: Webhooks, Bouncer-Pages, sessionStorage-Hacks, Deep-Link-Handler
- Convex Auth bietet Google OAuth + Email/Passwort direkt integriert
- 0-10 Nutzer, kein Stripe-Produktivbetrieb → idealer Zeitpunkt fur Migration
- Bestehende Nutzer melden sich nach Migration einfach neu an (keine explizite Migration)

---

## Entscheidung

**Convex Auth** (Beta) als vollstandiger Ersatz fur Clerk.

---

## Was rausfliegt

| Was | Warum |
|-----|-------|
| `@clerk/clerk-react` Package | Nicht mehr benotigt |
| `convex-react-clerk` | Nicht mehr benotigt |
| `convex/auth.config.js` | Ersetzt durch `convex/auth.ts` |
| Clerk Webhook in `convex/http.ts` | Clerk→Convex Sync entfallt komplett |
| `pages/SSOCallbackPage.tsx` | Komplex, Clerk-spezifisch |
| `pages/SSOBouncerPage.tsx` | Nur fur Clerk-OAuth benotigt |
| Clerk-Logik in `services/deepLinkHandler.ts` | Vereinfacht sich erheblich |
| `clerkId` Feld + `byClerkId` Index in Schema | Durch Convex Auth eigene Tabellen ersetzt |
| `syncUserIfNotExists` Webhook-Fallback | Nicht mehr benotigt |
| Clerk ENV-Variablen | Nicht mehr benotigt |

---

## Was neu kommt

| Was | Zweck |
|-----|-------|
| `convex/auth.ts` | Zentrale Convex Auth Config (Password + Google) |
| `authTables` in `convex/schema.ts` | Convex Auth interne Tabellen (sessions, accounts, etc.) |
| `ConvexAuthProvider` in `index.tsx` | Ersetzt `ClerkProvider + ConvexProviderWithClerk` |
| `useAuthActions()` Hook | Ersetzt `useSignIn`, `useSignUp`, `useClerk` |
| `getAuthUserId(ctx)` in Backend-Funktionen | Ersetzt Clerk JWT + `clerkId` Lookup |
| Google OAuth Credentials in Convex ENV | `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` |
| Auth-spezifische ENV Vars | `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS` |

---

## Architektur nach Migration

```
index.tsx
  └─ ConvexAuthProvider (statt ClerkProvider + ConvexProviderWithClerk)
       └─ App

convex/auth.ts
  └─ convexAuth({ providers: [Password, Google] })

convex/schema.ts
  └─ ...authTables  ← neu
  └─ users: { userId (kein clerkId mehr), email, name, ... }

User-Auth-Flow:
  1. signIn("password", { email, password, flow: "signin" })  ← neu
  2. signIn("google")  ← OAuth, Browser.open() bleibt fur Android
  3. getAuthUserId(ctx)  ← statt clerkId Lookup in allen Mutations/Queries
```

---

## Datenbankschema-Anderungen

### `users` Tabelle

**Vorher:**
```typescript
clerkId: v.string(),
// + byClerkId Index
```

**Nachher:**
```typescript
// clerkId entfernt
// userId wird uber getAuthUserId(ctx) in Mutations geholt - kein eigenes Feld notwendig
// Convex Auth verwaltet die Verbindung intern via authAccounts Tabelle
```

Die `users` Tabelle verliert `clerkId` und den `byClerkId` Index. Alle Mutations/Queries die aktuell `clerkId` verwenden, nutzen stattdessen `getAuthUserId(ctx)` und suchen per Convex Document ID.

### Neue Tabellen (automatisch von `authTables`)
- `authAccounts` - Verknupft Nutzer mit OAuth-Providern
- `authSessions` - Session-Management
- `authRefreshTokens` - Token-Rotation
- `authVerificationCodes` - OTP/Email-Verifizierung
- `authVerifiers` - PKCE fur OAuth
- `authRateLimits` - Brute-Force-Schutz

---

## Google OAuth auf Android (Kern-Problem)

Das fundamentale Problem (externer Browser fur Google OAuth auf Android) **bleibt bestehen** - das ist eine Google-Anforderung. Aber die Implementierung wird deutlich schlanker:

**Vorher:** signIn.create() → deepLinkHandler → sessionStorage → SSOBouncerPage → SSOCallbackPage → handleRedirectCallback()

**Nachher:** signIn("google") → Browser.open() → Convex Auth PKCE-Callback → Session automatisch gesetzt

Redirect URI: `{CONVEX_SITE_URL}/api/auth/callback/google`

---

## Stripe-Integration

Stripe verwendet aktuell `clerkId` zur Nutzeridentifikation. Nach der Migration:
- Stripe Webhook identifiziert Nutzer weiterhin per `email` oder Convex Document `_id`
- `stripeCustomerId` Feld in `users` Tabelle bleibt unverandert
- Stripe-seitig keine Anderungen notwendig

---

## Kritische Dateien

| Datei | Aktion |
|-------|--------|
| `convex/auth.config.js` | LOSCHEN |
| `convex/auth.ts` | NEU ERSTELLEN |
| `convex/schema.ts` | authTables hinzufugen, clerkId entfernen |
| `convex/users.ts` | Alle clerkId Referenzen → getAuthUserId() |
| `convex/http.ts` | Clerk Webhook Handler entfernen |
| `index.tsx` | ClerkProvider → ConvexAuthProvider |
| `pages/SignInPage.tsx` | Clerk Hooks → useAuthActions() |
| `pages/SignUpPage.tsx` | Clerk Hooks → useAuthActions() |
| `pages/WelcomePage.tsx` | Google OAuth Logik anpassen |
| `pages/SSOCallbackPage.tsx` | LOSCHEN oder stark vereinfachen |
| `pages/SSOBouncerPage.tsx` | LOSCHEN |
| `services/deepLinkHandler.ts` | Clerk-spezifische Logik entfernen |
| `App.tsx` | Auth-State Checks auf Convex Auth umstellen |
| `convexClient.ts` | Vereinfachen (kein Clerk Token-Provider) |
| `package.json` | @clerk/* entfernen, @convex-dev/auth + @auth/core hinzufugen |

---

## Verifikation (Testing)

1. **Email/Passwort Sign-Up:** Neuen Account erstellen, Email-Verifizierung prufen
2. **Email/Passwort Sign-In:** Login mit existierendem Account
3. **Google OAuth (Web):** Im Browser testen
4. **Google OAuth (Android):** Im Emulator oder echtem Gerat testen
5. **Session Persistenz:** App schlie�en und wieder offnen - eingeloggt bleiben
6. **Logout:** Session korrekt beendet
7. **Rezepte:** Nach Login Rezepte laden, erstellen, loschen
8. **Auth Guard:** Unauthentifizierte Routen korrekt geblockt
