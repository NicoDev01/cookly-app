# Multi-Tenant Isolation Dokumentation

Diese Dokumentation beschreibt die Multi-Tenant-Architektur der Cookly-App und erklärt, wie die User-Isolation auf Datenbankebene sichergestellt wird.

---

## 1. Übersicht

### Was ist Multi-Tenant Isolation?

Multi-Tenant Isolation bezeichnet die strikte Trennung von Daten zwischen verschiedenen Benutzern (Tenants) in einer gemeinsam genutzten Datenbank. In der Cookly-App bedeutet dies:

- **Jeder User sieht nur seine eigenen Daten** (Rezepte, Einkaufslisten, Wochenpläne)
- **Kein User kann auf Daten anderer User zugreifen**
- **Alle Queries sind automatisch nach User gefiltert**

### Warum ist sie kritisch für die App?

| Risiko | Konsequenz |
|--------|------------|
| Daten-Leck | User A sieht private Rezepte von User B |
| Datenschutz-Verstoß | DSGVO-Verletzung, rechtliche Konsequenzen |
| Manipulation | User A könnte Rezepte von User B löschen/ändern |
| Vertrauensverlust | User verlassen die App |

---

## 2. Architektur

### Wie funktioniert die User-Isolation?

Die Isolation basiert auf der **Clerk ID als Tenant-ID**. Jeder User erhält von Clerk eine eindeutige ID (`clerkId`), die als primäres Identifikationsmerkmal dient.

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUTHENTIFIZIERUNG                        │
│                                                                 │
│   Clerk Auth → identity.subject = clerkId                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DATENFLUSS                              │
│                                                                 │
│   1. Auth-Check: ctx.auth.getUserIdentity()                     │
│   2. clerkId extrahieren: identity.subject                      │
│   3. Query mit clerkId filtern: .eq("clerkId", clerkId)         │
└─────────────────────────────────────────────────────────────────┘
```

### Datenfluss: Auth → Clerk ID → Query Filter

```typescript
// 1. Authentifizierung prüfen
const identity = await ctx.auth.getUserIdentity();
if (!identity) {
  throw new Error("Not authenticated");
}

// 2. Clerk ID extrahieren
const clerkId = identity.subject;

// 3. Query mit User-Filter
const recipes = await ctx.db
  .query("recipes")
  .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
  .collect();
```

---

## 3. Beteiligte Dateien und ihre Rollen

### Schema ([`convex/schema.ts`](convex/schema.ts))

#### Alle User-spezifischen Indizes

| Tabelle | Index | Felder | Zweck |
|---------|-------|--------|-------|
| `users` | `by_clerkId` | `clerkId` | User-Lookup |
| `users` | `by_stripeCustomer` | `stripeCustomerId` | Stripe-Webhooks |
| `recipes` | `by_user` | `clerkId` | Alle Rezepte eines Users |
| `recipes` | `by_category` | `clerkId`, `category` | Rezepte nach Kategorie |
| `recipes` | `by_favorite` | `clerkId`, `isFavorite` | Favoriten-Filter |
| `recipes` | `by_sourceUrl` | `sourceUrl` | ⚠️ **Global!** Nur für Deduplizierung |
| `recipes` | `by_user_sourceUrl` | `clerkId`, `sourceUrl` | User-spezifische Deduplizierung |
| `weeklyMeals` | `by_user_date` | `clerkId`, `date` | Wochenplan nach Datum |
| `weeklyMeals` | `by_user_scope` | `clerkId`, `scope` | Wochenplan nach Scope |
| `shoppingItems` | `by_user` | `clerkId` | Einkaufsliste |
| `shoppingItems` | `by_user_key` | `clerkId`, `key` | Deduplizierung |
| `categories` | `by_user` | `clerkId` | Kategorien eines Users |
| `categories` | `by_user_name` | `clerkId`, `name` | Kategorie nach Name |
| `categoryStats` | `by_user_category` | `clerkId`, `category` | Kategorie-Statistiken |

#### Warum `clerkId` immer erstes Feld im Index sein muss

**Convex Indizes arbeiten von links nach rechts.** Das erste Feld im Index ist das primäre Filterkriterium.

```typescript
// ✅ RICHTIG: clerkId ist erstes Feld
.index("by_user", ["clerkId"])
.index("by_category", ["clerkId", "category"])

// ❌ FALSCH: clerkId ist nicht erstes Feld
.index("by_category", ["category", "clerkId"]) // Funktioniert NICHT effizient!
```

**Erklärung:**
- Ein Index `["clerkId", "category"]` erlaubt effiziente Queries nach `clerkId` ALLEIN oder `clerkId` + `category`
- Ein Index `["category", "clerkId"]` erfordert zwingend `category` als ersten Filter

---

### Recipes ([`convex/recipes.ts`](convex/recipes.ts))

#### `getBySourceUrl` Query - User-spezifische Deduplizierung

```typescript
// Zeile 212-226
export const getBySourceUrl = query({
  args: { 
    url: v.string(),
    clerkId: v.string()  // ⚠️ clerkId MUSS übergeben werden!
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_user_sourceUrl", (q) => 
        q.eq("clerkId", args.clerkId).eq("sourceUrl", args.url)
      )
      .first();
    return recipe ? recipe._id : null;
  },
});
```

**Warum User-spezifisch?**
- User A importiert ein Instagram-Rezept
- User B importiert dasselbe Rezept
- Beide sollen ihr eigenes Exemplar haben (unterschiedliche Tags, Favoriten, etc.)

#### Relevante Indizes

| Index | Verwendung |
|-------|------------|
| `by_user` | Alle Rezepte eines Users laden |
| `by_category` | Rezepte nach Kategorie filtern |
| `by_favorite` | Nur Favoriten anzeigen |
| `by_user_sourceUrl` | Deduplizierung beim Import |

---

### Instagram Import ([`convex/instagram.ts`](convex/instagram.ts))

#### Import-Flow mit User-ID

```typescript
// Zeile 46-51: Authentifizierung
const identity = await ctx.auth.getUserIdentity();
if (!identity) {
  throw new Error("NOT_AUTHENTICATED");
}
const clerkId = identity.subject;

// Zeile 75: User-spezifische Deduplizierung
const existingId = await ctx.runQuery(api.recipes.getBySourceUrl, { 
  url: args.url, 
  clerkId  // ⚠️ clerkId wird übergeben!
});

// Zeile 299-313: Rezept mit clerkId erstellen
const newRecipeId = await ctx.runMutation(api.recipes.create, {
  // ... andere Felder
  sourceUrl: args.url,  // Setzt featureType = "link_imports"
});
```

---

### Facebook Import ([`convex/facebook.ts`](convex/facebook.ts))

Identischer Flow wie Instagram:

```typescript
// Zeile 118-122: Authentifizierung
const identity = await ctx.auth.getUserIdentity();
if (!identity) {
  throw new Error("NOT_AUTHENTICATED");
}
const clerkId = identity.subject;

// Zeile 146: User-spezifische Deduplizierung
const existingId = await ctx.runQuery(api.recipes.getBySourceUrl, { 
  url: args.url, 
  clerkId 
});
```

---

### Website Import ([`convex/website.ts`](convex/website.ts))

```typescript
// Zeile 48-52: Authentifizierung
const identity = await ctx.auth.getUserIdentity();
if (!identity) {
  throw new Error("NOT_AUTHENTICATED");
}
const clerkId = identity.subject;

// Zeile 67: User-spezifische Deduplizierung
const existingId = await ctx.runQuery(api.recipes.getBySourceUrl, { 
  url: args.url, 
  clerkId 
});
```

---

### Shopping ([`convex/shopping.ts`](convex/shopping.ts))

#### `by_user_key` Index für User-spezifische Deduplizierung

```typescript
// Zeile 36-44: Deduplizierung
const normalizedName = args.name.toLowerCase().trim();
const normalizedAmount = args.amount?.toLowerCase().trim() || "";
const key = `${normalizedName}|${normalizedAmount}`;

const existing = await ctx.db
  .query("shoppingItems")
  .withIndex("by_user_key", (q) => 
    q.eq("clerkId", identity.subject).eq("key", key)
  )
  .first();
```

**Wichtig:** Jeder User hat seine eigene Einkaufsliste. Die Deduplizierung erfolgt pro User.

---

### Weekly ([`convex/weekly.ts`](convex/weekly.ts))

#### Wochenplan-Isolation

```typescript
// Zeile 19-25: User-spezifische Abfrage
const allMeals = await ctx.db
  .query("weeklyMeals")
  .withIndex("by_user_date", (q) => q.eq("clerkId", clerkId))
  .collect();

// Zeile 109-119: Owner-Validation beim Löschen
const meal = await ctx.db.get(args.mealId);
if (!meal) {
  throw new Error("Meal not found");
}
if (meal.clerkId !== clerkId) {
  throw new Error("Access denied");
}
```

---

### Users ([`convex/users.ts`](convex/users.ts))

#### User-Limits und Subscription-Status

```typescript
// Zeile 33-72: Limit-Check für manuelle Rezepte
export const canCreateManualRecipe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { canProceed: false, error: "NOT_AUTHENTICATED" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    // Pro User haben keine Limits
    if (user.subscription !== "free") {
      return { canProceed: true, isPro: true };
    }

    const current = user.usageStats?.manualRecipes || 0;
    const limit = FREE_LIMITS.MANUAL_RECIPES;

    return {
      canProceed: current < limit,
      current,
      limit,
      remaining: Math.max(0, limit - current),
    };
  },
});
```

---

### Stripe ([`convex/stripe.ts`](convex/stripe.ts))

#### Payment-Isolation

```typescript
// Zeile 46-50: Authentifizierung
const identity = await ctx.auth.getUserIdentity();
if (!identity) {
  throw new Error("Not authenticated");
}
const clerkId = identity.subject;

// Zeile 53-55: User-spezifischer Lookup
let user = await ctx.runQuery(internal.stripeInternal.getUserByClerkId, {
  clerkId,
});

// Zeile 91-94: Metadata mit clerkId
metadata: {
  clerkId,
  priceId: args.priceId,
},
```

**Wichtig:** Die `clerkId` wird in Stripe-Metadata gespeichert, um Webhooks korrekt zuzuordnen.

---

## 4. Wichtige Patterns

### Index-Namenskonvention

| Pattern | Bedeutung | Beispiel |
|---------|-----------|----------|
| `by_user` | Alle Daten eines Users | `by_user` |
| `by_user_*` | User-spezifischer Filter | `by_user_date`, `by_user_key` |
| `by_*` | Globaler Index (Vorsicht!) | `by_sourceUrl`, `by_url` |

### Query-Filter Pattern

```typescript
// ✅ IMMER: clerkId als ersten Filter
.withIndex("by_user", (q) => q.eq("clerkId", clerkId))
.withIndex("by_user_date", (q) => q.eq("clerkId", clerkId).eq("date", date))

// ❌ NIEMALS: Query ohne clerkId-Filter
.query("recipes").collect() // Liefert ALLE Rezepte aller User!
```

### Security Checks in Mutations

```typescript
// ✅ IMMER: Owner-Validation
const recipe = await ctx.db.get(args.id);
if (!recipe || recipe.clerkId !== clerkId) {
  throw new Error("Recipe not found or access denied");
}
```

---

## 5. Häufige Fehler und wie man sie vermeidet

### Fehler 1: Globale Indizes ohne `clerkId`

```typescript
// ❌ FALSCH: Globaler Index ohne User-Filter
.index("by_sourceUrl", ["sourceUrl"])

// ✅ RICHTIG: User-spezifischer Index
.index("by_user_sourceUrl", ["clerkId", "sourceUrl"])
```

**Konsequenz:** User A könnte Rezepte von User B über die URL finden.

### Fehler 2: Fehlende Auth-Checks in Mutations

```typescript
// ❌ FALSCH: Keine Owner-Validation
export const updateRecipe = mutation({
  args: { id: v.id("recipes"), title: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { title: args.title });
  },
});

// ✅ RICHTIG: Mit Owner-Validation
export const updateRecipe = mutation({
  args: { id: v.id("recipes"), title: v.string() },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);
    const recipe = await ctx.db.get(args.id);
    if (!recipe || recipe.clerkId !== clerkId) {
      throw new Error("Recipe not found or access denied");
    }
    await ctx.db.patch(args.id, { title: args.title });
  },
});
```

### Fehler 3: Query ohne User-Filter

```typescript
// ❌ FALSCH: Liefert alle Rezepte aller User
const recipes = await ctx.db.query("recipes").collect();

// ✅ RICHTIG: Nur Rezepte des aktuellen Users
const clerkId = await getAuthenticatedClerkId(ctx);
const recipes = await ctx.db
  .query("recipes")
  .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
  .collect();
```

---

## 6. Code-Beispiele

### Korrekte Query-Implementierung

```typescript
// Helper-Funktion für Auth
async function getAuthenticatedClerkId(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity.subject;
}

// Query mit User-Filter
export const list = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_user", (q) => q.eq("clerkId", clerkId))
      .collect();

    return recipes;
  },
});
```

### Korrekte Mutation-Implementierung

```typescript
export const update = mutation({
  args: {
    id: v.id("recipes"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await getAuthenticatedClerkId(ctx);

    // 1. Dokument laden
    const recipe = await ctx.db.get(args.id);

    // 2. Owner-Validation
    if (!recipe || recipe.clerkId !== clerkId) {
      throw new Error("Recipe not found or access denied");
    }

    // 3. Update durchführen
    await ctx.db.patch(args.id, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});
```

### Korrekter Index im Schema

```typescript
// In convex/schema.ts
recipes: defineTable({
  clerkId: v.string(), // Owner
  title: v.string(),
  category: v.string(),
  // ... weitere Felder
})
.index("by_user", ["clerkId"])                          // Alle Rezepte eines Users
.index("by_category", ["clerkId", "category"])          // Nach Kategorie
.index("by_favorite", ["clerkId", "isFavorite"])        // Favoriten
.index("by_user_sourceUrl", ["clerkId", "sourceUrl"]);  // Deduplizierung
```

---

## 7. Checklist für neue Features

Bevor neue Queries/Mutations hinzugefügt werden, prüfe:

### Schema

- [ ] Enthält die Tabelle ein `clerkId`-Feld?
- [ ] Ist `clerkId` das **erste Feld** in allen User-spezifischen Indizes?
- [ ] Folgt die Index-Namenskonvention (`by_user_*`)?

### Queries

- [ ] Wird `getAuthenticatedClerkId()` aufgerufen?
- [ ] Wird der Index mit `clerkId`-Filter verwendet?
- [ ] Wird keine globale Query ohne Filter verwendet?

### Mutations

- [ ] Wird `getAuthenticatedClerkId()` aufgerufen?
- [ ] Wird vor jedem Update/Delete die Owner-Validation durchgeführt?
- [ ] Wird bei Insert das `clerkId`-Feld korrekt gesetzt?

### Actions (z.B. Import)

- [ ] Wird die Authentifizierung geprüft?
- [ ] Wird die `clerkId` an alle internen Queries/Mutations übergeben?
- [ ] Wird Rate-Limiting verwendet um API-Missbrauch zu verhindern?

---

## 8. Bekannte Warnungen

### `setUsageStats` ohne Auth-Prüfung

**Datei:** [`convex/users.ts`](convex/users.ts:932)

```typescript
// Zeile 932-965
export const setUsageStats = mutation({
  args: { 
    clerkId: v.string(),
    manualRecipes: v.optional(v.number()),
    linkImports: v.optional(v.number()),
    photoScans: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // ⚠️ WARNUNG: Keine Auth-Prüfung!
    // Jeder kann die Stats für jeden User setzen.
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");

    // ... Update
  }
});
```

**Risiko:** Jeder authentifizierte User kann die Usage-Stats eines anderen Users ändern.

**Empfehlung:**
1. Auth-Prüfung hinzufügen ODER
2. Zu `internalMutation` ändern (nur für interne Aufrufe) ODER
3. Admin-Rolle prüfen

---

## 9. Zusammenfassung

| Aspekt | Implementierung |
|--------|-----------------|
| Tenant-ID | `clerkId` (Clerk User ID) |
| Auth-Check | `ctx.auth.getUserIdentity()` |
| Query-Filter | `.withIndex("by_user", (q) => q.eq("clerkId", clerkId))` |
| Mutation-Schutz | Owner-Validation vor jedem Update/Delete |
| Index-Design | `clerkId` immer als erstes Feld |

**Goldene Regel:** Jede Query und Mutation MUSS die `clerkId` validieren - keine Ausnahmen!
