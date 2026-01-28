# Cookly Free/Pro System - Aktueller Stand

**Datum:** 2025-01-17
**Version:** 2.0 - Separate Counter & Lifetime Limits (Optimiert)

---

## 1. ÜBERSICHT

Das Subscription-System von Cookly basiert auf einer **freemium** SaaS-Struktur mit zwei Pro-Tarifen und einem Free-Tier mit **lifetime Limits** (kein monatliches Reset). Die Limit-Prüfung erfolgt primär im Backend (Convex), das Frontend zeigt proaktiv Warnungen an.

### Subscription-Typen

| Typ | Wert | Status | Preis | Bedeutung |
|-----|------|--------|-------|-----------|
| Free | `free` | `active`, `canceled`, `past_due` | €0 | Kostenlose Basis-Version mit lifetime Limits |
| Pro Monatlich | `pro_monthly` | `active` | €2,50/Monat | Unbegrenzter Zugang, monatlich kündbar |
| Pro Jährlich | `pro_yearly` | `active` | €25/Jahr (33% Rabatt) | Unbegrenzter Zugang, jährlich kündbar |

**WICHTIG:** Kein Lifetime-Tarif mehr! Alle Pro-Tarifen sind subscription-basiert.

---

## 2. DATENBANK SCHEMA

**Datei:** `convex/schema.ts:6-54`

```typescript
users: defineTable({
  // Clerk Authentication
  clerkId: v.string(),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  avatar: v.optional(v.string()),

  // Subscription Details (kein lifetime mehr)
  subscription: v.union(
    v.literal("free"),
    v.literal("pro_monthly"),
    v.literal("pro_yearly")
  ),
  subscriptionStatus: v.union(
    v.literal("active"),
    v.literal("canceled"),
    v.literal("past_due")
  ),
  subscriptionEnd: v.optional(v.number()), // DEPRECATED: nutze usageStats.subscriptionEndDate
  stripeCustomerId: v.optional(v.string()),
  stripeSubscriptionId: v.optional(v.string()),

  // Usage Stats - Separate Counter für jeden Feature-Typ
  usageStats: v.object({
    // Separate Counter (Lifetime, kein Reset für Free Tier)
    manualRecipes: v.number(),      // Manuell erstellte Rezepte (Limit: 100)
    linkImports: v.number(),        // URL/Instagram Imports (Limit: 50)
    photoScans: v.number(),         // KI Foto-Scans (Limit: 50)

    // Subscription Zeiträume (für Pro Tier)
    subscriptionStartDate: v.optional(v.number()),  // Start der Subscription
    subscriptionEndDate: v.optional(v.number()),    // Ende der Subscription

    // Wird benötigt um zu wissen ob Counter bei Downgrade resetted werden müssen
    resetOnDowngrade: v.boolean(),
  }),

  // Onboarding & Preferences
  onboardingCompleted: v.boolean(),
  cookingFrequency: v.optional(v.string()),
  preferredCuisines: v.optional(v.array(v.string())),
  notificationsEnabled: v.boolean(),

  // Metadata
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

### Indizes
- `by_clerkId` - Eindeutig, primärer Lookup
- `by_stripeCustomer` - Für Stripe Webhooks

### Counter-Struktur

Jedes Feature hat seinen **eigenen Counter**:
- `manualRecipes` - Wird nur bei manueller Rezept-Erstellung erhöht
- `linkImports` - Wird nur bei URL/Instagram Imports erhöht
- `photoScans` - Wird nur bei KI-Foto-Scans erhöht

**Vorteil:** Ein User kann 100 manuelle Rezepte UND 50 Link-Imports UND 50 Foto-Scans haben (insgesamt 200 Aktionen).

---

## 3. USER LIFECYCLE

### 3.1 User Erstellung (Clerk Webhook → Convex)

**Datei:** `convex/http.ts`, `convex/users.ts:ensureUserExists`

```
1. User registriert sich bei Clerk
   ↓
2. Clerk sendet "user.created" Webhook an Convex
   ↓
3. ensureUserExists() wird aufgerufen
   ↓
4. Neuer User wird in Convex erstellt mit:
   - subscription: "free"
   - subscriptionStatus: "active"
   - usageStats.manualRecipes: 0
   - usageStats.linkImports: 0
   - usageStats.photoScans: 0
   - usageStats.resetOnDowngrade: false
```

### 3.2 Pro Upgrade (Stripe Checkout)

**Datei:** `pages/SubscribePage.tsx`, `convex/stripe.ts:createCheckoutSession`

```
1. User wählt Tarif auf SubscribePage (€2,50/Monat oder €25/Jahr)
   ↓
2. createCheckoutSession() wird aufgerufen
   ↓
3. Stripe Checkout öffnet sich
   ↓
4. User bezahlt
   ↓
5. Stripe sendet "checkout.session.completed" Webhook
   ↓
6. handleWebhookEvent() setzt:
   - subscription: "pro_monthly" oder "pro_yearly"
   - subscriptionStatus: "active"
   - subscriptionStartDate: Date.now()
   - subscriptionEndDate: Date.now() + (30 Tage oder 365 Tage)
   - stripeCustomerId, stripeSubscriptionId
```

**WICHTIG:** Bei Upgrade werden die Counter **nicht zurückgesetzt**! Der User behält alle erstellten Rezepte.

### 3.3 Proaktiv Kündigen (User-Initiiert)

**Datei:** `pages/ProfilePage.tsx`, `convex/stripe.ts:cancelSubscription`

```
1. User klickt "Abo kündigen" auf ProfilePage
   ↓
2. cancelSubscription() wird aufgerufen
   ↓
3. Stripe Subscription wird auf cancel_at_period_end gesetzt
   ↓
4. resetOnDowngrade wird auf true gesetzt
   ↓
5. User bleibt Pro bis zum Ende der bezahlten Periode
   ↓
6. Am Periodenende sendet Stripe "customer.subscription.deleted" Webhook
   ↓
7. Counter werden auf 0 zurückgesetzt (aber Rezepte bleiben!)
```

### 3.4 Downgrade (Stripe Webhook)

**Datei:** `convex/stripe.ts:handleWebhookEvent`

```
1. Periodenende erreicht (nach Kündigung)
   ↓
2. Stripe sendet "customer.subscription.deleted" Webhook
   ↓
3. updateSubscriptionByStripeCustomer() setzt:
   - subscription: "free"
   - subscriptionStatus: "canceled"
   - subscriptionEndDate: undefined
   - stripeSubscriptionId: undefined
   ↓
4. Falls resetOnDowngrade === true:
   - Counter werden auf 0 zurückgesetzt
   - Alle Rezepte bleiben erhalten (nur Counter reset!)
```

---

## 4. LIMIT-CHECK LOGIC

### 4.1 Separate Limit Queries (Proaktiv)

**Datei:** `convex/users.ts:canCreateManualRecipe`, `canImportFromLink`, `canScanPhoto`

```typescript
// Manuelle Rezepte
export const canCreateManualRecipe = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user.subscription !== "free") {
      return { canProceed: true, isPro: true };
    }

    const current = user.usageStats?.manualRecipes || 0;
    const limit = FREE_LIMITS.MANUAL_RECIPES; // 100

    return {
      canProceed: current < limit,
      current,
      limit,
      remaining: limit - current,
      feature: "manual_recipes"
    };
  },
});

// Link Imports (Instagram/Website)
export const canImportFromLink = query({
  // ... ähnlich zu canCreateManualRecipe
  const limit = FREE_LIMITS.LINK_IMPORTS; // 50
  feature: "link_imports"
});

// KI Foto-Scans
export const canScanPhoto = query({
  // ... ähnlich zu canCreateManualRecipe
  const limit = FREE_LIMITS.PHOTO_SCANS; // 50
  feature: "photo_scans"
});
```

**Vorteil:** Das Frontend kann **proaktiv** prüfen und schon vor dem Klick warnen!

### 4.2 Feature Type Detection (Backend)

**Datei:** `convex/recipes.ts:create`

```typescript
export const create = mutation({
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    // 1. Feature-Typ automatisch erkennen
    let featureType: "manual_recipes" | "link_imports" | "photo_scans";
    if (args.sourceUrl) {
      featureType = "link_imports";  // URL vorhanden = Import
    } else if (args.sourceImageUrl) {
      featureType = "photo_scans";   // KI gescanntes Foto
    } else {
      featureType = "manual_recipes"; // Manuell erstellt
    }

    // 2. Limit prüfen (nur für Free User)
    if (user.subscription === "free") {
      const currentCount = user.usageStats?.[featureType] || 0;
      const limit = LIMITS[featureType];

      if (currentCount >= limit) {
        throw new Error(JSON.stringify({
          type: "LIMIT_REACHED",
          feature: featureType,
          current: currentCount,
          limit: limit
        }));
      }
    }

    // 3. Rezept ZUERST erstellen, dann Counter erhöhen
    // (Verhindert Race Condition!)
    try {
      const recipeId = await ctx.db.insert("recipes", { ... });

      // Counter NUR bei Erfolg erhöhen
      if (user.subscription === "free") {
        await ctx.runMutation(internal.users.incrementUsageCounter, {
          clerkId: user.clerkId,
          feature: featureType
        });
      }

      return recipeId;
    } catch (error) {
      // Counter wurde NICHT erhöht bei Fehler
      throw error;
    }
  },
});
```

### 4.3 Limit-Werte (Aktuelle Implementierung)

| Feature | Free Limit | Pro Limit | Counter | Bemerkung |
|---------|-----------|-----------|---------|-----------|
| Manuelle Rezepte | 100 (lifetime) | Unlimited | `manualRecipes` | Ohne URL/ Foto |
| Link-Imports | 50 (lifetime) | Unlimited | `linkImports` | Mit sourceUrl |
| KI-Foto-Scans | 50 (lifetime) | Unlimited | `photoScans` | Mit sourceImageUrl |
| Weekly Plan | **KEIN LIMIT** | Unlimited | - | Kostenlos für alle |
| Shopping List | **KEIN LIMIT** | Unlimited | - | Kostenlos für alle |
| Favoriten | **KEIN LIMIT** | Unlimited | - | Kostenlos für alle |

**Design-Entscheidung:** Weekly Plan, Shopping List und Favoriten sind kostenlos für alle User, um die App attraktiv zu machen.

### 4.4 Race Condition Fix

**Alt (Buggy):**
```typescript
// Counter wird VOR dem Insert erhöht
await ctx.db.patch(user._id, {
  usageStats: { ...user.usageStats, importedRecipes: currentCount + 1 }
});

// Wenn das Insert fehlschlägt, wurde der Counter trotzdem erhöht!
const recipeId = await ctx.db.insert("recipes", { ... });
```

**Neu (Fix):**
```typescript
// Rezept ZUERST erstellen
const recipeId = await ctx.db.insert("recipes", { ... });

// Counter NUR bei Erfolg erhöhen
await ctx.runMutation(internal.users.incrementUsageCounter, {
  clerkId, feature: featureType
});
```

---

## 5. RATE LIMITING (API Abuse Prevention)

**Datei:** `convex/rateLimiter.ts`

### 5.1 Rate Limit Logik

```typescript
// 10 Requests pro Minute pro User
const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 10,
  WINDOW_MS: 60 * 1000, // 1 Minute
};

export const checkRateLimit = (clerkId: string): boolean => {
  const now = Date.now();
  const userLimit = userRateLimits.get(clerkId);

  if (!userLimit || now - userLimit.windowStart > RATE_LIMIT.WINDOW_MS) {
    // Neues Fenster oder erste Anfrage
    userRateLimits.set(clerkId, { count: 1, windowStart: now });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
    return false; // Limit erreicht!
  }

  userLimit.count++;
  return true;
};
```

### 5.2 Einsatz in Actions

**Instagram Scraper (`convex/instagram.ts`):**
```typescript
export const scrapePost = action({
  handler: async (ctx, args) => {
    // Rate Limit Check
    if (!checkRateLimit(clerkId)) {
      throw new Error(JSON.stringify({
        type: "RATE_LIMIT_EXCEEDED",
        resetAt: status.resetAt,
        message: "Du hast zu viele Anfragen gestellt. Bitte warte einen Moment."
      }));
    }
    // ... Apify Call
  },
});
```

**Website Scraper (`convex/website.ts`):**
```typescript
export const scrapeWebsite = action({
  handler: async (ctx, args) => {
    // Rate Limit Check
    if (!checkRateLimit(clerkId)) {
      throw new Error(JSON.stringify({ type: "RATE_LIMIT_EXCEEDED", ... }));
    }
    // ... Jina AI Call
  },
});
```

---

## 6. GRACEFUL DEGRADATION

### 6.1 Instagram Scraper

**Datei:** `convex/instagram.ts:86-167`

```typescript
try {
  // Apify Call...
  const runResponse = await fetch(...);
  // ...
} catch (apifyError) {
  console.error("Apify error:", apifyError);

  // Graceful Degradation: Fallback auf manuelle Eingabe
  throw new Error(JSON.stringify({
    type: "API_UNAVAILABLE",
    service: "apify",
    fallbackMode: "manual",
    prefillUrl: args.url,
    message: "Der Instagram-Service ist gerade nicht verfügbar. Bitte gib das Rezept manuell ein."
  }));
}
```

### 6.2 Gemini OCR

```typescript
try {
  // Gemini Parsing...
  const result = await ai.models.generateContent(...);
  recipeData = JSON.parse(result.text);
} catch (geminiError) {
  console.error("Gemini error:", geminiError);

  // Graceful Degradation: Fallback auf Basis-Rezept
  recipeData = {
    title: "Instagram Rezept",
    category: "Sonstiges",
    ingredients: [],
    instructions: [],
  };
}
```

### 6.3 Website Scraper

**Datei:** `convex/website.ts`

```typescript
// Jina AI Graceful Degradation
try {
  const jinaResponse = await fetch(jinaUrl, ...);
  // ...
} catch (jinaError) {
  throw new Error(JSON.stringify({
    type: "API_UNAVAILABLE",
    service: "jina",
    fallbackMode: "manual",
    prefillUrl: args.url,
    message: "Der Website-Import-Service ist gerade nicht verfügbar."
  }));
}

// Gemini Graceful Degradation
try {
  const result = await ai.models.generateContent(...);
  recipeData = JSON.parse(result.text);
} catch (geminiError) {
  // Fallback auf Basis-Rezept
  recipeData = { title: pageTitle, ingredients: [], instructions: [] };
}
```

---

## 7. FRONTEND INTEGRATION

### 7.1 Proaktive Limit Checks

**Datei:** `components/AddRecipeModal.tsx:handleSave`

```typescript
const canCreateManual = useQuery(api.users.canCreateManualRecipe);
const canImportLink = useQuery(api.users.canImportFromLink);
const canScanPhoto = useQuery(api.users.canScanPhoto);

const handleSave = async () => {
  // PROAKTIVER LIMIT CHECK
  if (!initialData) {
    let limitCheck;
    if (formData.sourceUrl) {
      limitCheck = canImportLink;  // Link Import
    } else if (recipeImagePreviewUrl?.startsWith('blob:')) {
      limitCheck = canScanPhoto;   // KI Foto-Scan
    } else {
      limitCheck = canCreateManual; // Manuelles Rezept
    }

    if (limitCheck && !limitCheck.canProceed) {
      // Zeige Upgrade Modal VOR dem Speichern
      setShowUpgradeModal({
        isOpen: true,
        feature: limitCheck.feature,
        current: limitCheck.current,
        limit: limitCheck.limit,
      });
      return;
    }
  }

  // ... Rezept speichern
};
```

### 7.2 Usage Stats Anzeige

**Datei:** `pages/ProfilePage.tsx`

```typescript
// Separate Counter für jedes Feature
const manualLimit = useQuery(api.users.canCreateManualRecipe);
const linkLimit = useQuery(api.users.canImportFromLink);
const scanLimit = useQuery(api.users.canScanPhoto);

{!isPro && (
  <>
    <UsageBarItem
      icon="restaurant"
      label="Manuelle Rezepte"
      current={manualLimit?.current ?? 0}
      limit={manualLimit?.limit ?? 100}
    />
    <UsageBarItem
      icon="link"
      label="Link-Imports"
      current={linkLimit?.current ?? 0}
      limit={linkLimit?.limit ?? 50}
    />
    <UsageBarItem
      icon="camera_enhance"
      label="KI-Foto-Scans"
      current={scanLimit?.current ?? 0}
      limit={scanLimit?.limit ?? 50}
    />
  </>
)}
```

### 7.3 Upgrade Modal

**Datei:** `components/UpgradeModal.tsx`

```typescript
const config = {
  manual_recipes: {
    title: 'Rezept Limit erreicht',
    icon: 'restaurant',
    description: `Du hast dein kostenloses Limit von ${limit} manuellen Rezepten erreicht.`,
    highlight: 'Sammle unbegrenzt Rezepte für deine digitale Küche.'
  },
  link_imports: {
    title: 'Import Limit erreicht',
    icon: 'link',
    description: `Du hast dein kostenloses Limit von ${limit} Link-Imports erreicht.`,
    highlight: 'Spare Zeit mit unbegrenzten Website-Imports.'
  },
  photo_scans: {
    title: 'Scan Limit erreicht',
    icon: 'camera_enhance',
    description: `Du hast dein kostenloses Limit von ${limit} KI-Scans erreicht.`,
    highlight: 'Digitalisiere deine Kochbuch-Sammlung unbegrenzt.'
  }
}[feature];
```

### 7.4 Subscribe Page

**Datei:** `pages/SubscribePage.tsx`

```typescript
const PRICE_IDS = {
  pro_monthly: 'price_1SoSOO7b0AK0vlZMKDgH4KXA',  // €2.50/Monat
  pro_yearly: 'price_1SoVfN7b0AK0vlZMfraHFosg',   // €25.00/Jahr
};

const freeFeatures = [
  '100 Manuelle Rezepte',
  '50 Link-Imports (Instagram/Website)',
  '50 KI-Foto-Scans',
  'Unbegrenzte Wochenplanung',
  'Unbegrenzte Einkaufslisten',
  'Unbegrenzte Favoriten',
];
```

### 7.5 Cancel Subscription Button

**Datei:** `pages/ProfilePage.tsx`

```typescript
{isPro && !isMarkedForCancel && (
  <button onClick={() => setShowCancelModal(true)}>
    Abo kündigen
  </button>)}

{/* Cancel Modal */}
<CancelModal
  isOpen={showCancelModal}
  onClose={() => setShowCancelModal(false)}
  onConfirm={async () => {
    await cancelSubscription();
    setShowCancelModal(false);
  }}
  subscriptionEndDate={subscriptionEndDate}
/>
```

---

## 8. STRUKTURIERTE FEHLERBEHANDLUNG

### 8.1 Error Format

Alle Errors verwenden JSON-Format:

```typescript
{
  type: "LIMIT_REACHED" | "RATE_LIMIT_EXCEEDED" | "API_UNAVAILABLE" | "NOT_AUTHENTICATED",
  feature?: "manual_recipes" | "link_imports" | "photo_scans",
  current?: number,
  limit?: number,
  resetAt?: number,
  message?: string
}
```

### 8.2 Frontend Error Parsing

**Datei:** `pages/ShareTargetPage.tsx`

```typescript
} catch (err: any) {
  try {
    const errorData = JSON.parse(err.message);

    if (errorData.type === "LIMIT_REACHED") {
      setLimitData({
        feature: errorData.feature,
        current: errorData.current,
        limit: errorData.limit
      });
    } else if (errorData.type === "RATE_LIMIT_EXCEEDED") {
      setError("Du hast zu viele Anfragen gestellt. Bitte warte einen Moment.");
    } else if (errorData.type === "API_UNAVAILABLE") {
      setError(errorData.message);
    }
  } catch (parseError) {
    setError("Ein unerwarteter Fehler ist aufgetreten.");
  }
}
```

---

## 9. DATEIÜBERSICHT

### Backend (Convex)

| Datei | Verantwortung | Änderungen |
|-------|---------------|------------|
| `convex/schema.ts` | Datenbank-Definition | Separate Counter, kein lifetime/trialing |
| `convex/rateLimiter.ts` | Rate Limiting (10 req/min) | **NEU** |
| `convex/users.ts` | User CRUD, Limit-Prüfung | Separate Queries, Counter Fix |
| `convex/recipes.ts` | Recipe CRUD mit Limit-Prüfung | Feature Detection, Race Condition Fix |
| `convex/stripe.ts` | Stripe Webhook Handler | Period Handling, Cancel Action |
| `convex/stripeInternal.ts` | Interne Queries | Simplified to Compatibility Layer |
| `convex/instagram.ts` | Instagram Scraper | Rate Limit, Graceful Degradation |
| `convex/website.ts` | Website Scraper | Rate Limit, Graceful Degradation, Auth |
| `convex/weekly.ts` | Weekly Plan | Keine Limits (Design Decision) |
| `convex/shopping.ts` | Shopping List | Keine Limits (Design Decision) |
| `convex/http.ts` | Clerk & Stripe Webhooks | Unverändert |

### Frontend (React)

| Datei | Verantwortung | Änderungen |
|-------|---------------|------------|
| `pages/ProfilePage.tsx` | Usage Stats Anzeige | Separate Counter, Cancel Button |
| `pages/SubscribePage.tsx` | Pricing & Checkout | €2.50/€25, kein lifetime |
| `pages/ShareTargetPage.tsx` | Shared URL Handler | Structured Error Handling |
| `components/UpgradeModal.tsx` | Paywall Modal | Feature-specific Messages |
| `components/AddRecipeModal.tsx` | Recipe Erstellung | Proaktive Checks, Upgrade Modal |

---

## 10. IMPLEMENTIERTE OPTIMIERUNGEN

### 10.1 Abgeschlossene Optimierungen

✅ **Separate Counter implementiert**
- `manualRecipes`, `linkImports`, `photoScans` sind nun unabhängig
- User können insgesamt 200 Aktionen haben (100+50+50)

✅ **Race Condition behoben**
- Counter werden NUR nach erfolgreichem Insert erhöht
- Keine Counter-Inflation bei Fehlern

✅ **Proaktive Limit Checks**
- Frontend prüft Limits VOR dem Speichern
- Upgrade Modal wird proaktiv angezeigt

✅ **Rate Limiting (10 req/min)**
- Verhindert API Abuse
- Implementiert in Instagram & Website Scraper

✅ **Graceful Degradation**
- Apify/Jina Fehler → Fallback auf manuelle Eingabe
- Gemini Fehler → Fallback auf Basis-Rezept

✅ **Subscription Cancellation**
- User kann Abo kündigen
- Bleibt Pro bis zum Periodenende
- Counter werden bei Downgrade reset (aber Rezepte bleiben!)

✅ **Strukturierte Error Handling**
- JSON-formatierte Errors
- Frontend kann Errors sauber parsen

✅ **Schema Cleanup**
- `lifetime` entfernt
- `trialing` entfernt
- `importsLastReset` entfernt
- `weeklyPlansActive` entfernt

### 10.2 Design-Entscheidungen

**Keine Limits für:**
- Weekly Plan (kostenlos für alle)
- Shopping List (kostenlos für alle)
- Favoriten (kostenlos für alle)

**Grund:** Diese Features sollen die App attraktiv machen und nicht hinter Paywall verstecken.

---

## 11. TESTING CHECKLIST

### 11.1 Free Tier Limits

- [ ] User kann 100 manuelle Rezepte erstellen (101. soll Upgrade Modal zeigen)
- [ ] User kann 50 Link-Imports machen (51. soll Upgrade Modal zeigen)
- [ ] User kann 50 KI-Foto-Scans machen (51. soll Upgrade Modal zeigen)
- [ ] Counter sind unabhängig (100+50+50 = 200 insgesamt möglich)
- [ ] Counter werden bei Fehlern nicht erhöht (Race Condition Check)

### 11.2 Pro Tier

- [ ] Pro User hat keine Limits (unlimited alles)
- [ ] Upgrade funktioniert (€2.50/Monat oder €25/Jahr)
- [ ] Subscription Start/End Datum wird korrekt gesetzt
- [ ] User kann Abo kündigen
- [ ] User bleibt Pro bis zum Periodenende

### 11.3 Downgrade

- [ ] Nach Periodenende wird User zu Free downgraded
- [ ] Counter werden auf 0 zurückgesetzt
- [ ] Alle Rezepte bleiben erhalten
- [ ] User kann weiterhin auf alte Rezepte zugreifen

### 11.4 Rate Limiting

- [ ] 10 API Requests/Minute werden durchgesetzt
- [ ] 11. Request wirft RATE_LIMIT_EXCEEDED Error
- [ ] Nach 60 Sekunden kann wieder请求 werden

### 11.5 Graceful Degradation

- [ ] Apify Fehler → "Service nicht verfügbar" Message
- [ ] Jina AI Fehler → "Service nicht verfügbar" Message
- [ ] Gemini Fehler → Basis-Rezept wird erstellt

---

## 12. PREISE & FEATURES

### Free Tier (€0)
- 100 Manuelle Rezepte
- 50 Link-Imports (Instagram/Website)
- 50 KI-Foto-Scans
- Unbegrenzte Wochenplanung
- Unbegrenzte Einkaufslisten
- Unbegrenzte Favoriten

### Pro Monatlich (€2.50/Monat)
- Unbegrenzt alles
- Jederzeit kündbar
- 1 Monat Verpflichtung

### Pro Jährlich (€25/Jahr)
- Unbegrenzt alles
- 33% Rabatt (vs. monatlich)
- Jährlich kündbar

---

**Ende der Dokumentation**

*Stand: 2025-01-17 nach vollständiger Optimierung*
