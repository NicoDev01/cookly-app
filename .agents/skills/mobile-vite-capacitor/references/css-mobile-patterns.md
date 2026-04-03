# CSS Mobile Patterns

## CSS Custom Properties for Safe Areas

Define once in `index.css` or a global stylesheet:

```css
:root {
  /* Safe area insets — fallback to 0 on desktop */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);

  /* Keyboard height — updated via JS Keyboard plugin listeners */
  --keyboard-height: 0px;

  /* Bottom nav height + safe area */
  --bottom-nav-height: 64px;
  --bottom-nav-total: calc(var(--bottom-nav-height) + var(--safe-bottom));
}
```

---

## Tailwind Classes for Mobile

Add to `tailwind.config.js` under `theme.extend`:

```js
theme: {
  extend: {
    spacing: {
      'safe-top': 'env(safe-area-inset-top)',
      'safe-bottom': 'env(safe-area-inset-bottom)',
      'safe-left': 'env(safe-area-inset-left)',
      'safe-right': 'env(safe-area-inset-right)',
    },
    height: {
      'screen-dvh': '100dvh',
    },
    minHeight: {
      'screen-dvh': '100dvh',
      'touch': '44px',
    },
    minWidth: {
      'touch': '44px',
    },
  },
},
```

Usage:
```html
<!-- Full screen with dynamic viewport -->
<div class="min-h-screen-dvh">

<!-- Safe area padding -->
<div class="pt-safe-top pb-safe-bottom">

<!-- Touch target -->
<button class="min-h-touch min-w-touch flex items-center justify-center">
```

---

## Bottom Navigation with Safe Area

```css
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  /* Extend background behind home indicator */
  padding-bottom: env(safe-area-inset-bottom);
  /* GPU layer to prevent flicker during scroll */
  transform: translateZ(0);
  will-change: transform;
  /* Prevent text selection on nav items */
  user-select: none;
  -webkit-user-select: none;
}

/* Content area must account for nav height */
.main-content {
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
}
```

React + Tailwind equivalent:
```tsx
<nav className="fixed bottom-0 inset-x-0 pb-safe-bottom bg-white border-t border-gray-100 translate-z-0">
  {/* nav items */}
</nav>

<main className="pb-[calc(64px+env(safe-area-inset-bottom))]">
  {/* content */}
</main>
```

---

## Input Styling — Prevent iOS Auto-Zoom

iOS zooms in when an input's `font-size` is below 16px. Always enforce:

```css
input,
textarea,
select {
  font-size: 16px; /* minimum — never go below */
  /* Prevent iOS default styling */
  -webkit-appearance: none;
  appearance: none;
  border-radius: 0; /* iOS adds rounded corners by default */
}

/* If you need visually smaller text, scale the wrapper instead */
.input-wrapper {
  transform: scale(0.875);
  transform-origin: left center;
}
```

Tailwind:
```html
<input class="text-base" /> <!-- text-base = 16px -->
```

---

## Scroll Container Patterns

### Full-screen scroll container (iOS momentum)
```css
.scroll-container {
  height: 100%;
  overflow-y: scroll;
  -webkit-overflow-scrolling: touch; /* momentum scrolling on iOS */
  overscroll-behavior-y: contain;    /* prevent parent scroll chain */
}
```

### Prevent body scroll (modal open)
```css
body.modal-open {
  overflow: hidden;
  /* iOS: also need to fix position */
  position: fixed;
  width: 100%;
  top: calc(-1 * var(--scroll-y)); /* restore via JS on close */
}
```

JS pattern:
```ts
function lockBodyScroll() {
  const scrollY = window.scrollY;
  document.documentElement.style.setProperty('--scroll-y', `${scrollY}px`);
  document.body.classList.add('modal-open');
}

function unlockBodyScroll() {
  const scrollY = parseInt(
    document.documentElement.style.getPropertyValue('--scroll-y') || '0'
  );
  document.body.classList.remove('modal-open');
  window.scrollTo(0, scrollY);
}
```

### Horizontal scroll (no scrollbar)
```css
.horizontal-scroll {
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* Firefox */
  scroll-snap-type: x mandatory;
  gap: 12px;
  padding: 0 16px;
}

.horizontal-scroll::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.horizontal-scroll > * {
  scroll-snap-align: start;
  flex-shrink: 0;
}
```

---

## Animation Performance Patterns

### Sheet / Modal entrance (60fps)
```css
.sheet {
  transform: translateY(100%);
  transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
  will-change: transform;
}

.sheet.open {
  transform: translateY(0);
}
```

### Fade in
```css
.fade-in {
  animation: fadeIn 200ms ease-out forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### GPU-promoted fixed elements (prevent flicker)
```css
.fixed-header,
.fixed-footer,
.bottom-nav {
  transform: translateZ(0);
  /* or: */
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
```

### Skeleton loading (no layout shift)
```css
.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

---

## Content Visibility for Long Lists

```css
/* Apply to list items that are off-screen */
.recipe-card {
  content-visibility: auto;
  /* Hint at approximate rendered size to prevent scroll jump */
  contain-intrinsic-size: 0 220px;
}
```

Only use on items that are genuinely off-screen and have a predictable height. Do not use on items with dynamic height.

---

## Touch Action

```css
/* Prevent 300ms tap delay on all interactive elements */
button,
a,
[role="button"],
[role="tab"],
input,
select,
textarea {
  touch-action: manipulation;
}

/* Allow vertical scroll but prevent horizontal (e.g., list items) */
.list-item {
  touch-action: pan-y;
}

/* Disable all touch gestures (e.g., map, canvas) */
.no-touch {
  touch-action: none;
}
```

---

## Dark Mode Support

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111111;
    --fg: #f5f5f5;
  }
}

/* Or via Capacitor StatusBar — set style based on current color scheme */
```

Tailwind dark mode (class-based, controlled by Capacitor/system):
```html
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
```
