---
type: "query"
date: "2026-07-16T12:38:55.074339+00:00"
question: "Welche Codepfade bestimmen App-Startzeit, Seitenwechsel, Rezeptlisten, Bildladen und Convex-Serverlast, und wo liegen Performance- oder Kostenrisiken?"
contributor: "graphify"
source_nodes: ["TabsLayout", "ImageWithBlurhash", "listPreviews", "getWeek", "getShoppingList"]
---

# Q: Welche Codepfade bestimmen App-Startzeit, Seitenwechsel, Rezeptlisten, Bildladen und Convex-Serverlast, und wo liegen Performance- oder Kostenrisiken?

## Answer

Groesster Hebel: TabsLayout mountet alle sechs Tabs und alle besuchten Kategorien dauerhaft; dadurch bleiben unsichtbare Convex-Abonnements aktiv und alle Route-Chunks werden sofort vorgeladen. ImageWithBlurhash startet fuer jedes Bild sofort einen separaten Image-Download und hebelt damit das IntersectionObserver-Lazy-Loading aus. Danach sollten listPreviews wirklich paginiert, weekly.getWeek per Indexbereich begrenzt und getShoppingList ohne Vollscan und N+1-Lesezugriffe umgesetzt werden. Gute Grundlagen sind React.lazy, Suspense, leichte Rezept-Previews, Blurhash-Metadaten, Debounce und optimistische Mutationen.

## Source Nodes

- TabsLayout
- ImageWithBlurhash
- listPreviews
- getWeek
- getShoppingList