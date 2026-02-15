# Optimierungs-Todos

Diese Dokumentation enthält alle identifizierten Optimierungsvorschläge für das Cookly-Projekt.

---

## 🔴 Hochpriorität

### 1. Sicherheit: `setUsageStats` absichern

- **Datei:** [`convex/users.ts:932`](../convex/users.ts:932)
- **Priorität:** 🔴 Hoch
- **Status:** [ ] Offen

#### Problem

Die Mutation `setUsageStats` ist als öffentliche `mutation` definiert. Jeder authentifizierte User kann die Usage-Stats eines **anderen** Users ändern, indem er dessen `clerkId` als Parameter übergibt. Es fehlt die Prüfung, ob der aufrufende User auch der Besitzer der übergebenen `clerkId` ist.

```typescript
// Aktuelle unsichere Implementierung (Zeile 932-965)
export const setUsageStats = mutation({
  args: { 
    clerkId: v.string(),  // ⚠️ Jeder kann jede clerkId übergeben
    manualRecipes: v.optional(v.number()),
    linkImports: v.optional(v.number()),
    photoScans: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // ⚠️ Keine Prüfung: Gehört args.clerkId dem authentifizierten User?
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");
    // ... Stats werden geändert
  }
});
```

#### Lösung

**Option A: Zu `internalMutation` ändern (Empfohlen)**

```typescript
// Nur noch von internen Functions aufrufbar
export const setUsageStats = internalMutation({
  args: { 
    clerkId: v.string(),
    manualRecipes: v.optional(v.number()),
    linkImports: v.optional(v.number()),
    photoScans: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // ... gleiche Logik
  }
});
```

**Option B: Auth-Prüfung hinzufügen**

```typescript
export const setUsageStats = mutation({
  args: { 
    clerkId: v.string(),
    manualRecipes: v.optional(v.number()),
    linkImports: v.optional(v.number()),
    photoScans: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    // ✅ Prüfung: Nur der eigene User darf seine Stats ändern
    if (identity.subject !== args.clerkId) {
      throw new Error("UNAUTHORIZED: Can only modify own usage stats");
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");
    // ... Stats werden geändert
  }
});
```

---

## 🟡 Mittelpriorität

### 2. Code-Duplizierung reduzieren: Import-Flows

- **Dateien:** 
  - [`convex/instagram.ts`](../convex/instagram.ts)
  - [`convex/facebook.ts`](../convex/facebook.ts)
  - [`convex/website.ts`](../convex/website.ts)
- **Priorität:** 🟡 Mittel
- **Status:** [ ] Offen

#### Problem

Alle drei Import-Dateien haben fast identische Strukturen mit dupliziertem Code:

1. **Authentifizierung** (identisch in allen 3 Dateien)
2. **Rate Limiting** (identisch in allen 3 Dateien)
3. **Duplicate Check** (identisch in allen 3 Dateien)
4. **Graceful Degradation Pattern** (ähnlich)
5. **Image Upload zu Convex Storage** (identisch)
6. **Pollinations Fallback** (identisch in instagram.ts und facebook.ts)
7. **Recipe Creation** (identisch)

#### Duplizierte Code-Blöcke

**Authentifizierung (ca. 10 Zeilen × 3 = 30 Zeilen):**
```typescript
// Identisch in instagram.ts:47-51, facebook.ts:118-122, website.ts:48-52
const identity = await ctx.auth.getUserIdentity();
if (!identity) {
  throw new Error("NOT_AUTHENTICATED");
}
const clerkId = identity.subject;
```

**Rate Limiting (ca. 10 Zeilen × 3 = 30 Zeilen):**
```typescript
// Identisch in instagram.ts:56-63, facebook.ts:127-134, website.ts:57-64
if (!checkRateLimit(clerkId)) {
  const status = getRateLimitStatus(clerkId);
  throw new Error(JSON.stringify({
    type: "RATE_LIMIT_EXCEEDED",
    resetAt: status.resetAt,
    message: "Du hast zu viele Anfragen gestellt. Bitte warte einen Moment.",
  }));
}
```

**Image Upload (ca. 20 Zeilen × 2 = 40 Zeilen):**
```typescript
// Fast identisch in instagram.ts:222-267 und facebook.ts:323-368
const imageRes = await fetch(imageUrl);
if (imageRes.ok) {
  const imageBlob = await imageRes.blob();
  const uploadUrl = await ctx.runMutation(api.recipes.generateImageUploadUrl);
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": imageBlob.type },
    body: imageBlob,
  });
  // ...
}
```

#### Lösung: Gemeinsame Helper-Funktionen extrahieren

**Neue Datei: `convex/importHelpers.ts`**

```typescript
"use node";
import { ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { checkRateLimit, getRateLimitStatus } from "./rateLimiter";

// ============================================================
// Types
// ============================================================

export interface RecipeData {
  title?: string;
  category?: string;
  prepTimeMinutes?: number;
  difficulty?: "Einfach" | "Mittel" | "Schwer";
  portions?: number;
  ingredients?: Array<{ name: string; amount?: string; checked?: boolean }>;
  instructions?: Array<{ text: string; icon?: string }>;
  imageKeywords?: string;
}

export interface AuthResult {
  clerkId: string;
}

export interface ImageUploadResult {
  storageId: Id<"_storage">;
  blurhash?: string;
  finalUrl: string;
}

// ============================================================
// Authentifizierung
// ============================================================

export async function authenticateUser(ctx: ActionCtx): Promise<AuthResult> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("NOT_AUTHENTICATED");
  }
  return { clerkId: identity.subject };
}

// ============================================================
// Rate Limiting
// ============================================================

export function enforceRateLimit(clerkId: string): void {
  if (!checkRateLimit(clerkId)) {
    const status = getRateLimitStatus(clerkId);
    throw new Error(JSON.stringify({
      type: "RATE_LIMIT_EXCEEDED",
      resetAt: status.resetAt,
      message: "Du hast zu viele Anfragen gestellt. Bitte warte einen Moment.",
    }));
  }
}

// ============================================================
// Duplicate Check
// ============================================================

export async function checkForDuplicate(
  ctx: ActionCtx, 
  url: string, 
  clerkId: string
): Promise<Id<"recipes"> | null> {
  const existingId = await ctx.runQuery(api.recipes.getBySourceUrl, { url, clerkId });
  if (existingId) {
    console.log(`Recipe already exists for ${url}, returning existing ID.`);
  }
  return existingId;
}

// ============================================================
// Image Upload
// ============================================================

export async function uploadImageToStorage(
  ctx: ActionCtx,
  imageUrl: string
): Promise<ImageUploadResult | null> {
  try {
    const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!imageRes.ok) return null;

    const imageBlob = await imageRes.blob();
    const uploadUrl = await ctx.runMutation(api.recipes.generateImageUploadUrl);
    
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": imageBlob.type },
      body: imageBlob,
    });

    if (uploadRes.ok) {
      const { storageId } = await uploadRes.json();
      return { storageId, finalUrl: imageUrl };
    }
  } catch (err) {
    console.error("Image upload failed:", err);
  }
  return null;
}

// ============================================================
// Pollinations Fallback
// ============================================================

export async function generatePollinationsImage(
  ctx: ActionCtx,
  title: string
): Promise<ImageUploadResult | null> {
  try {
    const safeTitle = encodeURIComponent(title || "Delicious Food");
    const pollinationsUrl = `https://image.pollinations.ai/prompt/realistic%20food%20photography%20${safeTitle}?width=1024&height=1024&model=klein&nologo=true`;

    return await uploadImageToStorage(ctx, pollinationsUrl);
  } catch (err) {
    console.error("Pollinations fallback failed:", err);
    return null;
  }
}

// ============================================================
// Error Handling
// ============================================================

export function createApiUnavailableError(service: string, url: string): Error {
  return new Error(JSON.stringify({
    type: "API_UNAVAILABLE",
    service,
    fallbackMode: "manual",
    prefillUrl: url,
    message: `Der ${service}-Service ist gerade nicht verfügbar. Bitte gib das Rezept manuell ein.`,
  }));
}
```

**Verwendung in `instagram.ts` (vereinfacht):**

```typescript
import { 
  authenticateUser, 
  enforceRateLimit, 
  checkForDuplicate,
  uploadImageToStorage,
  generatePollinationsImage,
  createApiUnavailableError,
  type RecipeData 
} from "./importHelpers";

export const scrapePost = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<Id<"recipes">> => {
    // 1. Auth (1 Zeile statt 5)
    const { clerkId } = await authenticateUser(ctx);

    // 2. Rate Limiting (1 Zeile statt 8)
    enforceRateLimit(clerkId);

    // 3. URL Validation (bleibt spezifisch)
    if (!args.url.includes("instagram.com/")) {
      throw new Error("INVALID_INSTAGRAM_URL");
    }

    // 4. Duplicate Check (1 Zeile statt 4)
    const existing = await checkForDuplicate(ctx, args.url, clerkId);
    if (existing) return existing;

    // 5. Apify Call (bleibt spezifisch)
    // ...

    // 6. Image Upload (vereinfacht)
    let imageResult = await uploadImageToStorage(ctx, imageUrl);
    if (!imageResult) {
      imageResult = await generatePollinationsImage(ctx, recipeData.title || "");
    }

    // 7. Recipe Creation (bleibt ähnlich)
    // ...
  },
});
```

#### Geschätzte Einsparung

- **Ca. 150-200 Zeilen duplizierter Code** können eliminiert werden
- **Wartbarkeit:** Bugfixes und Änderungen nur noch an einer Stelle
- **Testbarkeit:** Helper-Funktionen können isoliert getestet werden

---

### 3. Error Handling vereinheitlichen

- **Dateien:** Alle `convex/*.ts` Dateien
- **Priorität:** 🟡 Mittel
- **Status:** [ ] Offen

#### Problem

Inkonsistente Error-Typen und -Meldungen im gesamten Codebase:

```typescript
// Verschiedene Error-Formate:
throw new Error("NOT_AUTHENTICATED");                    // Simple String
throw new Error("User not found");                       // Lesbarer Text
throw new Error(JSON.stringify({ type: "RATE_LIMIT" })); // JSON-String
throw new Error(`Apify run failed: ${status}`);          // Template-String
```

#### Lösung: Einheitliche Error-Klassen

**Neue Datei: `convex/errors.ts`**

```typescript
/**
 * Basis-Error-Klasse für alle Convex-Operationen
 */
export class ConvexError extends Error {
  constructor(
    public readonly type: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ConvexError";
  }

  toJSON() {
    return {
      type: this.type,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Spezifische Error-Klassen
 */
export class AuthenticationError extends ConvexError {
  constructor(message = "Nicht authentifiziert") {
    super("AUTHENTICATION_ERROR", message);
  }
}

export class AuthorizationError extends ConvexError {
  constructor(message = "Keine Berechtigung für diese Aktion") {
    super("AUTHORIZATION_ERROR", message);
  }
}

export class RateLimitError extends ConvexError {
  constructor(resetAt: number) {
    super("RATE_LIMIT_EXCEEDED", "Zu viele Anfragen", { resetAt });
  }
}

export class NotFoundError extends ConvexError {
  constructor(resource: string, identifier?: string) {
    super("NOT_FOUND", `${resource} nicht gefunden`, { resource, identifier });
  }
}

export class ExternalApiError extends ConvexError {
  constructor(service: string, fallbackMode?: string) {
    super("EXTERNAL_API_ERROR", `${service} nicht verfügbar`, { 
      service, 
      fallbackMode 
    });
  }
}

export class ValidationError extends ConvexError {
  constructor(field: string, reason: string) {
    super("VALIDATION_ERROR", `Ungültige Eingabe: ${reason}`, { field, reason });
  }
}

/**
 * Helper für JSON-Serialisierung (für Error-Responses)
 */
export function serializeError(error: unknown): string {
  if (error instanceof ConvexError) {
    return JSON.stringify(error.toJSON());
  }
  if (error instanceof Error) {
    return JSON.stringify({
      type: "UNKNOWN_ERROR",
      message: error.message,
    });
  }
  return JSON.stringify({
    type: "UNKNOWN_ERROR",
    message: "Ein unbekannter Fehler ist aufgetreten",
  });
}
```

**Verwendung:**

```typescript
import { AuthenticationError, RateLimitError, NotFoundError } from "./errors";

// Statt:
throw new Error("NOT_AUTHENTICATED");

// Jetzt:
throw new AuthenticationError();

// Statt:
throw new Error(JSON.stringify({ type: "RATE_LIMIT_EXCEEDED", resetAt }));

// Jetzt:
throw new RateLimitError(status.resetAt);
```

---

## 🟢 Niedrigpriorität

### 4. Schema-Bereinigung: Unbenutzten Index entfernen

- **Datei:** [`convex/schema.ts:106`](../convex/schema.ts:106)
- **Priorität:** 🟢 Niedrig
- **Status:** [ ] Offen

#### Problem

Der Index `by_sourceUrl` auf dem `recipes`-Table ist potenziell problematisch:

```typescript
// Zeile 106
.index("by_sourceUrl", ["sourceUrl"])
```

**Probleme:**
1. **Multi-Tenant-Isolation:** Der Index erlaubt Queries über alle User hinweg
2. **Sicherheitsrisiko:** Ein User könnte theoretisch alle Rezepte mit gleicher `sourceUrl` finden
3. **Redundanz:** Wir nutzen jetzt `by_user_sourceUrl` für die korrekte User-Isolation

#### Analyse der Verwendung

```typescript
// Korrekte Verwendung (mit User-Isolation):
// convex/recipes.ts
await ctx.db
  .query("recipes")
  .withIndex("by_user_sourceUrl", (q) => 
    q.eq("clerkId", clerkId).eq("sourceUrl", url)
  )
  .first();

// Problematische Verwendung (ohne User-Isolation):
// Falls irgendwo verwendet, müsste dies geprüft werden
```

#### Lösung

**Option A: Index entfernen (Empfohlen)**

```typescript
// convex/schema.ts
.index("by_user", ["clerkId"])
.index("by_category", ["clerkId", "category"])
.index("by_favorite", ["clerkId", "isFavorite"])
// .index("by_sourceUrl", ["sourceUrl"])  // ❌ Entfernen
.index("by_user_sourceUrl", ["clerkId", "sourceUrl"])  // ✅ Behalten
.searchIndex("search_title", { searchField: "title" });
```

**Option B: Mit Kommentar versehen (falls noch verwendet)**

```typescript
// WARNUNG: Dieser Index bricht Multi-Tenant-Isolation!
// Nur für Admin-Queries verwenden, NIEMALS für User-Queries
.index("by_sourceUrl", ["sourceUrl"])
```

**Vor dem Entfernen prüfen:**
```bash
# Suche nach Verwendungen des Index
grep -r "by_sourceUrl" convex/
```

---

### 5. TypeScript-Verbesserungen

- **Dateien:** Alle `convex/*.ts` und `components/*.tsx` Dateien
- **Priorität:** 🟢 Niedrig
- **Status:** [ ] Offen

#### Problem

Verwendung von `any` und fehlende Typisierung:

```typescript
// convex/website.ts:300
const image = (await Jimp.read(buffer)) as any;  // ⚠️ any

// convex/facebook.ts:231
const post = items[0] as Record<string, unknown>;  // ⚠️ Unspezifisch

// Mehrere Dateien
catch (error: unknown) {
  const err = error as Error;  // ⚠️ Type assertion ohne Prüfung
}
```

#### Lösung: Konkrete Typen definieren

**Neue Datei: `convex/types.ts`**

```typescript
import { Id } from "./_generated/dataModel";

// ============================================================
// API Response Types
// ============================================================

export interface ApifyRunResponse {
  data: {
    id: string;
    status: "SUCCEEDED" | "FAILED" | "ABORTED" | "RUNNING";
    defaultDatasetId?: string;
  };
}

export interface ApifyDatasetItem {
  // Instagram
  caption?: string;
  images?: string[];
  displayUrl?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  
  // Facebook
  message?: string | { text?: string };
  text?: string;
  story?: string;
  media?: Array<{
    photo_image?: { uri?: string };
    thumbnail?: string;
  }>;
  short_form_video_context?: {
    playback_video?: {
      thumbnailImage?: { uri?: string };
      preferred_thumbnail?: { image?: { uri?: string } };
    };
    video?: {
      first_frame_thumbnail?: string;
    };
  };
  
  // Common
  url?: string;
  postId?: string;
  id?: string;
  pageName?: string;
}

export interface JinaAiResponse {
  data: {
    title?: string;
    content?: string;
    images?: string[];
    image?: string;
    thumbnail?: string;
    ogImage?: string;
    metadata?: Record<string, string>;
  };
}

// ============================================================
// Recipe Types
// ============================================================

export interface RecipeIngredient {
  name: string;
  amount?: string;
  checked: boolean;
}

export interface RecipeInstruction {
  text: string;
  icon?: string;
}

export interface ParsedRecipe {
  title: string;
  category: string;
  prepTimeMinutes: number;
  difficulty: "Einfach" | "Mittel" | "Schwer";
  portions: number;
  ingredients: RecipeIngredient[];
  instructions: RecipeInstruction[];
  imageKeywords?: string;
}

// ============================================================
// Error Types
// ============================================================

export interface ErrorResponse {
  type: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================
// Type Guards
// ============================================================

export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export function hasMessage(error: unknown): error is { message: string } {
  return typeof error === "object" && error !== null && "message" in error;
}
```

**Verwendung:**

```typescript
import type { ApifyDatasetItem, ParsedRecipe } from "./types";

// Statt:
const post = items[0] as Record<string, unknown>;

// Jetzt:
const post = items[0] as ApifyDatasetItem;

// Statt:
catch (error: unknown) {
  const err = error as Error;
}

// Jetzt:
catch (error: unknown) {
  if (isError(error)) {
    console.error(error.message);
  }
}
```

---

## Zusammenfassung

| # | Todo | Priorität | Geschätzter Aufwand |
|---|------|-----------|---------------------|
| 1 | `setUsageStats` absichern | 🔴 Hoch | 15 Min |
| 2 | Code-Duplizierung reduzieren | 🟡 Mittel | 2-3 Std |
| 3 | Error Handling vereinheitlichen | 🟡 Mittel | 2-3 Std |
| 4 | Unbenutzten Index entfernen | 🟢 Niedrig | 30 Min |
| 5 | TypeScript-Verbesserungen | 🟢 Niedrig | 3-4 Std |

---

## Priorisierung

1. **Sofort erledigen:** Todo #1 (Sicherheitsrisiko)
2. **Nächster Sprint:** Todos #2 und #3 (Code-Qualität)
3. **Bei Gelegenheit:** Todos #4 und #5 (Technische Schulden)
