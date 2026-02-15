# Usage Limits System Documentation

This document provides a comprehensive overview of the usage limits system in Cookly, a multi-tenant SaaS recipe application.

## 1. Overview

### Purpose

The usage limits system ensures fair resource allocation across free-tier users while providing incentives to upgrade to paid plans. It prevents abuse and helps manage infrastructure costs for expensive operations like AI photo scanning and external API calls.

### Features with Limits

| Feature | Limit Type | Description |
|---------|-----------|-------------|
| Manual Recipes | `manual_recipes` | Recipes created manually through the form |
| Link Imports | `link_imports` | Recipes imported from Instagram, Facebook, or website URLs |
| Photo Scans | `photo_scans` | Recipes created via AI photo analysis |

### Current Limit Values (Free Tier)

All limits are defined in [`convex/constants.ts`](../convex/constants.ts:6):

```typescript
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,
  LINK_IMPORTS: 100,
  PHOTO_SCANS: 100,
} as const;
```

**Note:** These are lifetime limits for free users, not monthly resets.

---

## 2. Architecture

### Single Source of Truth

All limit values are defined in one place: **`convex/constants.ts`**

This ensures:
- Consistency between frontend display and backend enforcement
- Easy modification without touching multiple files
- Type safety via TypeScript `as const`

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USAGE LIMITS FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  constants.ts    │     │    users.ts      │     │   recipes.ts     │
│  (Limit Values)  │────▶│  (Queries for    │     │  (Enforcement)   │
│                  │     │   limit checks)  │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
         │                        │                        │
         │                        ▼                        │
         │              ┌──────────────────┐              │
         │              │   ProfilePage    │              │
         │              │   (Display to    │              │
         │              │    users)        │              │
         │              └──────────────────┘              │
         │                                                │
         └────────────────────────────────────────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │  usageStats in users     │
              │  table (Counter Storage) │
              └──────────────────────────┘
```

### Key Principle: Check-Before-Create

The system follows a **proactive check** pattern:
1. Frontend queries limit status before showing the action UI
2. Frontend can show upgrade modal proactively
3. Backend enforces limits as a safety net during creation

---

## 3. Key Files

### [`convex/constants.ts`](../convex/constants.ts:1)

**Role:** Single source of truth for all limit values.

```typescript
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,
  LINK_IMPORTS: 100,
  PHOTO_SCANS: 100,
} as const;

export type FreeLimitType = keyof typeof FREE_LIMITS;
```

**Important:** Never hardcode limit values elsewhere. Always import from this file.

---

### [`convex/users.ts`](../convex/users.ts:1)

**Role:** Provides queries for limit checking and mutations for counter management.

#### Key Queries:

| Query | Lines | Purpose |
|-------|-------|---------|
| [`canCreateManualRecipe`](../convex/users.ts:33) | 33-72 | Check if user can create manual recipes |
| [`canImportFromLink`](../convex/users.ts:78) | 78-117 | Check if user can import from URLs |
| [`canScanPhoto`](../convex/users.ts:123) | 123-162 | Check if user can use AI photo scan |
| [`getUsageStats`](../convex/users.ts:167) | 167-192 | Legacy query for ProfilePage compatibility |

#### Key Mutations:

| Mutation | Lines | Purpose |
|----------|-------|---------|
| [`incrementUsageCounter`](../convex/users.ts:432) | 432-492 | Increment counter after successful recipe creation |
| [`resetUsageCounters`](../convex/users.ts:498) | 498+ | Reset counters on Pro→Free downgrade |

#### Return Type Structure:

```typescript
// All canXxx queries return this structure:
{
  canProceed: boolean;      // Whether the action is allowed
  isPro: boolean;           // Whether user has paid subscription
  subscription: "free" | "pro_monthly" | "pro_yearly";
  current: number;          // Current usage count (free users only)
  limit: number;            // Limit value (free users only)
  remaining: number;        // Remaining uses (free users only)
  feature: "manual_recipes" | "link_imports" | "photo_scans";
}
```

---

### [`convex/recipes.ts`](../convex/recipes.ts:1)

**Role:** Enforces limits during recipe creation.

#### Key Function: [`create`](../convex/recipes.ts:288) mutation (lines 288-430)

The create mutation follows this flow:

```typescript
// 1. Determine feature type (lines 325-336)
let featureType: "manual_recipes" | "link_imports" | "photo_scans";

if (args.sourceUrl) {
  featureType = "link_imports";      // URL import
} else if (args.sourceImageUrl) {
  featureType = "photo_scans";       // Photo scan
} else {
  featureType = "manual_recipes";    // Manual entry
}

// 2. Check subscription status (lines 352-359)
if (user.subscription !== "free") {
  // Pro users: No limits, skip counter increment
  return await insertRecipe(ctx, clerkId, args);
}

// 3. Check limit for free users (lines 364-401)
if (currentCount >= limit) {
  const errorData = {
    type: "LIMIT_REACHED",
    feature: featureType,
    current: currentCount,
    limit: limit,
    message: getLimitMessage(featureType, limit),
  };
  throw new Error(JSON.stringify(errorData));
}

// 4. Create recipe, then increment counter (lines 406-428)
const recipeId = await insertRecipe(ctx, clerkId, args);
await ctx.runMutation(internal.users.incrementUsageCounter, {
  clerkId,
  feature: featureType,
});
```

---

### [`convex/schema.ts`](../convex/schema.ts:34)

**Role:** Defines the database schema for usage statistics.

```typescript
usageStats: v.object({
  // Separate counters for each feature type
  manualRecipes: v.optional(v.number()),      // Manual recipes count
  linkImports: v.optional(v.number()),        // URL imports count
  photoScans: v.optional(v.number()),         // AI photo scans count

  // Subscription tracking
  subscriptionStartDate: v.optional(v.number()),
  subscriptionEndDate: v.optional(v.number()),
  resetOnDowngrade: v.optional(v.boolean()),

  // Deprecated fields (for migration compatibility)
  importedRecipes: v.optional(v.number()),
  importsLastReset: v.optional(v.number()),
  weeklyPlansActive: v.optional(v.number()),
}),
```

---

### [`pages/ProfilePage.tsx`](../pages/ProfilePage.tsx:1)

**Role:** Displays usage statistics to users.

#### Query Usage (lines 34-36):

```typescript
const manualLimit = useQuery(api.users.canCreateManualRecipe);
const linkLimit = useQuery(api.users.canImportFromLink);
const scanLimit = useQuery(api.users.canScanPhoto);
```

#### Usage Display Component (lines 301-335):

```typescript
const UsageRow = ({ icon: Icon, label, current, limit }) => {
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isFull = percentage >= 100 && limit > 0;

  return (
    <div className="space-y-3 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={isFull ? "text-destructive" : "text-primary"} />
          <span className="font-bold">{label}</span>
        </div>
        <span className={isFull ? "text-destructive" : "text-secondary"}>
          {current} / {limit}
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-5 w-full bg-card rounded-xl overflow-hidden">
        <div
          className={isFull ? "bg-destructive" : "bg-primary"}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
```

---

### [`components/UpgradeModal.tsx`](../components/UpgradeModal.tsx:1)

**Role:** Displays upgrade prompt when limits are reached.

#### Props Interface (lines 3-9):

```typescript
interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount?: number;
  limit?: number;
  feature?: 'manual_recipes' | 'link_imports' | 'photo_scans';
}
```

#### Feature-Specific Messaging (lines 27-46):

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

---

### [`components/AddRecipeModal.tsx`](../components/AddRecipeModal.tsx:1)

**Role:** Performs proactive limit checks before recipe creation.

#### Limit Check Queries (lines 35-37):

```typescript
const canCreateManual = useQuery(api.users.canCreateManualRecipe);
const canImportLink = useQuery(api.users.canImportFromLink);
const canScanPhoto = useQuery(api.users.canScanPhoto);
```

#### Proactive Check in handleSave (lines 625-659):

```typescript
const handleSave = async () => {
  // Only check for new recipes (not edits)
  if (!initialData) {
    let limitCheck;

    // Determine feature type
    if (formData.sourceUrl) {
      limitCheck = canImportLink;      // URL import
    } else if (activeTab === 'ai') {
      limitCheck = canScanPhoto;       // AI photo scan
    } else {
      limitCheck = canCreateManual;    // Manual recipe
    }

    // Show upgrade modal if limit reached
    if (limitCheck && !limitCheck.canProceed) {
      setShowUpgradeModal({
        isOpen: true,
        feature: limitCheck.feature,
        current: limitCheck.current,
        limit: limitCheck.limit,
      });
      setIsSaving(false);
      return; // Prevent save
    }
  }
  // ... continue with save
};
```

---

### [`pages/ShareTargetPage.tsx`](../pages/ShareTargetPage.tsx:1)

**Role:** Handles share intent imports with limit error handling.

#### Error Handling (lines 154-192):

```typescript
try {
  const recipeId = await scrapePost({ url: postUrl });
  // ... success handling
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);

  // Parse structured error JSON
  try {
    const errorData = JSON.parse(msg);

    if (errorData.type === "LIMIT_REACHED") {
      setLimitData({
        feature: errorData.feature || 'link_imports',
        current: errorData.current || 0,
        limit: errorData.limit || 50
      });
      setStatus('error');
    } else if (errorData.type === "RATE_LIMIT_EXCEEDED") {
      setError("Du hast zu viele Anfragen gestellt. Bitte warte einen Moment.");
      setStatus('error');
    }
    // ... other error types
  } catch {
    // Fallback for non-JSON errors
    if (msg.includes("No data found")) {
      setError("Kein Rezept gefunden 😕");
    }
    // ... other fallback cases
  }
}
```

---

## 4. How It Works

### 4.1 Usage Tracking

#### Storage Location

Usage counters are stored in the `users` table within the `usageStats` object:

```typescript
// User document structure
{
  _id: Id<"users">,
  clerkId: string,
  subscription: "free" | "pro_monthly" | "pro_yearly",
  usageStats: {
    manualRecipes: 45,      // 45 manual recipes created
    linkImports: 12,        // 12 link imports
    photoScans: 3,          // 3 photo scans
    // ... other fields
  }
}
```

#### Counter Increment Flow

1. **Recipe creation initiated** in `recipes.ts` `create` mutation
2. **Limit check passed** (user is under limit or is Pro)
3. **Recipe inserted** into database
4. **Counter incremented** via `internal.users.incrementUsageCounter`

```typescript
// In recipes.ts create mutation (lines 406-415)
try {
  const recipeId = await insertRecipe(ctx, clerkId, args);

  // ONLY increment after successful insert!
  await ctx.runMutation(internal.users.incrementUsageCounter, {
    clerkId,
    feature: featureType,
  });

  return recipeId;
} catch (error) {
  // Insert failed -> Counter NOT incremented (correct!)
  throw error;
}
```

**Critical:** Counter increment happens AFTER successful recipe insert to prevent count drift.

#### When Counters Are Checked

| Scenario | When Check Occurs | Where |
|----------|-------------------|-------|
| Profile Page | On page load | `ProfilePage.tsx` via `useQuery` |
| Add Recipe Modal | On save button click | `AddRecipeModal.tsx` `handleSave` |
| Share Import | During import action | `recipes.ts` `create` mutation |
| AI Photo Scan | On scan initiation | `AddRecipeModal.tsx` `handleSingleImageUpload` |

---

### 4.2 Limit Enforcement Flow

#### Step-by-Step Flow (Recipe Creation)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RECIPE CREATION FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

User clicks "Save"
        │
        ▼
┌───────────────────┐
│ AddRecipeModal    │
│ handleSave()      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     NO LIMIT REACHED
│ Proactive Check   │────────────────────────┐
│ (Frontend)        │                        │
│ canCreateXxx?     │                        │
└─────────┬─────────┘                        │
          │                                  │
   LIMIT  │                                  │
   REACHED │                                  ▼
          │                        ┌───────────────────┐
          ▼                        │ createRecipe()    │
┌───────────────────┐              │ mutation called   │
│ Show UpgradeModal │              └─────────┬─────────┘
│ (Prevent save)    │                        │
└───────────────────┘                        ▼
                                  ┌───────────────────┐
                                  │ recipes.ts        │
                                  │ create mutation   │
                                  └─────────┬─────────┘
                                            │
                                            ▼
                                  ┌───────────────────┐
                                  │ Determine         │
                                  │ featureType       │
                                  │ (manual/link/scan)│
                                  └─────────┬─────────┘
                                            │
                                            ▼
                                  ┌───────────────────┐
                                  │ Check             │
                                  │ subscription      │
                                  └─────────┬─────────┘
                                            │
                              ┌─────────────┴─────────────┐
                              │                           │
                        PRO USER                     FREE USER
                              │                           │
                              ▼                           ▼
                    ┌───────────────────┐      ┌───────────────────┐
                    │ Skip limit check  │      │ Check limit       │
                    │ Skip counter      │      │ current < limit?  │
                    │ increment         │      └─────────┬─────────┘
                    └─────────┬─────────┘                │
                              │                   ┌──────┴──────┐
                              │                   │             │
                              │              UNDER LIMIT    AT LIMIT
                              │                   │             │
                              │                   ▼             ▼
                              │         ┌─────────────┐  ┌─────────────┐
                              │         │ Insert      │  │ Throw Error │
                              │         │ recipe      │  │ LIMIT_REACHED│
                              │         └──────┬──────┘  └─────────────┘
                              │                │
                              │                ▼
                              │         ┌───────────────────┐
                              │         │ Increment counter │
                              │         │ (internal mutation)│
                              │         └─────────┬─────────┘
                              │                   │
                              └───────────────────┘
                                          │
                                          ▼
                                ┌───────────────────┐
                                │ Return recipeId   │
                                └───────────────────┘
```

#### What Happens When Limit Is Reached

**Frontend (Proactive Check):**
1. `canProceed` returns `false`
2. `UpgradeModal` is shown
3. Save operation is prevented
4. User sees current usage and limit

**Backend (Enforcement):**
1. Error is thrown with structured JSON:
   ```json
   {
     "type": "LIMIT_REACHED",
     "feature": "link_imports",
     "current": 100,
     "limit": 100,
     "message": "Du hast dein Limit von 100 Link-Imports erreicht."
   }
   ```
2. Frontend catches error and parses JSON
3. `UpgradeModal` is shown with error details

---

### 4.3 Frontend Display

#### ProfilePage Usage Bars

The ProfilePage shows three usage bars for free users:

```tsx
// Query all three limits (lines 34-36)
const manualLimit = useQuery(api.users.canCreateManualRecipe);
const linkLimit = useQuery(api.users.canImportFromLink);
const scanLimit = useQuery(api.users.canScanPhoto);

// Display in UsageRow components (lines 155-179)
<UsageRow
  label="Manuelle Rezepte"
  current={manualLimit?.current ?? 0}
  limit={manualLimit?.limit ?? 0}
  icon={BookOpen}
/>
<UsageRow
  label="IG / FB / Website Importe"
  current={linkLimit?.current ?? 0}
  limit={linkLimit?.limit ?? 0}
  icon={Link2}
/>
<UsageRow
  label="KI Foto-Scan"
  current={scanLimit?.current ?? 0}
  limit={scanLimit?.limit ?? 0}
  icon={Sparkles}
/>
```

#### Real-Time Updates

Usage stats update automatically via Convex's real-time subscriptions:
- When a recipe is created, `incrementUsageCounter` updates the user document
- All subscribed components receive the updated data
- ProfilePage and AddRecipeModal reflect changes immediately

---

## 5. Error Handling

### LIMIT_REACHED Error Type

The system uses a structured error format for limit errors:

```typescript
// Error structure (recipes.ts lines 393-400)
const errorData = {
  type: "LIMIT_REACHED",
  feature: featureType,
  current: currentCount,
  limit: limit,
  message: getLimitMessage(featureType, limit),
};
throw new Error(JSON.stringify(errorData));
```

### Error Catching Patterns

#### In AddRecipeModal (Proactive):

```typescript
// Check before attempting save
if (limitCheck && !limitCheck.canProceed) {
  setShowUpgradeModal({
    isOpen: true,
    feature: limitCheck.feature,
    current: limitCheck.current,
    limit: limitCheck.limit,
  });
  return; // Prevent save
}
```

#### In ShareTargetPage (Reactive):

```typescript
// Catch error from backend
try {
  const recipeId = await scrapePost({ url: postUrl });
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  
  try {
    const errorData = JSON.parse(msg);
    if (errorData.type === "LIMIT_REACHED") {
      setLimitData({
        feature: errorData.feature,
        current: errorData.current,
        limit: errorData.limit
      });
    }
  } catch {
    // Handle non-JSON errors
  }
}
```

### UpgradeModal Display Logic

```typescript
// In ShareTargetPage.tsx (lines 228-237)
<UpgradeModal 
  isOpen={!!limitData} 
  onClose={() => {
    setLimitData(null);
    handleClose();
  }}
  currentCount={limitData?.current}
  limit={limitData?.limit}
  feature={limitData?.feature}
/>
```

---

## 6. Making Changes

### 6.1 Changing Limit Values

**Only modify `convex/constants.ts`:**

```typescript
// convex/constants.ts
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,  // Change this value
  LINK_IMPORTS: 100,    // Change this value
  PHOTO_SCANS: 100,     // Change this value
} as const;
```

**Deployment Considerations:**
1. Changes take effect immediately after deployment
2. Existing usage counts are NOT reset
3. Users over the new limit will be blocked on next action
4. Consider communicating changes to affected users

**No other files need modification** - all limit values are imported from this file.

---

### 6.2 Adding New Limit Types

To add a new feature with usage limits:

#### Step 1: Add to Constants

```typescript
// convex/constants.ts
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,
  LINK_IMPORTS: 100,
  PHOTO_SCANS: 100,
  NEW_FEATURE: 50,  // Add new limit
} as const;
```

#### Step 2: Update Schema (if needed)

```typescript
// convex/schema.ts - Add to usageStats
usageStats: v.object({
  // ... existing fields
  newFeature: v.optional(v.number()),  // Add counter
}),
```

#### Step 3: Add Query in users.ts

```typescript
// convex/users.ts
export const canUseNewFeature = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { canProceed: false, error: "NOT_AUTHENTICATED" };

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return { canProceed: false, error: "NOT_AUTHENTICATED" };

    if (user.subscription !== "free") {
      return { canProceed: true, isPro: true, subscription: user.subscription };
    }

    const current = user.usageStats?.newFeature || 0;
    const limit = FREE_LIMITS.NEW_FEATURE;

    return {
      canProceed: current < limit,
      isPro: false,
      subscription: "free" as const,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      feature: "new_feature" as const,
    };
  },
});
```

#### Step 4: Update incrementUsageCounter

```typescript
// convex/users.ts - Add case to switch statement
switch (args.feature) {
  case "manual_recipes":
    // ... existing
  case "link_imports":
    // ... existing
  case "photo_scans":
    // ... existing
  case "new_feature":  // Add new case
    updates.usageStats = {
      ...currentStats,
      newFeature: (currentStats.newFeature || 0) + 1,
    };
    break;
}
```

#### Step 5: Enforce in recipes.ts (or relevant file)

```typescript
// Determine feature type
if (isNewFeatureCondition) {
  featureType = "new_feature";
}

// Add to switch for limit check
switch (featureType) {
  case "new_feature":
    currentCount = stats.newFeature || 0;
    limit = FREE_LIMITS.NEW_FEATURE;
    break;
}
```

#### Step 6: Add Frontend Check

```typescript
// In relevant component
const canUseNewFeature = useQuery(api.users.canUseNewFeature);

// Before action
if (!canUseNewFeature?.canProceed) {
  setShowUpgradeModal({
    isOpen: true,
    feature: 'new_feature',
    current: canUseNewFeature?.current ?? 0,
    limit: canUseNewFeature?.limit ?? 0,
  });
  return;
}
```

#### Step 7: Update UpgradeModal

```typescript
// components/UpgradeModal.tsx - Add to config
const config = {
  // ... existing
  new_feature: {
    title: 'Feature Limit erreicht',
    icon: 'new_icon',
    description: `Du hast dein Limit von ${limit} Features erreicht.`,
    highlight: 'Nutze unbegrenzte Features mit Pro.'
  }
}[feature];
```

#### Testing Checklist

- [ ] Query returns correct values for free users
- [ ] Query returns `canProceed: true` for Pro users
- [ ] Counter increments after successful operation
- [ ] Counter does NOT increment on failed operation
- [ ] Limit error is thrown when limit reached
- [ ] UpgradeModal shows correct feature info
- [ ] ProfilePage displays new usage bar (if applicable)
- [ ] Pro users bypass limit checks

---

## 7. Pro/Paid Users (Future)

### Current Implementation

Pro users are identified by `subscription !== "free"`:

```typescript
// In all limit check queries
if (user.subscription !== "free") {
  return {
    canProceed: true,
    isPro: true,
    subscription: user.subscription,
  };
}
```

### Extension Points for Paid Tiers

#### Tiered Limits

```typescript
// convex/constants.ts - Future structure
export const LIMITS = {
  free: {
    MANUAL_RECIPES: 100,
    LINK_IMPORTS: 100,
    PHOTO_SCANS: 100,
  },
  pro_monthly: {
    MANUAL_RECIPES: Infinity,
    LINK_IMPORTS: Infinity,
    PHOTO_SCANS: Infinity,
  },
  pro_yearly: {
    MANUAL_RECIPES: Infinity,
    LINK_IMPORTS: Infinity,
    PHOTO_SCANS: Infinity,
  },
};
```

#### Subscription Logic Location

Add subscription-specific logic in:

1. **`users.ts` queries** - Return different limits per tier
2. **`recipes.ts` enforcement** - Check tier-specific limits
3. **`stripe.ts`** - Handle tier changes and counter resets

#### Counter Reset on Upgrade/Downgrade

```typescript
// convex/users.ts - Already implemented
export const resetUsageCounters = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // Reset all counters to 0
    // Called on Pro→Free downgrade
  },
});
```

---

## 8. Troubleshooting

### Common Issues

#### Issue: Counter not incrementing

**Symptoms:** Usage count stays at 0 after creating recipes

**Possible Causes:**
1. User is Pro (counters don't increment for Pro users)
2. Recipe creation failed before counter increment
3. `incrementUsageCounter` not being called

**Debug Steps:**
```typescript
// Add logging in recipes.ts create mutation
console.log('[DEBUG] Feature type:', featureType);
console.log('[DEBUG] User subscription:', user.subscription);

// After insert
console.log('[DEBUG] Recipe created, incrementing counter');
await ctx.runMutation(internal.users.incrementUsageCounter, {
  clerkId,
  feature: featureType,
});
console.log('[DEBUG] Counter incremented');
```

---

#### Issue: Limit reached error not showing UpgradeModal

**Symptoms:** Error appears in console but no modal shown

**Possible Causes:**
1. Error not being parsed correctly
2. `limitData` state not being set
3. UpgradeModal not receiving `isOpen` prop

**Debug Steps:**
```typescript
// In error catch block
console.log('[DEBUG] Raw error:', err);
console.log('[DEBUG] Error message:', msg);

try {
  const errorData = JSON.parse(msg);
  console.log('[DEBUG] Parsed error:', errorData);
  console.log('[DEBUG] Error type:', errorData.type);
} catch (e) {
  console.log('[DEBUG] Failed to parse error JSON');
}
```

---

#### Issue: Usage shows 0/0 in ProfilePage

**Symptoms:** Usage bars show "0 / 0" instead of actual values

**Possible Causes:**
1. Query not returning data
2. User document missing `usageStats`
3. Query still loading

**Debug Steps:**
```typescript
// In ProfilePage
console.log('[DEBUG] manualLimit:', manualLimit);
console.log('[DEBUG] linkLimit:', linkLimit);
console.log('[DEBUG] scanLimit:', scanLimit);
console.log('[DEBUG] currentUser:', currentUser);
```

---

#### Issue: Pro user still seeing limits

**Symptoms:** Pro user sees usage bars or gets limit errors

**Possible Causes:**
1. `subscription` field not updated
2. Query checking wrong field
3. Caching issue

**Debug Steps:**
```typescript
// Check user document in Convex dashboard
// Verify subscription field value

// In query handler
console.log('[DEBUG] User subscription:', user.subscription);
console.log('[DEBUG] Is Pro?', user.subscription !== "free");
```

---

### Debug Tips

#### 1. Check Convex Dashboard

- View user documents to verify `usageStats` values
- Check `subscription` field for correct tier
- Monitor function logs for errors

#### 2. Add Logging

```typescript
// In users.ts queries
console.log('[Limit Check] User:', user.clerkId);
console.log('[Limit Check] Subscription:', user.subscription);
console.log('[Limit Check] Current:', current);
console.log('[Limit Check] Limit:', limit);
console.log('[Limit Check] Can proceed:', current < limit);
```

#### 3. Test Limit Enforcement

```typescript
// Temporarily set low limit for testing
export const FREE_LIMITS = {
  MANUAL_RECIPES: 2,  // Easy to reach for testing
  LINK_IMPORTS: 2,
  PHOTO_SCANS: 2,
} as const;
```

#### 4. Verify Counter Increment

```typescript
// In incrementUsageCounter
console.log('[Increment] Before:', user.usageStats);
// ... perform update
console.log('[Increment] After:', updates.usageStats);
```

---

### How to Verify Limits Are Working

#### Manual Test Checklist

1. **Create manual recipe as free user:**
   - [ ] Counter increments
   - [ ] ProfilePage updates
   - [ ] Can create until limit reached
   - [ ] UpgradeModal shows at limit

2. **Import from URL as free user:**
   - [ ] Counter increments
   - [ ] Correct feature type (`link_imports`)
   - [ ] Limit enforced

3. **AI photo scan as free user:**
   - [ ] Counter increments
   - [ ] Correct feature type (`photo_scans`)
   - [ ] Limit enforced

4. **Pro user operations:**
   - [ ] No counters increment
   - [ ] No limits enforced
   - [ ] ProfilePage shows Pro status

5. **Error handling:**
   - [ ] LIMIT_REACHED error parsed correctly
   - [ ] UpgradeModal shows with correct info
   - [ ] User can navigate to subscription page

---

## Summary

The usage limits system provides:

- **Single source of truth** in `convex/constants.ts`
- **Proactive frontend checks** via `users.ts` queries
- **Backend enforcement** in `recipes.ts` mutations
- **Real-time updates** via Convex subscriptions
- **Clear user feedback** through UpgradeModal
- **Pro user bypass** for all limits

When making changes, always:
1. Modify only `constants.ts` for limit values
2. Follow the established patterns for new features
3. Test both free and Pro user flows
4. Verify counter increments only on success

This document provides a comprehensive overview of the usage limits system in Cookly, a multi-tenant SaaS recipe application.

## 1. Overview

### Purpose

The usage limits system ensures fair resource allocation across free-tier users while providing incentives to upgrade to paid plans. It prevents abuse and helps manage infrastructure costs for expensive operations like AI photo scanning and external API calls.

### Features with Limits

| Feature | Limit Type | Description |
|---------|-----------|-------------|
| Manual Recipes | `manual_recipes` | Recipes created manually through the form |
| Link Imports | `link_imports` | Recipes imported from Instagram, Facebook, or website URLs |
| Photo Scans | `photo_scans` | Recipes created via AI photo analysis |

### Current Limit Values (Free Tier)

All limits are defined in [`convex/constants.ts`](../convex/constants.ts:6):

```typescript
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,
  LINK_IMPORTS: 100,
  PHOTO_SCANS: 100,
} as const;
```

**Note:** These are lifetime limits for free users, not monthly resets.

---

## 2. Architecture

### Single Source of Truth

All limit values are defined in one place: **`convex/constants.ts`**

This ensures:
- Consistency between frontend display and backend enforcement
- Easy modification without touching multiple files
- Type safety via TypeScript `as const`

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USAGE LIMITS FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  constants.ts    │     │    users.ts      │     │   recipes.ts     │
│  (Limit Values)  │────▶│  (Queries for    │     │  (Enforcement)   │
│                  │     │   limit checks)  │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
         │                        │                        │
         │                        ▼                        │
         │              ┌──────────────────┐              │
         │              │   ProfilePage    │              │
         │              │   (Display to    │              │
         │              │    users)        │              │
         │              └──────────────────┘              │
         │                                                │
         └────────────────────────────────────────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │  usageStats in users     │
              │  table (Counter Storage) │
              └──────────────────────────┘
```

### Key Principle: Check-Before-Create

The system follows a **proactive check** pattern:
1. Frontend queries limit status before showing the action UI
2. Frontend can show upgrade modal proactively
3. Backend enforces limits as a safety net during creation

---

## 3. Key Files

### [`convex/constants.ts`](../convex/constants.ts:1)

**Role:** Single source of truth for all limit values.

```typescript
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,
  LINK_IMPORTS: 100,
  PHOTO_SCANS: 100,
} as const;

export type FreeLimitType = keyof typeof FREE_LIMITS;
```

**Important:** Never hardcode limit values elsewhere. Always import from this file.

---

### [`convex/users.ts`](../convex/users.ts:1)

**Role:** Provides queries for limit checking and mutations for counter management.

#### Key Queries:

| Query | Lines | Purpose |
|-------|-------|---------|
| [`canCreateManualRecipe`](../convex/users.ts:33) | 33-72 | Check if user can create manual recipes |
| [`canImportFromLink`](../convex/users.ts:78) | 78-117 | Check if user can import from URLs |
| [`canScanPhoto`](../convex/users.ts:123) | 123-162 | Check if user can use AI photo scan |
| [`getUsageStats`](../convex/users.ts:167) | 167-192 | Legacy query for ProfilePage compatibility |

#### Key Mutations:

| Mutation | Lines | Purpose |
|----------|-------|---------|
| [`incrementUsageCounter`](../convex/users.ts:432) | 432-492 | Increment counter after successful recipe creation |
| [`resetUsageCounters`](../convex/users.ts:498) | 498+ | Reset counters on Pro→Free downgrade |

#### Return Type Structure:

```typescript
// All canXxx queries return this structure:
{
  canProceed: boolean;      // Whether the action is allowed
  isPro: boolean;           // Whether user has paid subscription
  subscription: "free" | "pro_monthly" | "pro_yearly";
  current: number;          // Current usage count (free users only)
  limit: number;            // Limit value (free users only)
  remaining: number;        // Remaining uses (free users only)
  feature: "manual_recipes" | "link_imports" | "photo_scans";
}
```

---

### [`convex/recipes.ts`](../convex/recipes.ts:1)

**Role:** Enforces limits during recipe creation.

#### Key Function: [`create`](../convex/recipes.ts:288) mutation (lines 288-430)

The create mutation follows this flow:

```typescript
// 1. Determine feature type (lines 325-336)
let featureType: "manual_recipes" | "link_imports" | "photo_scans";

if (args.sourceUrl) {
  featureType = "link_imports";      // URL import
} else if (args.sourceImageUrl) {
  featureType = "photo_scans";       // Photo scan
} else {
  featureType = "manual_recipes";    // Manual entry
}

// 2. Check subscription status (lines 352-359)
if (user.subscription !== "free") {
  // Pro users: No limits, skip counter increment
  return await insertRecipe(ctx, clerkId, args);
}

// 3. Check limit for free users (lines 364-401)
if (currentCount >= limit) {
  const errorData = {
    type: "LIMIT_REACHED",
    feature: featureType,
    current: currentCount,
    limit: limit,
    message: getLimitMessage(featureType, limit),
  };
  throw new Error(JSON.stringify(errorData));
}

// 4. Create recipe, then increment counter (lines 406-428)
const recipeId = await insertRecipe(ctx, clerkId, args);
await ctx.runMutation(internal.users.incrementUsageCounter, {
  clerkId,
  feature: featureType,
});
```

---

### [`convex/schema.ts`](../convex/schema.ts:34)

**Role:** Defines the database schema for usage statistics.

```typescript
usageStats: v.object({
  // Separate counters for each feature type
  manualRecipes: v.optional(v.number()),      // Manual recipes count
  linkImports: v.optional(v.number()),        // URL imports count
  photoScans: v.optional(v.number()),         // AI photo scans count

  // Subscription tracking
  subscriptionStartDate: v.optional(v.number()),
  subscriptionEndDate: v.optional(v.number()),
  resetOnDowngrade: v.optional(v.boolean()),

  // Deprecated fields (for migration compatibility)
  importedRecipes: v.optional(v.number()),
  importsLastReset: v.optional(v.number()),
  weeklyPlansActive: v.optional(v.number()),
}),
```

---

### [`pages/ProfilePage.tsx`](../pages/ProfilePage.tsx:1)

**Role:** Displays usage statistics to users.

#### Query Usage (lines 34-36):

```typescript
const manualLimit = useQuery(api.users.canCreateManualRecipe);
const linkLimit = useQuery(api.users.canImportFromLink);
const scanLimit = useQuery(api.users.canScanPhoto);
```

#### Usage Display Component (lines 301-335):

```typescript
const UsageRow = ({ icon: Icon, label, current, limit }) => {
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isFull = percentage >= 100 && limit > 0;

  return (
    <div className="space-y-3 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={isFull ? "text-destructive" : "text-primary"} />
          <span className="font-bold">{label}</span>
        </div>
        <span className={isFull ? "text-destructive" : "text-secondary"}>
          {current} / {limit}
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-5 w-full bg-card rounded-xl overflow-hidden">
        <div
          className={isFull ? "bg-destructive" : "bg-primary"}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
```

---

### [`components/UpgradeModal.tsx`](../components/UpgradeModal.tsx:1)

**Role:** Displays upgrade prompt when limits are reached.

#### Props Interface (lines 3-9):

```typescript
interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount?: number;
  limit?: number;
  feature?: 'manual_recipes' | 'link_imports' | 'photo_scans';
}
```

#### Feature-Specific Messaging (lines 27-46):

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

---

### [`components/AddRecipeModal.tsx`](../components/AddRecipeModal.tsx:1)

**Role:** Performs proactive limit checks before recipe creation.

#### Limit Check Queries (lines 35-37):

```typescript
const canCreateManual = useQuery(api.users.canCreateManualRecipe);
const canImportLink = useQuery(api.users.canImportFromLink);
const canScanPhoto = useQuery(api.users.canScanPhoto);
```

#### Proactive Check in handleSave (lines 625-659):

```typescript
const handleSave = async () => {
  // Only check for new recipes (not edits)
  if (!initialData) {
    let limitCheck;

    // Determine feature type
    if (formData.sourceUrl) {
      limitCheck = canImportLink;      // URL import
    } else if (activeTab === 'ai') {
      limitCheck = canScanPhoto;       // AI photo scan
    } else {
      limitCheck = canCreateManual;    // Manual recipe
    }

    // Show upgrade modal if limit reached
    if (limitCheck && !limitCheck.canProceed) {
      setShowUpgradeModal({
        isOpen: true,
        feature: limitCheck.feature,
        current: limitCheck.current,
        limit: limitCheck.limit,
      });
      setIsSaving(false);
      return; // Prevent save
    }
  }
  // ... continue with save
};
```

---

### [`pages/ShareTargetPage.tsx`](../pages/ShareTargetPage.tsx:1)

**Role:** Handles share intent imports with limit error handling.

#### Error Handling (lines 154-192):

```typescript
try {
  const recipeId = await scrapePost({ url: postUrl });
  // ... success handling
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);

  // Parse structured error JSON
  try {
    const errorData = JSON.parse(msg);

    if (errorData.type === "LIMIT_REACHED") {
      setLimitData({
        feature: errorData.feature || 'link_imports',
        current: errorData.current || 0,
        limit: errorData.limit || 50
      });
      setStatus('error');
    } else if (errorData.type === "RATE_LIMIT_EXCEEDED") {
      setError("Du hast zu viele Anfragen gestellt. Bitte warte einen Moment.");
      setStatus('error');
    }
    // ... other error types
  } catch {
    // Fallback for non-JSON errors
    if (msg.includes("No data found")) {
      setError("Kein Rezept gefunden 😕");
    }
    // ... other fallback cases
  }
}
```

---

## 4. How It Works

### 4.1 Usage Tracking

#### Storage Location

Usage counters are stored in the `users` table within the `usageStats` object:

```typescript
// User document structure
{
  _id: Id<"users">,
  clerkId: string,
  subscription: "free" | "pro_monthly" | "pro_yearly",
  usageStats: {
    manualRecipes: 45,      // 45 manual recipes created
    linkImports: 12,        // 12 link imports
    photoScans: 3,          // 3 photo scans
    // ... other fields
  }
}
```

#### Counter Increment Flow

1. **Recipe creation initiated** in `recipes.ts` `create` mutation
2. **Limit check passed** (user is under limit or is Pro)
3. **Recipe inserted** into database
4. **Counter incremented** via `internal.users.incrementUsageCounter`

```typescript
// In recipes.ts create mutation (lines 406-415)
try {
  const recipeId = await insertRecipe(ctx, clerkId, args);

  // ONLY increment after successful insert!
  await ctx.runMutation(internal.users.incrementUsageCounter, {
    clerkId,
    feature: featureType,
  });

  return recipeId;
} catch (error) {
  // Insert failed -> Counter NOT incremented (correct!)
  throw error;
}
```

**Critical:** Counter increment happens AFTER successful recipe insert to prevent count drift.

#### When Counters Are Checked

| Scenario | When Check Occurs | Where |
|----------|-------------------|-------|
| Profile Page | On page load | `ProfilePage.tsx` via `useQuery` |
| Add Recipe Modal | On save button click | `AddRecipeModal.tsx` `handleSave` |
| Share Import | During import action | `recipes.ts` `create` mutation |
| AI Photo Scan | On scan initiation | `AddRecipeModal.tsx` `handleSingleImageUpload` |

---

### 4.2 Limit Enforcement Flow

#### Step-by-Step Flow (Recipe Creation)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RECIPE CREATION FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

User clicks "Save"
        │
        ▼
┌───────────────────┐
│ AddRecipeModal    │
│ handleSave()      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     NO LIMIT REACHED
│ Proactive Check   │────────────────────────┐
│ (Frontend)        │                        │
│ canCreateXxx?     │                        │
└─────────┬─────────┘                        │
          │                                  │
   LIMIT  │                                  │
   REACHED │                                  ▼
          │                        ┌───────────────────┐
          ▼                        │ createRecipe()    │
┌───────────────────┐              │ mutation called   │
│ Show UpgradeModal │              └─────────┬─────────┘
│ (Prevent save)    │                        │
└───────────────────┘                        ▼
                                  ┌───────────────────┐
                                  │ recipes.ts        │
                                  │ create mutation   │
                                  └─────────┬─────────┘
                                            │
                                            ▼
                                  ┌───────────────────┐
                                  │ Determine         │
                                  │ featureType       │
                                  │ (manual/link/scan)│
                                  └─────────┬─────────┘
                                            │
                                            ▼
                                  ┌───────────────────┐
                                  │ Check             │
                                  │ subscription      │
                                  └─────────┬─────────┘
                                            │
                              ┌─────────────┴─────────────┐
                              │                           │
                        PRO USER                     FREE USER
                              │                           │
                              ▼                           ▼
                    ┌───────────────────┐      ┌───────────────────┐
                    │ Skip limit check  │      │ Check limit       │
                    │ Skip counter      │      │ current < limit?  │
                    │ increment         │      └─────────┬─────────┘
                    └─────────┬─────────┘                │
                              │                   ┌──────┴──────┐
                              │                   │             │
                              │              UNDER LIMIT    AT LIMIT
                              │                   │             │
                              │                   ▼             ▼
                              │         ┌─────────────┐  ┌─────────────┐
                              │         │ Insert      │  │ Throw Error │
                              │         │ recipe      │  │ LIMIT_REACHED│
                              │         └──────┬──────┘  └─────────────┘
                              │                │
                              │                ▼
                              │         ┌───────────────────┐
                              │         │ Increment counter │
                              │         │ (internal mutation)│
                              │         └─────────┬─────────┘
                              │                   │
                              └───────────────────┘
                                          │
                                          ▼
                                ┌───────────────────┐
                                │ Return recipeId   │
                                └───────────────────┘
```

#### What Happens When Limit Is Reached

**Frontend (Proactive Check):**
1. `canProceed` returns `false`
2. `UpgradeModal` is shown
3. Save operation is prevented
4. User sees current usage and limit

**Backend (Enforcement):**
1. Error is thrown with structured JSON:
   ```json
   {
     "type": "LIMIT_REACHED",
     "feature": "link_imports",
     "current": 100,
     "limit": 100,
     "message": "Du hast dein Limit von 100 Link-Imports erreicht."
   }
   ```
2. Frontend catches error and parses JSON
3. `UpgradeModal` is shown with error details

---

### 4.3 Frontend Display

#### ProfilePage Usage Bars

The ProfilePage shows three usage bars for free users:

```tsx
// Query all three limits (lines 34-36)
const manualLimit = useQuery(api.users.canCreateManualRecipe);
const linkLimit = useQuery(api.users.canImportFromLink);
const scanLimit = useQuery(api.users.canScanPhoto);

// Display in UsageRow components (lines 155-179)
<UsageRow
  label="Manuelle Rezepte"
  current={manualLimit?.current ?? 0}
  limit={manualLimit?.limit ?? 0}
  icon={BookOpen}
/>
<UsageRow
  label="IG / FB / Website Importe"
  current={linkLimit?.current ?? 0}
  limit={linkLimit?.limit ?? 0}
  icon={Link2}
/>
<UsageRow
  label="KI Foto-Scan"
  current={scanLimit?.current ?? 0}
  limit={scanLimit?.limit ?? 0}
  icon={Sparkles}
/>
```

#### Real-Time Updates

Usage stats update automatically via Convex's real-time subscriptions:
- When a recipe is created, `incrementUsageCounter` updates the user document
- All subscribed components receive the updated data
- ProfilePage and AddRecipeModal reflect changes immediately

---

## 5. Error Handling

### LIMIT_REACHED Error Type

The system uses a structured error format for limit errors:

```typescript
// Error structure (recipes.ts lines 393-400)
const errorData = {
  type: "LIMIT_REACHED",
  feature: featureType,
  current: currentCount,
  limit: limit,
  message: getLimitMessage(featureType, limit),
};
throw new Error(JSON.stringify(errorData));
```

### Error Catching Patterns

#### In AddRecipeModal (Proactive):

```typescript
// Check before attempting save
if (limitCheck && !limitCheck.canProceed) {
  setShowUpgradeModal({
    isOpen: true,
    feature: limitCheck.feature,
    current: limitCheck.current,
    limit: limitCheck.limit,
  });
  return; // Prevent save
}
```

#### In ShareTargetPage (Reactive):

```typescript
// Catch error from backend
try {
  const recipeId = await scrapePost({ url: postUrl });
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  
  try {
    const errorData = JSON.parse(msg);
    if (errorData.type === "LIMIT_REACHED") {
      setLimitData({
        feature: errorData.feature,
        current: errorData.current,
        limit: errorData.limit
      });
    }
  } catch {
    // Handle non-JSON errors
  }
}
```

### UpgradeModal Display Logic

```typescript
// In ShareTargetPage.tsx (lines 228-237)
<UpgradeModal 
  isOpen={!!limitData} 
  onClose={() => {
    setLimitData(null);
    handleClose();
  }}
  currentCount={limitData?.current}
  limit={limitData?.limit}
  feature={limitData?.feature}
/>
```

---

## 6. Making Changes

### 6.1 Changing Limit Values

**Only modify `convex/constants.ts`:**

```typescript
// convex/constants.ts
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,  // Change this value
  LINK_IMPORTS: 100,    // Change this value
  PHOTO_SCANS: 100,     // Change this value
} as const;
```

**Deployment Considerations:**
1. Changes take effect immediately after deployment
2. Existing usage counts are NOT reset
3. Users over the new limit will be blocked on next action
4. Consider communicating changes to affected users

**No other files need modification** - all limit values are imported from this file.

---

### 6.2 Adding New Limit Types

To add a new feature with usage limits:

#### Step 1: Add to Constants

```typescript
// convex/constants.ts
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,
  LINK_IMPORTS: 100,
  PHOTO_SCANS: 100,
  NEW_FEATURE: 50,  // Add new limit
} as const;
```

#### Step 2: Update Schema (if needed)

```typescript
// convex/schema.ts - Add to usageStats
usageStats: v.object({
  // ... existing fields
  newFeature: v.optional(v.number()),  // Add counter
}),
```

#### Step 3: Add Query in users.ts

```typescript
// convex/users.ts
export const canUseNewFeature = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { canProceed: false, error: "NOT_AUTHENTICATED" };

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) return { canProceed: false, error: "NOT_AUTHENTICATED" };

    if (user.subscription !== "free") {
      return { canProceed: true, isPro: true, subscription: user.subscription };
    }

    const current = user.usageStats?.newFeature || 0;
    const limit = FREE_LIMITS.NEW_FEATURE;

    return {
      canProceed: current < limit,
      isPro: false,
      subscription: "free" as const,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      feature: "new_feature" as const,
    };
  },
});
```

#### Step 4: Update incrementUsageCounter

```typescript
// convex/users.ts - Add case to switch statement
switch (args.feature) {
  case "manual_recipes":
    // ... existing
  case "link_imports":
    // ... existing
  case "photo_scans":
    // ... existing
  case "new_feature":  // Add new case
    updates.usageStats = {
      ...currentStats,
      newFeature: (currentStats.newFeature || 0) + 1,
    };
    break;
}
```

#### Step 5: Enforce in recipes.ts (or relevant file)

```typescript
// Determine feature type
if (isNewFeatureCondition) {
  featureType = "new_feature";
}

// Add to switch for limit check
switch (featureType) {
  case "new_feature":
    currentCount = stats.newFeature || 0;
    limit = FREE_LIMITS.NEW_FEATURE;
    break;
}
```

#### Step 6: Add Frontend Check

```typescript
// In relevant component
const canUseNewFeature = useQuery(api.users.canUseNewFeature);

// Before action
if (!canUseNewFeature?.canProceed) {
  setShowUpgradeModal({
    isOpen: true,
    feature: 'new_feature',
    current: canUseNewFeature?.current ?? 0,
    limit: canUseNewFeature?.limit ?? 0,
  });
  return;
}
```

#### Step 7: Update UpgradeModal

```typescript
// components/UpgradeModal.tsx - Add to config
const config = {
  // ... existing
  new_feature: {
    title: 'Feature Limit erreicht',
    icon: 'new_icon',
    description: `Du hast dein Limit von ${limit} Features erreicht.`,
    highlight: 'Nutze unbegrenzte Features mit Pro.'
  }
}[feature];
```

#### Testing Checklist

- [ ] Query returns correct values for free users
- [ ] Query returns `canProceed: true` for Pro users
- [ ] Counter increments after successful operation
- [ ] Counter does NOT increment on failed operation
- [ ] Limit error is thrown when limit reached
- [ ] UpgradeModal shows correct feature info
- [ ] ProfilePage displays new usage bar (if applicable)
- [ ] Pro users bypass limit checks

---

## 7. Pro/Paid Users (Future)

### Current Implementation

Pro users are identified by `subscription !== "free"`:

```typescript
// In all limit check queries
if (user.subscription !== "free") {
  return {
    canProceed: true,
    isPro: true,
    subscription: user.subscription,
  };
}
```

### Extension Points for Paid Tiers

#### Tiered Limits

```typescript
// convex/constants.ts - Future structure
export const LIMITS = {
  free: {
    MANUAL_RECIPES: 100,
    LINK_IMPORTS: 100,
    PHOTO_SCANS: 100,
  },
  pro_monthly: {
    MANUAL_RECIPES: Infinity,
    LINK_IMPORTS: Infinity,
    PHOTO_SCANS: Infinity,
  },
  pro_yearly: {
    MANUAL_RECIPES: Infinity,
    LINK_IMPORTS: Infinity,
    PHOTO_SCANS: Infinity,
  },
};
```

#### Subscription Logic Location

Add subscription-specific logic in:

1. **`users.ts` queries** - Return different limits per tier
2. **`recipes.ts` enforcement** - Check tier-specific limits
3. **`stripe.ts`** - Handle tier changes and counter resets

#### Counter Reset on Upgrade/Downgrade

```typescript
// convex/users.ts - Already implemented
export const resetUsageCounters = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // Reset all counters to 0
    // Called on Pro→Free downgrade
  },
});
```

---

## 8. Troubleshooting

### Common Issues

#### Issue: Counter not incrementing

**Symptoms:** Usage count stays at 0 after creating recipes

**Possible Causes:**
1. User is Pro (counters don't increment for Pro users)
2. Recipe creation failed before counter increment
3. `incrementUsageCounter` not being called

**Debug Steps:**
```typescript
// Add logging in recipes.ts create mutation
console.log('[DEBUG] Feature type:', featureType);
console.log('[DEBUG] User subscription:', user.subscription);

// After insert
console.log('[DEBUG] Recipe created, incrementing counter');
await ctx.runMutation(internal.users.incrementUsageCounter, {
  clerkId,
  feature: featureType,
});
console.log('[DEBUG] Counter incremented');
```

---

#### Issue: Limit reached error not showing UpgradeModal

**Symptoms:** Error appears in console but no modal shown

**Possible Causes:**
1. Error not being parsed correctly
2. `limitData` state not being set
3. UpgradeModal not receiving `isOpen` prop

**Debug Steps:**
```typescript
// In error catch block
console.log('[DEBUG] Raw error:', err);
console.log('[DEBUG] Error message:', msg);

try {
  const errorData = JSON.parse(msg);
  console.log('[DEBUG] Parsed error:', errorData);
  console.log('[DEBUG] Error type:', errorData.type);
} catch (e) {
  console.log('[DEBUG] Failed to parse error JSON');
}
```

---

#### Issue: Usage shows 0/0 in ProfilePage

**Symptoms:** Usage bars show "0 / 0" instead of actual values

**Possible Causes:**
1. Query not returning data
2. User document missing `usageStats`
3. Query still loading

**Debug Steps:**
```typescript
// In ProfilePage
console.log('[DEBUG] manualLimit:', manualLimit);
console.log('[DEBUG] linkLimit:', linkLimit);
console.log('[DEBUG] scanLimit:', scanLimit);
console.log('[DEBUG] currentUser:', currentUser);
```

---

#### Issue: Pro user still seeing limits

**Symptoms:** Pro user sees usage bars or gets limit errors

**Possible Causes:**
1. `subscription` field not updated
2. Query checking wrong field
3. Caching issue

**Debug Steps:**
```typescript
// Check user document in Convex dashboard
// Verify subscription field value

// In query handler
console.log('[DEBUG] User subscription:', user.subscription);
console.log('[DEBUG] Is Pro?', user.subscription !== "free");
```

---

### Debug Tips

#### 1. Check Convex Dashboard

- View user documents to verify `usageStats` values
- Check `subscription` field for correct tier
- Monitor function logs for errors

#### 2. Add Logging

```typescript
// In users.ts queries
console.log('[Limit Check] User:', user.clerkId);
console.log('[Limit Check] Subscription:', user.subscription);
console.log('[Limit Check] Current:', current);
console.log('[Limit Check] Limit:', limit);
console.log('[Limit Check] Can proceed:', current < limit);
```

#### 3. Test Limit Enforcement

```typescript
// Temporarily set low limit for testing
export const FREE_LIMITS = {
  MANUAL_RECIPES: 2,  // Easy to reach for testing
  LINK_IMPORTS: 2,
  PHOTO_SCANS: 2,
} as const;
```

#### 4. Verify Counter Increment

```typescript
// In incrementUsageCounter
console.log('[Increment] Before:', user.usageStats);
// ... perform update
console.log('[Increment] After:', updates.usageStats);
```

---

### How to Verify Limits Are Working

#### Manual Test Checklist

1. **Create manual recipe as free user:**
   - [ ] Counter increments
   - [ ] ProfilePage updates
   - [ ] Can create until limit reached
   - [ ] UpgradeModal shows at limit

2. **Import from URL as free user:**
   - [ ] Counter increments
   - [ ] Correct feature type (`link_imports`)
   - [ ] Limit enforced

3. **AI photo scan as free user:**
   - [ ] Counter increments
   - [ ] Correct feature type (`photo_scans`)
   - [ ] Limit enforced

4. **Pro user operations:**
   - [ ] No counters increment
   - [ ] No limits enforced
   - [ ] ProfilePage shows Pro status

5. **Error handling:**
   - [ ] LIMIT_REACHED error parsed correctly
   - [ ] UpgradeModal shows with correct info
   - [ ] User can navigate to subscription page

---

## Summary

The usage limits system provides:

- **Single source of truth** in `convex/constants.ts`
- **Proactive frontend checks** via `users.ts` queries
- **Backend enforcement** in `recipes.ts` mutations
- **Real-time updates** via Convex subscriptions
- **Clear user feedback** through UpgradeModal
- **Pro user bypass** for all limits

When making changes, always:
1. Modify only `constants.ts` for limit values
2. Follow the established patterns for new features
3. Test both free and Pro user flows
4. Verify counter increments only on success

