# Auth & Multi-Tenancy Task List - FINAL ANALYSIS

**Ziel:** Jeder User bekommt einen isolierten Account mit eigenen Recipes, Categories, Favorites, Weekly Lists, Shopping Items
**Aktualisiert:** 2025-01-19
**Status:** 🔴 ROOT CAUSES IDENTIFIZIERT

---

## 🔴 ROOT CAUSE ANALYSE (basierend auf Clerk & Convex Docs)

### Problem 1: Redirect nach SignIn/SignUp funktioniert nicht
**Root Cause:** Die alten `afterSignInUrl` und `afterSignUpUrl` wurden in neueren Clerk Versionen durch `fallbackRedirectUrl` ersetzt. Deine App verwendet noch die alten Props/Env-Vars.

**Docs Source:** `/clerk/javascript` - "Replace `afterSignXUrl` with `signXFallbackRedirectUrl` in React"

**Aktuelle Config (falsch):**
```bash
# .env.local
VITE_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
VITE_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
```

**Lösung:** Die Redirects müssen im Code oder über Clerk Components konfiguriert werden, nicht nur als Env-Vars.

---

### Problem 2: Webhook wird nicht aufgerufen (User nicht in Convex erstellt)
**Root Cause:** Der Webhook Endpoint ist im Clerk Dashboard möglicherweise nicht konfiguriert oder zeigt auf die falsche URL.

**Benötigte Konfiguration im Clerk Dashboard:**
- Endpoint URL: `https://patient-swan-852.convex.cloud/clerk-webhook`
- Events: `user.created`, `user.updated`, `user.deleted`
- Secret: `whsec_...` (bereits in .env)

**Development Problem:** In Development läuft `npx convex dev` lokal auf `http://localhost:3000`. Clerk kann nicht zu localhost webhocken. Lösung:
- Option A: Ngrok/Tunnel für lokale Entwicklung
- Option B: Development Deployment auf Convex Cloud verwenden (du hast bereits `patient-swan-852`)

---

### Problem 3: Env Var Naming Inconsistent mit Convex Docs
**Root Cause:** Deine Env-Var heißt `CLERK_JWT_ISSUER`, aber Convex Docs empfehlen `CLERK_JWT_ISSUER_DOMAIN`.

**Aktuell:**
```bash
CLERK_JWT_ISSUER=https://joint-mollusk-58.clerk.accounts.dev
```

**Laut Docs (`/llmstxt/convex_dev_llms_txt`):**
```bash
CLERK_JWT_ISSUER_DOMAIN=https://your-app.clerk.accounts.dev
```

**FilesToUpdate:** `convex.config.ts`, `.env.local`, Convex Dashboard

---

### Problem 4: Race Condition - Webhook vs. First Render
**Root Cause:** Webhooks sind asynchron. Wenn sich ein User registriert:
1. Clerk erstellt User (sofort)
2. Frontend leitet zur App weiter (sofort)
3. **Aber:** Webhook kommt erst später an (0-30 Sekunden)
4. Convex Query `getCurrentUser` gibt `null` zurück
5. ProtectedLayout zeigt "Benutzerprofil wird eingerichtet..." für immer

**Docs Source:** `/clerk/clerk-docs` - "Do not rely on webhook delivery as part of synchronous user onboarding flows"

**Lösung:** Frontend muss User manuell syncen wenn Webhook fehlgeschlagen.

---

## 🔴 URGENT - Sofort zu beheben

### [URGENT-001] Fix Clerk Redirect Configuration
**Problem:** User wird nach SignIn/SignUp nicht zur App weitergeleitet
**Files:** `App.tsx`, `SignInPage.tsx`, `SignUpPage.tsx`

**Lösung:**
1. `ClerkProvider` mit Redirect-Props konfigurieren
2. Env-Vars entfernen (veraltet)
3. `forceRedirectUrl` verwenden statt `fallbackRedirectUrl` für_dev

```typescript
// App.tsx - Add ClerkProvider with redirect config
import { ClerkProvider } from '@clerk/clerk-react';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

<ClerkProvider
  publishableKey={clerkPubKey}
  routerPush={(to) => navigate(to)}
  signInFallbackRedirectUrl="/"
  signUpFallbackRedirectUrl="/tabs/categories"
>
  <AppContent />
</ClerkProvider>
```

- [ ] `ClerkProvider` in App.tsx hinzufügen
- [ ] Redirect URLs konfigurieren
- [ ] Env-Vars `VITE_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` etc. entfernen
- [ ] Testen: SignIn → Redirect zu App
- [ ] Testen: SignUp → Redirect zu App

---

### [URGENT-002] Fix Env Var Naming & Update convex.config.ts
**Problem:** `CLERK_JWT_ISSUER` sollte `CLERK_JWT_ISSUER_DOMAIN` heißen
**Files:** `convex.config.ts`, `.env.local`

**Lösung:**
```typescript
// convex.config.ts - UPDATE
export default defineApp({
  auth: {
    providers: [
      {
        domain: process.env.CLERK_JWT_ISSUER_DOMAIN || "https://joint-mollusk-58.clerk.accounts.dev",
      }
    ]
  }
});
```

```bash
# .env.local - UPDATE
CLERK_JWT_ISSUER_DOMAIN=https://joint-mollusk-58.clerk.accounts.dev
```

- [ ] `.env.local` aktualisieren: `CLERK_JWT_ISSUER` → `CLERK_JWT_ISSUER_DOMAIN`
- [ ] `convex.config.ts` aktualisieren um `CLERK_JWT_ISSUER_DOMAIN` zu lesen
- [ ] Env-Var im Convex Dashboard setzen
- [ ] `npx convex deploy` ausführen

---

### [URGENT-003] Verify & Configure Clerk Webhook
**Problem:** User wird in Clerk erstellt aber nicht in Convex
**Location:** Clerk Dashboard → Webhooks

**Zu konfigurieren:**
- **Endpoint URL:** `https://patient-swan-852.convex.cloud/clerk-webhook`
- **Secret:** `whsec_...` (bereits vorhanden)
- **Events:**
  - `user.created` ✓
  - `user.updated` ✓
  - `user.deleted` ✓

**Development Setup:**
Du verwendest bereits das Cloud Deployment (`patient-swan-852`), das ist korrekt!

- [ ] Clerk Dashboard → Webhooks öffnen
- [ ] Prüfen ob Endpoint `.../clerk-webhook` existiert
- [ ] Falls nicht: Endpoint mit URL oben erstellen
- [ ] Events subscribe: `user.created`, `user.updated`, `user.deleted`
- [ ] Testen: User erstellen → Console Log im Convex Dashboard prüfen

---

## 🟠 HIGH - Race Condition Fix

### [HIGH-001] Add Manual User Sync Fallback
**Problem:** Wenn Webhook fehlgeschlagen, User nie in Convex erstellt → Endloser Ladescreen
**Files:** `convex/users.ts`, `App.tsx`

**Lösung:** Mutation erstellen die User aus Clerk Token in Convex erstellt:

```typescript
// convex/users.ts - Add public mutation
export const syncUserIfNotExists = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check if user already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existing) {
      return existing._id;
    }

    // Create user from token
    const email = identity.email?.[0]?.emailAddress;
    const name = identity.name || email?.split("@")[0] || "User";
    const avatar = identity.pictureUrl;

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      name,
      avatar,
      subscription: "free",
      subscriptionStatus: "active",
      onboardingCompleted: false,
      notificationsEnabled: false,
      usageStats: {
        manualRecipes: 0,
        linkImports: 0,
        photoScans: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
```

```typescript
// App.tsx - ProtectedLayout
import { useMutation } from "convex/react";

// Inside ProtectedLayout component:
const syncUser = useMutation(api.users.syncUserIfNotExists);

useEffect(() => {
  const checkAndSyncUser = async () => {
    if (!isLoading && isAuthenticated && currentUser === undefined) {
      // Wait a bit for webhook
      await new Promise(resolve => setTimeout(resolve, 2000));

      // If still no user, sync manually
      const { getCurrentUser } = await import("./convex/_generated/api");
      const user = await useQuery(getCurrentUser)();
      if (!user) {
        console.log("Webhook may have failed, syncing user manually...");
        await syncUser();
      }
    }
  };
  checkAndSyncUser();
}, [isLoading, isAuthenticated, currentUser]);
```

- [ ] `syncUserIfNotExists` Mutation in `users.ts` erstellen
- [ ] `ProtectedLayout` in `App.tsx` um Sync-Logic erweitern
- [ ] Testen: SignUp → Ohne Webhook → Sync funktioniert

---

### [HIGH-002] Add Better Error Logging
**Problem:** Webhook-Fehler sind schwer zu debuggen
**File:** `convex/http.ts`

- [ ] Console Logs für alle Webhook-Events hinzufügen
- [ ] Event-Typ und User-ID loggen
- [ ] Fehler bei `createOrUpdateUser` detailliert loggen
- [ ] Convex Dashboard → Logs prüfen nach User-Erstellung

---

## 🟡 MEDIUM - Verification & Testing

### [MEDIUM-001] Verify Clerk JWT Template
**Problem:** JWT Template fehlt oder ist falsch konfiguriert
**Location:** Clerk Dashboard → JWT Templates

- [ ] Prüfen ob "convex" JWT Template existiert
- [ ] Issuer: `https://joint-mollusk-58.clerk.accounts.dev`
- [ **] Audience: `convex`
- [ ] Falls nicht existiert: Template erstellen laut Convex Docs

---

### [MEDIUM-002] Test Complete Auth Flow
**Test-Szenarien:**

1. **SignUp Flow:**
   - [ ] User registriert sich mit Email + Password
   - [ ] Email Code eingeben
   - [ ] Nach Verification → Redirect zu `/tabs/categories`
   - [ ] User in Convex Database vorhanden (Dashboard)
   - [ ] User kann Recipe erstellen

2. **SignIn Flow:**
   - [ ] User login mit Email + Password
   - [ ] Nach Login → Redirect zu `/tabs/categories`
   - [ ] User-Daten werden korrekt geladen

3. **Multi-Tenancy Test:**
   - [ ] User A erstellt Recipe
   - [ ] User B login
   - [ ] User B sieht User A's Recipe NICHT

4. **Logout/Login:**
   - [ ] User logout
   - [ ] User login erneut
   - [ ] Daten sind noch vorhanden

---

### [MEDIUM-003] Categories Decision
**Frage:** Sollen Categories pro User oder system-weit sein?

**Aktuelles Design:**
- `categories` Tabelle: System-weit (keine clerkId)
- `categoryStats` Tabelle: Pro User (hat clerkId)

**Option A:** System Categories + User Stats (aktuell)
- Alle User sehen gleiche Kategorien
- Nur die Anzahl Rezepte pro Kategorie ist user-spezifisch
- Vorteile: Weniger Duplikate, konsistente Kategorien
- Nachteile: User kann keine eigenen Kategorien erstellen

**Option B:** User-isolierte Categories
- Jeder User hat eigene Kategorien
- Vorteile: Volle Flexibilität
- Nachteile: Duplikate, jeder User muss Kategorien neu erstellen

- [ ] Entscheidung treffen
- [ ] Falls Option B: Schema ändern → `clerkId` zu `categories` hinzufügen
- [ ] Categories queries anpassen

---

## 🟢 LOW - Nice to Have

### [LOW-001] Add Auth Debug Page
- [ ] Page unter `/debug/auth` erstellen
- [ ] Zeigt: Clerk User, Convex User, JWT Token, Env Vars
- [ ] Nur im Development Mode verfügbar

### [LOW-002] Add Integration Tests
- [ ] Test: SignUp → Clerk → Webhook → Convex
- [ ] Test: Login → JWT Validation → Convex Query
- [ ] Test: Multi-Tenancy Isolation

---

## 🔍 DIAGNOSTIC COMMANDS

```bash
# 1. Alle Clerk Domains im Projekt finden
grep -r "clerk.accounts.dev" .

# 2. Env Vars prüfen (in development)
cat .env.local | grep CLERK

# 3. Convex Functions redeployen
npx convex deploy

# 4. Convex Dev Server mit Logs
npx convex dev

# 5. Convex Dashboard (Database inspect)
npx convex dashboard

# 6. Webhook Logs im Convex Dashboard
# Dashboard → Functions → http → clerk-webhook → Logs
```

---

## ⚠️ CHECKLISTE VOR DEM START

### Env Vars (lokal + Convex Dashboard)
- [ ] `CLERK_JWT_ISSUER_DOMAIN` = `https://joint-mollusk-58.clerk.accounts.dev`
- [ ] `CLERK_WEBHOOK_SECRET` = `whsec_...`
- [ ] `VITE_CLERK_PUBLISHABLE_KEY` = `pk_test_...`

### Clerk Dashboard
- [ ] Webhook Endpoint: `https://patient-swan-852.convex.cloud/clerk-webhook`
- [ ] Events subscribed: `user.created`, `user.updated`, `user.deleted`
- [ ] JWT Template "convex" existiert (oder per Configure button erstellen)

### Convex Dashboard
- [ ] Env Vars gesetzt: `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SECRET`
- [ ] Auth Config zeigt korrekte Domain

---

## AUSFÜHRUNGSPLAN

1. **[URGENT-001]** - Redirects fixen (App.tsx ClerkProvider)
2. **[URGENT-002]** - Env Var Naming fixen
3. **[URGENT-003]** - Webhook im Clerk Dashboard konfigurieren/verifizieren
4. **[HIGH-001]** - Manual User Sync hinzufügen (Race Condition Fix)
5. **[MEDIUM-001]** - JWT Template verifizieren
6. **[MEDIUM-002]** - Kompletten Auth Flow testen
7. **[MEDIUM-003]** - Categories Design finalisieren

---

## NOTIZEN

- Wir nutzen das Cloud Deployment `patient-swan-852` für Development - das ist gut!
- Ngrok ist NICHT nötig da wir Cloud Deployment verwenden
- Die Domain `joint-mollusk-58.clerk.accounts.dev` ist konsistent über alle Files
- Clerk React SDK verwendet neue Redirect Props: `fallbackRedirectUrl`, `forceRedirectUrl`
