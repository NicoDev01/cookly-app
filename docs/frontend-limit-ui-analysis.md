# Frontend Rate Limit Display & Limit Reached UI Analysis

## Executive Summary

The frontend already has a **complete and well-designed limit reached UI system** using the `UpgradeModal` component. The issue is **NOT a missing UI component** - it's a **desynchronization between frontend and backend limit values**.

---

## 1. Profile Page - Usage Stats Display

### Location
**File:** [`pages/ProfilePage.tsx`](pages/ProfilePage.tsx)

### How Usage Data is Fetched

The profile page uses three separate Convex queries to fetch limit information:

```typescript
// Lines 33-36
const manualLimit = useQuery(api.users.canCreateManualRecipe);
const linkLimit = useQuery(api.users.canImportFromLink);
const scanLimit = useQuery(api.users.canScanPhoto);
```

### How Usage is Displayed

The data is displayed using the `UsageRow` component (lines 301-334):

```typescript
<UsageRow
  label="Manuelle Rezepte"
  current={manualLimit?.current ?? 0}
  limit={manualLimit?.limit ?? 0}  // Sync with backend
  icon={BookOpen}
/>
```

**Key Features:**
- Shows current usage vs limit (e.g., "50 / 100")
- Progress bar with visual feedback
- Red styling when limit is reached (`isFull` state)
- Shimmer animation on the progress bar

### Data Flow Diagram

```
ProfilePage.tsx
       │
       ├── useQuery(api.users.canCreateManualRecipe)
       ├── useQuery(api.users.canImportFromLink)
       └── useQuery(api.users.canScanPhoto)
              │
              ▼
       convex/users.ts (FREE_LIMITS constant)
              │
              ▼
       Returns: { canProceed, current, limit, feature, remaining }
              │
              ▼
       UsageRow component displays: current / limit
```

---

## 2. UpgradeModal Component Analysis

### Location
**File:** [`components/UpgradeModal.tsx`](components/UpgradeModal.tsx)

### Purpose
A polished modal that shows when users hit their free tier limit, encouraging upgrade to Pro.

### Props Interface

```typescript
interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount?: number;
  limit?: number;
  feature?: 'manual_recipes' | 'link_imports' | 'photo_scans';
}
```

### Features

1. **Feature-specific messaging** (lines 27-46):
   - `manual_recipes`: "Rezept Limit erreicht"
   - `link_imports`: "Import Limit erreicht"
   - `photo_scans`: "Scan Limit erreicht"

2. **Dynamic limit display**: Shows the actual limit in the description

3. **Pro benefits list**:
   - Unlimited recipes & scans
   - Enhanced AI analysis
   - Sync across devices

4. **Call to action**: Button to navigate to subscribe page

### Visual Design
- Glassmorphism style with backdrop blur
- Gradient icon container
- Glow effect
- Smooth animations (fade-in, zoom-in, slide-in)

---

## 3. LIMIT_REACHED Error Handling

### 3.1 AddRecipeModal - Complete Implementation

**File:** [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx)

#### Proactive Limit Check (Before Save)

Lines 633-658 show the **proactive check** before attempting to save:

```typescript
if (!initialData) { // Only check for new recipes
  let limitCheck;
  
  if (formData.sourceUrl) {
    limitCheck = canImportLink;      // URL Import
  } else if (activeTab === 'ai') {
    limitCheck = canScanPhoto;       // AI Photo Scan
  } else {
    limitCheck = canCreateManual;    // Manual Recipe
  }
  
  if (limitCheck && !limitCheck.canProceed) {
    setShowUpgradeModal({
      isOpen: true,
      feature: limitCheck.feature,
      current: limitCheck.current,
      limit: limitCheck.limit,
    });
    return; // Prevent save
  }
}
```

#### Reactive Error Handling (After Backend Error)

Lines 719-752 show the **reactive handling** when backend returns error:

```typescript
catch (err: any) {
  try {
    const errorData = JSON.parse(err.message);
    
    if (errorData.type === "LIMIT_REACHED") {
      setShowUpgradeModal({
        isOpen: true,
        feature: errorData.feature,
        current: errorData.current,
        limit: errorData.limit,
      });
      return;
    }
    
    if (errorData.type === "RATE_LIMIT_EXCEEDED") {
      setError(`Zu viele Anfragen. Bitte warte einen Moment.`);
      return;
    }
    // ... more error types
  } catch (parseError) {
    setError("Fehler beim Speichern: " + err.message);
  }
}
```

### 3.2 ShareTargetPage - Import Flow Handling

**File:** [`pages/ShareTargetPage.tsx`](pages/ShareTargetPage.tsx)

Lines 159-192 show error handling for share imports:

```typescript
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
    setError("Du hast zu viele Anfragen gestellt...");
  }
  // ... more error types
}
```

The `UpgradeModal` is rendered when `limitData` is set:

```typescript
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

## 4. Existing Limit Reached UI - Summary

### What EXISTS

| Component | Location | Status |
|-----------|----------|--------|
| `UpgradeModal` | `components/UpgradeModal.tsx` | Complete and polished |
| Proactive limit check | `AddRecipeModal.tsx` lines 633-658 | Implemented |
| Reactive error handling | `AddRecipeModal.tsx` lines 719-752 | Implemented |
| Share import handling | `ShareTargetPage.tsx` lines 159-192 | Implemented |
| Usage display | `ProfilePage.tsx` `UsageRow` | Implemented |

### What's MISSING

**Nothing is missing from the UI layer!** The problem is:

1. **Frontend displays limit of 100** (from `convex/users.ts` FREE_LIMITS)
2. **Backend enforces limit of 50** (hardcoded in `convex/recipes.ts`)

This causes the raw JSON error to appear because:
- User sees "50/100" in ProfilePage (thinks they have 50 more)
- User tries to import
- Backend rejects with LIMIT_REACHED error
- The error IS caught and UpgradeModal IS shown
- BUT the limit value shown in UpgradeModal (50) doesn't match ProfilePage (100)

---

## 5. Root Cause Analysis

### The Desynchronization

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (users.ts)                         │
│                                                                 │
│  FREE_LIMITS = {                                                │
│    MANUAL_RECIPES: 100,                                         │
│    LINK_IMPORTS: 100,    ◄─── Displayed in ProfilePage         │
│    PHOTO_SCANS: 100,                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ MISMATCH!
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (recipes.ts)                        │
│                                                                 │
│  switch (featureType) {                                         │
│    case "link_imports":                                         │
│      limit = 50;    ◄─── Hardcoded, not using constant!        │
│    case "photo_scans":                                          │
│      limit = 50;    ◄─── Hardcoded, not using constant!        │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Evidence from Backend Analysis

From the existing `plans/rate-limiting-analysis.md`:

```typescript
// convex/recipes.ts lines 375-388
case "link_imports":
  currentCount = stats.linkImports || 0;
  limit = 50; // FREE_LIMITS.LINK_IMPORTS  <-- Comment says FREE_LIMITS but value is 50!
  break;
case "photo_scans":
  currentCount = stats.photoScans || 0;
  limit = 50; // FREE_LIMITS.PHOTO_SCANS   <-- Same issue!
  break;
```

---

## 6. Recommendations

### Primary Fix: Synchronize Limits

**Option A: Use shared constants (Recommended)**

Create `convex/constants.ts`:
```typescript
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,
  LINK_IMPORTS: 100,
  PHOTO_SCANS: 100,
} as const;
```

Import in both `users.ts` and `recipes.ts`.

**Option B: Fix hardcoded values in recipes.ts**

Change lines 382-386 in `convex/recipes.ts`:
```typescript
case "link_imports":
  limit = 100; // Match frontend
  break;
case "photo_scans":
  limit = 100; // Match frontend
  break;
```

### Secondary Improvements

1. **Add limit display in UpgradeModal**: Currently the modal receives `limit` prop but may not display it prominently

2. **Add remaining count warning**: Show warning in ProfilePage when user is at 80%+ capacity

3. **Improve error message**: The raw JSON error in the problem statement suggests the error might be displayed raw somewhere. Ensure all entry points use UpgradeModal.

---

## 7. File Reference Summary

| File | Purpose | Key Lines |
|------|---------|-----------|
| [`pages/ProfilePage.tsx`](pages/ProfilePage.tsx) | Usage stats display | 33-36, 155-179, 301-334 |
| [`components/UpgradeModal.tsx`](components/UpgradeModal.tsx) | Limit reached modal | 1-119 |
| [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx) | Proactive + reactive handling | 35-37, 39-49, 633-658, 719-752, 884-892 |
| [`pages/ShareTargetPage.tsx`](pages/ShareTargetPage.tsx) | Import error handling | 19, 159-192, 228-237 |
| [`convex/users.ts`](convex/users.ts) | Frontend limit queries | 7-11, 41-169 |
| [`convex/recipes.ts`](convex/recipes.ts) | Backend limit enforcement | 375-388 |

---

## 8. Conclusion

**The UI is NOT the problem.** The `UpgradeModal` component is well-designed and properly integrated. The issue is purely a **data synchronization problem** between frontend and backend limit constants.

When the limit values are synchronized, the existing system will work correctly:
1. ProfilePage shows correct limit
2. Proactive check prevents save when limit reached
3. UpgradeModal shows with correct limit value
4. User understands their situation and can upgrade

## Executive Summary

The frontend already has a **complete and well-designed limit reached UI system** using the `UpgradeModal` component. The issue is **NOT a missing UI component** - it's a **desynchronization between frontend and backend limit values**.

---

## 1. Profile Page - Usage Stats Display

### Location
**File:** [`pages/ProfilePage.tsx`](pages/ProfilePage.tsx)

### How Usage Data is Fetched

The profile page uses three separate Convex queries to fetch limit information:

```typescript
// Lines 33-36
const manualLimit = useQuery(api.users.canCreateManualRecipe);
const linkLimit = useQuery(api.users.canImportFromLink);
const scanLimit = useQuery(api.users.canScanPhoto);
```

### How Usage is Displayed

The data is displayed using the `UsageRow` component (lines 301-334):

```typescript
<UsageRow
  label="Manuelle Rezepte"
  current={manualLimit?.current ?? 0}
  limit={manualLimit?.limit ?? 0}  // Sync with backend
  icon={BookOpen}
/>
```

**Key Features:**
- Shows current usage vs limit (e.g., "50 / 100")
- Progress bar with visual feedback
- Red styling when limit is reached (`isFull` state)
- Shimmer animation on the progress bar

### Data Flow Diagram

```
ProfilePage.tsx
       │
       ├── useQuery(api.users.canCreateManualRecipe)
       ├── useQuery(api.users.canImportFromLink)
       └── useQuery(api.users.canScanPhoto)
              │
              ▼
       convex/users.ts (FREE_LIMITS constant)
              │
              ▼
       Returns: { canProceed, current, limit, feature, remaining }
              │
              ▼
       UsageRow component displays: current / limit
```

---

## 2. UpgradeModal Component Analysis

### Location
**File:** [`components/UpgradeModal.tsx`](components/UpgradeModal.tsx)

### Purpose
A polished modal that shows when users hit their free tier limit, encouraging upgrade to Pro.

### Props Interface

```typescript
interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount?: number;
  limit?: number;
  feature?: 'manual_recipes' | 'link_imports' | 'photo_scans';
}
```

### Features

1. **Feature-specific messaging** (lines 27-46):
   - `manual_recipes`: "Rezept Limit erreicht"
   - `link_imports`: "Import Limit erreicht"
   - `photo_scans`: "Scan Limit erreicht"

2. **Dynamic limit display**: Shows the actual limit in the description

3. **Pro benefits list**:
   - Unlimited recipes & scans
   - Enhanced AI analysis
   - Sync across devices

4. **Call to action**: Button to navigate to subscribe page

### Visual Design
- Glassmorphism style with backdrop blur
- Gradient icon container
- Glow effect
- Smooth animations (fade-in, zoom-in, slide-in)

---

## 3. LIMIT_REACHED Error Handling

### 3.1 AddRecipeModal - Complete Implementation

**File:** [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx)

#### Proactive Limit Check (Before Save)

Lines 633-658 show the **proactive check** before attempting to save:

```typescript
if (!initialData) { // Only check for new recipes
  let limitCheck;
  
  if (formData.sourceUrl) {
    limitCheck = canImportLink;      // URL Import
  } else if (activeTab === 'ai') {
    limitCheck = canScanPhoto;       // AI Photo Scan
  } else {
    limitCheck = canCreateManual;    // Manual Recipe
  }
  
  if (limitCheck && !limitCheck.canProceed) {
    setShowUpgradeModal({
      isOpen: true,
      feature: limitCheck.feature,
      current: limitCheck.current,
      limit: limitCheck.limit,
    });
    return; // Prevent save
  }
}
```

#### Reactive Error Handling (After Backend Error)

Lines 719-752 show the **reactive handling** when backend returns error:

```typescript
catch (err: any) {
  try {
    const errorData = JSON.parse(err.message);
    
    if (errorData.type === "LIMIT_REACHED") {
      setShowUpgradeModal({
        isOpen: true,
        feature: errorData.feature,
        current: errorData.current,
        limit: errorData.limit,
      });
      return;
    }
    
    if (errorData.type === "RATE_LIMIT_EXCEEDED") {
      setError(`Zu viele Anfragen. Bitte warte einen Moment.`);
      return;
    }
    // ... more error types
  } catch (parseError) {
    setError("Fehler beim Speichern: " + err.message);
  }
}
```

### 3.2 ShareTargetPage - Import Flow Handling

**File:** [`pages/ShareTargetPage.tsx`](pages/ShareTargetPage.tsx)

Lines 159-192 show error handling for share imports:

```typescript
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
    setError("Du hast zu viele Anfragen gestellt...");
  }
  // ... more error types
}
```

The `UpgradeModal` is rendered when `limitData` is set:

```typescript
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

## 4. Existing Limit Reached UI - Summary

### What EXISTS

| Component | Location | Status |
|-----------|----------|--------|
| `UpgradeModal` | `components/UpgradeModal.tsx` | Complete and polished |
| Proactive limit check | `AddRecipeModal.tsx` lines 633-658 | Implemented |
| Reactive error handling | `AddRecipeModal.tsx` lines 719-752 | Implemented |
| Share import handling | `ShareTargetPage.tsx` lines 159-192 | Implemented |
| Usage display | `ProfilePage.tsx` `UsageRow` | Implemented |

### What's MISSING

**Nothing is missing from the UI layer!** The problem is:

1. **Frontend displays limit of 100** (from `convex/users.ts` FREE_LIMITS)
2. **Backend enforces limit of 50** (hardcoded in `convex/recipes.ts`)

This causes the raw JSON error to appear because:
- User sees "50/100" in ProfilePage (thinks they have 50 more)
- User tries to import
- Backend rejects with LIMIT_REACHED error
- The error IS caught and UpgradeModal IS shown
- BUT the limit value shown in UpgradeModal (50) doesn't match ProfilePage (100)

---

## 5. Root Cause Analysis

### The Desynchronization

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (users.ts)                         │
│                                                                 │
│  FREE_LIMITS = {                                                │
│    MANUAL_RECIPES: 100,                                         │
│    LINK_IMPORTS: 100,    ◄─── Displayed in ProfilePage         │
│    PHOTO_SCANS: 100,                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ MISMATCH!
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (recipes.ts)                        │
│                                                                 │
│  switch (featureType) {                                         │
│    case "link_imports":                                         │
│      limit = 50;    ◄─── Hardcoded, not using constant!        │
│    case "photo_scans":                                          │
│      limit = 50;    ◄─── Hardcoded, not using constant!        │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Evidence from Backend Analysis

From the existing `plans/rate-limiting-analysis.md`:

```typescript
// convex/recipes.ts lines 375-388
case "link_imports":
  currentCount = stats.linkImports || 0;
  limit = 50; // FREE_LIMITS.LINK_IMPORTS  <-- Comment says FREE_LIMITS but value is 50!
  break;
case "photo_scans":
  currentCount = stats.photoScans || 0;
  limit = 50; // FREE_LIMITS.PHOTO_SCANS   <-- Same issue!
  break;
```

---

## 6. Recommendations

### Primary Fix: Synchronize Limits

**Option A: Use shared constants (Recommended)**

Create `convex/constants.ts`:
```typescript
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,
  LINK_IMPORTS: 100,
  PHOTO_SCANS: 100,
} as const;
```

Import in both `users.ts` and `recipes.ts`.

**Option B: Fix hardcoded values in recipes.ts**

Change lines 382-386 in `convex/recipes.ts`:
```typescript
case "link_imports":
  limit = 100; // Match frontend
  break;
case "photo_scans":
  limit = 100; // Match frontend
  break;
```

### Secondary Improvements

1. **Add limit display in UpgradeModal**: Currently the modal receives `limit` prop but may not display it prominently

2. **Add remaining count warning**: Show warning in ProfilePage when user is at 80%+ capacity

3. **Improve error message**: The raw JSON error in the problem statement suggests the error might be displayed raw somewhere. Ensure all entry points use UpgradeModal.

---

## 7. File Reference Summary

| File | Purpose | Key Lines |
|------|---------|-----------|
| [`pages/ProfilePage.tsx`](pages/ProfilePage.tsx) | Usage stats display | 33-36, 155-179, 301-334 |
| [`components/UpgradeModal.tsx`](components/UpgradeModal.tsx) | Limit reached modal | 1-119 |
| [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx) | Proactive + reactive handling | 35-37, 39-49, 633-658, 719-752, 884-892 |
| [`pages/ShareTargetPage.tsx`](pages/ShareTargetPage.tsx) | Import error handling | 19, 159-192, 228-237 |
| [`convex/users.ts`](convex/users.ts) | Frontend limit queries | 7-11, 41-169 |
| [`convex/recipes.ts`](convex/recipes.ts) | Backend limit enforcement | 375-388 |

---

## 8. Conclusion

**The UI is NOT the problem.** The `UpgradeModal` component is well-designed and properly integrated. The issue is purely a **data synchronization problem** between frontend and backend limit constants.

When the limit values are synchronized, the existing system will work correctly:
1. ProfilePage shows correct limit
2. Proactive check prevents save when limit reached
3. UpgradeModal shows with correct limit value
4. User understands their situation and can upgrade

## Executive Summary

The frontend already has a **complete and well-designed limit reached UI system** using the `UpgradeModal` component. The issue is **NOT a missing UI component** - it's a **desynchronization between frontend and backend limit values**.

---

## 1. Profile Page - Usage Stats Display

### Location
**File:** [`pages/ProfilePage.tsx`](pages/ProfilePage.tsx)

### How Usage Data is Fetched

The profile page uses three separate Convex queries to fetch limit information:

```typescript
// Lines 33-36
const manualLimit = useQuery(api.users.canCreateManualRecipe);
const linkLimit = useQuery(api.users.canImportFromLink);
const scanLimit = useQuery(api.users.canScanPhoto);
```

### How Usage is Displayed

The data is displayed using the `UsageRow` component (lines 301-334):

```typescript
<UsageRow
  label="Manuelle Rezepte"
  current={manualLimit?.current ?? 0}
  limit={manualLimit?.limit ?? 0}  // Sync with backend
  icon={BookOpen}
/>
```

**Key Features:**
- Shows current usage vs limit (e.g., "50 / 100")
- Progress bar with visual feedback
- Red styling when limit is reached (`isFull` state)
- Shimmer animation on the progress bar

### Data Flow Diagram

```
ProfilePage.tsx
       │
       ├── useQuery(api.users.canCreateManualRecipe)
       ├── useQuery(api.users.canImportFromLink)
       └── useQuery(api.users.canScanPhoto)
              │
              ▼
       convex/users.ts (FREE_LIMITS constant)
              │
              ▼
       Returns: { canProceed, current, limit, feature, remaining }
              │
              ▼
       UsageRow component displays: current / limit
```

---

## 2. UpgradeModal Component Analysis

### Location
**File:** [`components/UpgradeModal.tsx`](components/UpgradeModal.tsx)

### Purpose
A polished modal that shows when users hit their free tier limit, encouraging upgrade to Pro.

### Props Interface

```typescript
interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount?: number;
  limit?: number;
  feature?: 'manual_recipes' | 'link_imports' | 'photo_scans';
}
```

### Features

1. **Feature-specific messaging** (lines 27-46):
   - `manual_recipes`: "Rezept Limit erreicht"
   - `link_imports`: "Import Limit erreicht"
   - `photo_scans`: "Scan Limit erreicht"

2. **Dynamic limit display**: Shows the actual limit in the description

3. **Pro benefits list**:
   - Unlimited recipes & scans
   - Enhanced AI analysis
   - Sync across devices

4. **Call to action**: Button to navigate to subscribe page

### Visual Design
- Glassmorphism style with backdrop blur
- Gradient icon container
- Glow effect
- Smooth animations (fade-in, zoom-in, slide-in)

---

## 3. LIMIT_REACHED Error Handling

### 3.1 AddRecipeModal - Complete Implementation

**File:** [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx)

#### Proactive Limit Check (Before Save)

Lines 633-658 show the **proactive check** before attempting to save:

```typescript
if (!initialData) { // Only check for new recipes
  let limitCheck;
  
  if (formData.sourceUrl) {
    limitCheck = canImportLink;      // URL Import
  } else if (activeTab === 'ai') {
    limitCheck = canScanPhoto;       // AI Photo Scan
  } else {
    limitCheck = canCreateManual;    // Manual Recipe
  }
  
  if (limitCheck && !limitCheck.canProceed) {
    setShowUpgradeModal({
      isOpen: true,
      feature: limitCheck.feature,
      current: limitCheck.current,
      limit: limitCheck.limit,
    });
    return; // Prevent save
  }
}
```

#### Reactive Error Handling (After Backend Error)

Lines 719-752 show the **reactive handling** when backend returns error:

```typescript
catch (err: any) {
  try {
    const errorData = JSON.parse(err.message);
    
    if (errorData.type === "LIMIT_REACHED") {
      setShowUpgradeModal({
        isOpen: true,
        feature: errorData.feature,
        current: errorData.current,
        limit: errorData.limit,
      });
      return;
    }
    
    if (errorData.type === "RATE_LIMIT_EXCEEDED") {
      setError(`Zu viele Anfragen. Bitte warte einen Moment.`);
      return;
    }
    // ... more error types
  } catch (parseError) {
    setError("Fehler beim Speichern: " + err.message);
  }
}
```

### 3.2 ShareTargetPage - Import Flow Handling

**File:** [`pages/ShareTargetPage.tsx`](pages/ShareTargetPage.tsx)

Lines 159-192 show error handling for share imports:

```typescript
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
    setError("Du hast zu viele Anfragen gestellt...");
  }
  // ... more error types
}
```

The `UpgradeModal` is rendered when `limitData` is set:

```typescript
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

## 4. Existing Limit Reached UI - Summary

### ✅ What EXISTS

| Component | Location | Status |
|-----------|----------|--------|
| `UpgradeModal` | `components/UpgradeModal.tsx` | ✅ Complete & polished |
| Proactive limit check | `AddRecipeModal.tsx` lines 633-658 | ✅ Implemented |
| Reactive error handling | `AddRecipeModal.tsx` lines 719-752 | ✅ Implemented |
| Share import handling | `ShareTargetPage.tsx` lines 159-192 | ✅ Implemented |
| Usage display | `ProfilePage.tsx` `UsageRow` | ✅ Implemented |

### ❌ What's MISSING

**Nothing is missing from the UI layer!** The problem is:

1. **Frontend displays limit of 100** (from `convex/users.ts` FREE_LIMITS)
2. **Backend enforces limit of 50** (hardcoded in `convex/recipes.ts`)

This causes the raw JSON error to appear because:
- User sees "50/100" in ProfilePage (thinks they have 50 more)
- User tries to import
- Backend rejects with LIMIT_REACHED error
- The error IS caught and UpgradeModal IS shown
- BUT the limit value shown in UpgradeModal (50) doesn't match ProfilePage (100)

---

## 5. Root Cause Analysis

### The Desynchronization

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (users.ts)                         │
│                                                                 │
│  FREE_LIMITS = {                                                │
│    MANUAL_RECIPES: 100,                                         │
│    LINK_IMPORTS: 100,    ◄─── Displayed in ProfilePage         │
│    PHOTO_SCANS: 100,                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ MISMATCH!
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (recipes.ts)                        │
│                                                                 │
│  switch (featureType) {                                         │
│    case "link_imports":                                         │
│      limit = 50;    ◄─── Hardcoded, not using constant!        │
│    case "photo_scans":                                          │
│      limit = 50;    ◄─── Hardcoded, not using constant!        │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Evidence from Backend Analysis

From the existing `plans/rate-limiting-analysis.md`:

```typescript
// convex/recipes.ts lines 375-388
case "link_imports":
  currentCount = stats.linkImports || 0;
  limit = 50; // FREE_LIMITS.LINK_IMPORTS  <-- Comment says FREE_LIMITS but value is 50!
  break;
case "photo_scans":
  currentCount = stats.photoScans || 0;
  limit = 50; // FREE_LIMITS.PHOTO_SCANS   <-- Same issue!
  break;
```

---

## 6. Recommendations

### Primary Fix: Synchronize Limits

**Option A: Use shared constants (Recommended)**

Create `convex/constants.ts`:
```typescript
export const FREE_LIMITS = {
  MANUAL_RECIPES: 100,
  LINK_IMPORTS: 100,
  PHOTO_SCANS: 100,
} as const;
```

Import in both `users.ts` and `recipes.ts`.

**Option B: Fix hardcoded values in recipes.ts**

Change lines 382-386 in `convex/recipes.ts`:
```typescript
case "link_imports":
  limit = 100; // Match frontend
  break;
case "photo_scans":
  limit = 100; // Match frontend
  break;
```

### Secondary Improvements

1. **Add limit display in UpgradeModal**: Currently the modal receives `limit` prop but may not display it prominently

2. **Add remaining count warning**: Show warning in ProfilePage when user is at 80%+ capacity

3. **Improve error message**: The raw JSON error in the problem statement suggests the error might be displayed raw somewhere. Ensure all entry points use UpgradeModal.

---

## 7. File Reference Summary

| File | Purpose | Key Lines |
|------|---------|-----------|
| [`pages/ProfilePage.tsx`](pages/ProfilePage.tsx) | Usage stats display | 33-36, 155-179, 301-334 |
| [`components/UpgradeModal.tsx`](components/UpgradeModal.tsx) | Limit reached modal | 1-119 |
| [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx) | Proactive + reactive handling | 35-37, 39-49, 633-658, 719-752, 884-892 |
| [`pages/ShareTargetPage.tsx`](pages/ShareTargetPage.tsx) | Import error handling | 19, 159-192, 228-237 |
| [`convex/users.ts`](convex/users.ts) | Frontend limit queries | 7-11, 41-169 |
| [`convex/recipes.ts`](convex/recipes.ts) | Backend limit enforcement | 375-388 |

---

## 8. Conclusion

**The UI is NOT the problem.** The `UpgradeModal` component is well-designed and properly integrated. The issue is purely a **data synchronization problem** between frontend and backend limit constants.

When the limit values are synchronized, the existing system will work correctly:
1. ProfilePage shows correct limit
2. Proactive check prevents save when limit reached
3. UpgradeModal shows with correct limit value
4. User understands their situation and can upgrade

