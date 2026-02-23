# 💳 Payment-System: Stripe Integration

> **Erstellt:** 2026-02-19  
> **Projekt:** Cookly App  
> **Stack:** Vite + React · Convex · Clerk · Stripe · Capacitor

---

## Inhaltsverzeichnis

1. [Architektur-Übersicht](#1-architektur-übersicht)
2. [Betroffene Dateien](#2-betroffene-dateien)
3. [Kernentscheidung: Inline `price_data`](#3-kernentscheidung-inline-price_data)
4. [Umgebungsvariablen](#4-umgebungsvariablen)
5. [Webhook-Setup](#5-webhook-setup)
6. [Subscription-Flow](#6-subscription-flow)
7. [Preise ändern](#7-preise-ändern)
8. [Datenbank-Schema](#8-datenbank-schema)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cookly Frontend                          │
│              (Vite + React, Hash-Routing /#/)                   │
│                                                                 │
│   SubscribePage.tsx                                             │
│   ├── createCheckoutSession(planId) ──────────────────────┐    │
│   └── createPortalSession()  ─────────────────────────┐   │    │
└───────────────────────────────────────────────────────┼───┼────┘
                                                        │   │
                                                        ▼   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Convex Backend                             │
│                                                                 │
│   convex/stripe.ts                                              │
│   ├── createCheckoutSession  (Action)                           │
│   ├── createPortalSession    (Action)                           │
│   └── handleWebhook          (HTTP Action)                      │
│                                                                 │
│   convex/http.ts                                                │
│   └── POST /stripe/webhook ──────────────────────────────┐     │
└──────────────────────────────────────────────────────────┼─────┘
                                                           │
                    ┌──────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Stripe                                   │
│                                                                 │
│   Checkout Session  ◄──── createCheckoutSession                 │
│   Customer Portal   ◄──── createPortalSession                   │
│   Webhooks          ────► /stripe/webhook (Convex HTTP)         │
└─────────────────────────────────────────────────────────────────┘
```

**Wichtig:** Da Cookly mit **Capacitor** als native App läuft, wird **Hash-Routing** (`/#/`) verwendet. Alle Redirect-URLs müssen daher das `/#/`-Präfix enthalten (z. B. `/#/profile?success=true`).

---

## 2. Betroffene Dateien

### `convex/stripe.ts` — Hauptdatei

Die zentrale Datei für die gesamte Stripe-Integration.

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PLAN_PRICES` | Objekt | Inline-Preisdefinitionen (kein Stripe Dashboard nötig) |
| `createCheckoutSession` | Action | Erstellt eine Stripe Checkout Session |
| `createPortalSession` | Action | Erstellt eine Stripe Customer Portal Session |
| `handleWebhook` | HTTP Action | Verarbeitet eingehende Stripe Webhooks |

**Behandelte Webhook-Events:**

| Event | Aktion |
|-------|--------|
| `checkout.session.completed` | Subscription aktivieren, User auf `pro_monthly`/`pro_yearly` setzen |
| `customer.subscription.updated` | Subscription-Status aktualisieren |
| `customer.subscription.deleted` | Subscription auf `free` zurücksetzen |
| `invoice.payment_failed` | Status auf `past_due` setzen |
| `invoice.payment_succeeded` | Status auf `active` setzen |

---

### `convex/http.ts` — HTTP Router

Registriert den Stripe Webhook-Endpunkt:

```typescript
// Webhook unter /stripe/webhook erreichbar
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: stripe.handleWebhook,
});
```

---

### `convex/schema.ts` — Datenbank-Schema

Subscription-relevante Felder im User-Dokument:

```typescript
users: defineTable({
  // ... andere Felder ...
  subscription: v.optional(
    v.union(v.literal("free"), v.literal("pro_monthly"), v.literal("pro_yearly"))
  ),
  subscriptionStatus: v.optional(
    v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("incomplete"),
      v.literal("trialing")
    )
  ),
  stripeCustomerId: v.optional(v.string()),
  stripeSubscriptionId: v.optional(v.string()),
  subscriptionPeriodEnd: v.optional(v.number()), // Unix Timestamp
})
```

---

### `pages/SubscribePage.tsx` — Frontend UI

Die Subscription-Seite mit:
- **Monatlich/Jährlich Toggle** zur Plan-Auswahl
- Button „Jetzt upgraden" → ruft `api.stripe.createCheckoutSession` mit `planId` auf
- Button „Abo verwalten" → ruft `api.stripe.createPortalSession` auf (für bestehende Abonnenten)

---

### `convex/users.ts` — User Queries/Mutations

Enthält Queries und Mutations zum Lesen und Schreiben des Subscription-Status. Wird vom Webhook-Handler in `stripe.ts` aufgerufen, um den User nach erfolgreicher Zahlung zu aktualisieren.

---

## 3. Kernentscheidung: Inline `price_data`

### Was bedeutet das?

Statt Produkte und Preise im Stripe Dashboard anzulegen und deren IDs zu verwenden, werden die Preise **direkt im Code** als `price_data` mit `product_data` definiert.

### Vorteile

- ✅ Kein manuelles Setup im Stripe Dashboard erforderlich
- ✅ Preise sind versioniert (im Git-Repository)
- ✅ Einfache Anpassung ohne Dashboard-Zugriff
- ✅ Kein Risiko von falsch kopierten Price-IDs

### Aktuelle Preise (`PLAN_PRICES` in `convex/stripe.ts`)

| Plan | Preis | Intervall | Betrag (Cent) |
|------|-------|-----------|---------------|
| `pro_monthly` | 2,99 € | monatlich | `299` |
| `pro_yearly` | 24,99 € | jährlich | `2499` |

### Code-Struktur

```typescript
const PLAN_PRICES = {
  pro_monthly: {
    currency: "eur",
    unit_amount: 299,
    recurring: { interval: "month" },
    product_data: { name: "Cookly Pro – Monatlich" },
  },
  pro_yearly: {
    currency: "eur",
    unit_amount: 2499,
    recurring: { interval: "year" },
    product_data: { name: "Cookly Pro – Jährlich" },
  },
};
```

---

## 4. Umgebungsvariablen

Diese Variablen müssen im **Convex Backend** gesetzt werden (nicht in `.env.local`!).

```bash
# Convex Dashboard → Settings → Environment Variables
STRIPE_SECRET_KEY=sk_live_...        # Stripe Secret Key (Live oder Test)
STRIPE_WEBHOOK_SECRET=whsec_...      # Stripe Webhook Signing Secret
```

### Variablen setzen (Convex CLI)

```bash
npx convex env set STRIPE_SECRET_KEY sk_live_...
npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
```

### Für lokale Entwicklung (Stripe CLI)

```bash
# Stripe CLI installieren und einloggen
stripe login

# Webhooks lokal weiterleiten (gibt einen temporären whsec_ aus)
stripe listen --forward-to https://<dein-convex-deployment>.convex.site/stripe/webhook

# Den ausgegebenen whsec_ als STRIPE_WEBHOOK_SECRET setzen
npx convex env set STRIPE_WEBHOOK_SECRET whsec_<temporärer-key>
```

> ⚠️ **Achtung:** Test-Keys (`sk_test_...`) und Live-Keys (`sk_live_...`) nicht mischen. Für Entwicklung immer Test-Keys verwenden.

---

## 5. Webhook-Setup

### Webhook-URL

```
https://<convex-deployment-name>.convex.site/stripe/webhook
```

Die genaue URL findet sich im Convex Dashboard unter **Settings → URL & Deploy Key**.

### Stripe Dashboard Setup

1. Stripe Dashboard öffnen: [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. **„Add endpoint"** klicken
3. URL eintragen: `https://<convex-deployment>.convex.site/stripe/webhook`
4. Folgende Events auswählen:

```
checkout.session.completed
customer.subscription.updated
customer.subscription.deleted
invoice.payment_failed
invoice.payment_succeeded
```

5. **„Add endpoint"** bestätigen
6. Den **Signing Secret** (`whsec_...`) kopieren und als `STRIPE_WEBHOOK_SECRET` in Convex setzen

### Webhook-Signatur-Verifikation

Der Webhook-Handler in `convex/stripe.ts` verifiziert jede eingehende Anfrage mit dem Signing Secret. Anfragen ohne gültige Signatur werden mit `400 Bad Request` abgelehnt.

---

## 6. Subscription-Flow

### Neues Abonnement abschließen

```
User                    Frontend              Convex               Stripe
 │                          │                    │                    │
 │  Klick "Jetzt upgraden"  │                    │                    │
 │─────────────────────────►│                    │                    │
 │                          │ createCheckoutSession(planId)           │
 │                          │───────────────────►│                    │
 │                          │                    │ Create Session     │
 │                          │                    │───────────────────►│
 │                          │                    │◄───────────────────│
 │                          │◄───────────────────│  { url: "..." }    │
 │  Browser-Redirect        │                    │                    │
 │◄─────────────────────────│                    │                    │
 │                          │                    │                    │
 │  [Stripe Checkout Seite] │                    │                    │
 │  Zahlung eingeben        │                    │                    │
 │─────────────────────────────────────────────────────────────────►│
 │                          │                    │                    │
 │                          │                    │  Webhook: checkout │
 │                          │                    │◄───────────────────│
 │                          │                    │  .session.completed│
 │                          │                    │                    │
 │                          │                    │ User aktualisieren │
 │                          │                    │ subscription=pro_* │
 │                          │                    │                    │
 │  Redirect: /#/profile?success=true            │                    │
 │◄─────────────────────────────────────────────────────────────────│
```

### Abo verwalten / kündigen

```
User                    Frontend              Convex               Stripe
 │                          │                    │                    │
 │  Klick "Abo verwalten"   │                    │                    │
 │─────────────────────────►│                    │                    │
 │                          │ createPortalSession()                   │
 │                          │───────────────────►│                    │
 │                          │                    │ Create Portal      │
 │                          │                    │───────────────────►│
 │                          │                    │◄───────────────────│
 │                          │◄───────────────────│  { url: "..." }    │
 │  Browser-Redirect        │                    │                    │
 │◄─────────────────────────│                    │                    │
 │                          │                    │                    │
 │  [Stripe Customer Portal]│                    │                    │
 │  Abo ändern/kündigen     │                    │                    │
 │─────────────────────────────────────────────────────────────────►│
 │                          │                    │                    │
 │                          │                    │  Webhook: sub.*    │
 │                          │                    │◄───────────────────│
 │                          │                    │ User aktualisieren │
```

### Redirect-URLs (Capacitor Hash-Routing)

| Szenario | URL |
|----------|-----|
| Erfolgreiche Zahlung | `/#/profile?success=true` |
| Abgebrochene Zahlung | `/#/subscribe?canceled=true` |
| Portal-Rückkehr | `/#/profile` |

---

## 7. Preise ändern

Da Inline `price_data` verwendet wird, reicht eine einzige Code-Änderung:

### Schritt 1: `convex/stripe.ts` öffnen

```typescript
// convex/stripe.ts
const PLAN_PRICES = {
  pro_monthly: {
    currency: "eur",
    unit_amount: 299,        // ← Hier ändern (in Cent!)
    recurring: { interval: "month" },
    product_data: { name: "Cookly Pro – Monatlich" },
  },
  pro_yearly: {
    currency: "eur",
    unit_amount: 2499,       // ← Hier ändern (in Cent!)
    recurring: { interval: "year" },
    product_data: { name: "Cookly Pro – Jährlich" },
  },
};
```

### Schritt 2: Deploy

```bash
npx convex deploy
```

> ⚠️ **Hinweis:** Preisänderungen gelten nur für **neue** Checkout Sessions. Bestehende Abonnements behalten ihren alten Preis bis zur nächsten Verlängerung (Stripe-Verhalten).

### Währung ändern

`currency: "eur"` auf den gewünschten ISO-4217-Code ändern (z. B. `"usd"`, `"chf"`).

---

## 8. Datenbank-Schema

### User-Felder (Convex `users` Tabelle)

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `subscription` | `"free" \| "pro_monthly" \| "pro_yearly"` | Aktueller Plan |
| `subscriptionStatus` | `"active" \| "canceled" \| "past_due" \| ...` | Stripe-Status |
| `stripeCustomerId` | `string` | Stripe Customer ID (`cus_...`) |
| `stripeSubscriptionId` | `string` | Stripe Subscription ID (`sub_...`) |
| `subscriptionPeriodEnd` | `number` | Unix Timestamp – Ende des aktuellen Abrechnungszeitraums |

### Subscription-Status-Bedeutung

| Status | Bedeutung | Zugriff auf Pro-Features |
|--------|-----------|--------------------------|
| `active` | Abo aktiv, Zahlung erfolgreich | ✅ Ja |
| `trialing` | Testzeitraum aktiv | ✅ Ja |
| `past_due` | Zahlung fehlgeschlagen, Retry läuft | ⚠️ Abhängig von Konfiguration |
| `canceled` | Abo gekündigt | ❌ Nein |
| `incomplete` | Checkout nicht abgeschlossen | ❌ Nein |

---

## 9. Troubleshooting

### ❌ Webhook kommt nicht an

**Symptom:** Zahlung erfolgreich, aber User bleibt auf `free`.

**Checkliste:**
1. Webhook-URL im Stripe Dashboard korrekt? → `https://<deployment>.convex.site/stripe/webhook`
2. `STRIPE_WEBHOOK_SECRET` in Convex korrekt gesetzt?
3. Convex Logs prüfen: `npx convex logs`
4. Stripe Dashboard → Webhooks → Endpoint → „Recent deliveries" prüfen

---

### ❌ `STRIPE_SECRET_KEY` Fehler

**Symptom:** `Error: No API key provided` oder `Invalid API Key`

**Lösung:**
```bash
# Key prüfen
npx convex env list

# Key neu setzen
npx convex env set STRIPE_SECRET_KEY sk_live_...
```

---

### ❌ Redirect funktioniert nicht (Capacitor)

**Symptom:** Nach Zahlung landet der User nicht auf der richtigen Seite.

**Ursache:** Capacitor verwendet Hash-Routing. Standard-URLs ohne `/#/` funktionieren nicht.

**Lösung:** Sicherstellen, dass alle `success_url` und `cancel_url` in `createCheckoutSession` das `/#/`-Präfix verwenden:

```typescript
success_url: `${process.env.CONVEX_SITE_URL}/#/profile?success=true`,
cancel_url: `${process.env.CONVEX_SITE_URL}/#/subscribe?canceled=true`,
```

---

### ❌ Doppelte Webhook-Verarbeitung

**Symptom:** User-Status wird mehrfach aktualisiert.

**Ursache:** Stripe sendet Webhooks bei Timeouts erneut.

**Lösung:** Der Webhook-Handler sollte idempotent sein (mehrfaches Ausführen mit gleichen Daten hat keinen Effekt). Die aktuelle Implementierung überschreibt Felder, was idempotent ist.

---

### ❌ Preisänderung hat keinen Effekt

**Symptom:** Neuer Preis wird im Checkout nicht angezeigt.

**Ursache:** Convex wurde nicht neu deployed.

**Lösung:**
```bash
npx convex deploy
```

---

### 🔍 Debugging-Befehle

```bash
# Convex Logs in Echtzeit
npx convex logs

# Alle Umgebungsvariablen auflisten
npx convex env list

# Stripe CLI: Webhooks lokal testen
stripe listen --forward-to https://<deployment>.convex.site/stripe/webhook

# Stripe CLI: Einzelnes Event manuell auslösen
stripe trigger checkout.session.completed
```

---

## Weiterführende Links

- [Stripe Docs: Checkout Sessions](https://stripe.com/docs/api/checkout/sessions)
- [Stripe Docs: Customer Portal](https://stripe.com/docs/billing/subscriptions/customer-portal)
- [Stripe Docs: Webhooks](https://stripe.com/docs/webhooks)
- [Convex Docs: HTTP Actions](https://docs.convex.dev/functions/http-actions)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)

---

## PayPal Integration

### Status: ✅ Implementiert

PayPal wurde als zusätzliche Zahlungsmethode in der Stripe Checkout Session aktiviert.

### Code-Änderung

In [`convex/stripe.ts`](../convex/stripe.ts) wurde `payment_method_types` erweitert:

```typescript
// Vorher:
payment_method_types: ["card"],

// Nachher:
payment_method_types: ["card", "paypal"],
```

### Kompatibilität (laut Stripe Docs)

- ✅ **Subscriptions**: PayPal ist vollständig mit `mode: "subscription"` kompatibel
- ✅ **`price_data` / Inline Prices**: PayPal funktioniert mit inline `price_data` (kein Stripe Dashboard-Preis nötig)
- ✅ **EUR-Währung**: PayPal unterstützt EUR
- ⚠️ **Einschränkung**: Alle Line Items müssen dieselbe Währung verwenden (bereits der Fall: alles EUR)

### Stripe Dashboard – Manuelle Aktivierung erforderlich

**PayPal muss im Stripe Dashboard aktiviert werden, bevor es in Checkout Sessions erscheint:**

1. Stripe Dashboard öffnen: [dashboard.stripe.com/settings/payment_methods](https://dashboard.stripe.com/settings/payment_methods)
2. **PayPal** in der Liste der Zahlungsmethoden suchen
3. **"Aktivieren"** klicken und den Anweisungen folgen
4. Für **Live-Modus**: Separate Aktivierung im Live-Dashboard erforderlich

> **Hinweis**: Ohne Dashboard-Aktivierung wird PayPal in der Checkout Session ignoriert, auch wenn es in `payment_method_types` angegeben ist. Es erscheint dann nur die Kreditkarten-Option.

### Stripe-managed vs. eigenes PayPal-Konto

- **Stripe-managed PayPal** (empfohlen): Stripe verwaltet die PayPal-Verbindung, Auszahlungen laufen über Stripe
- **Eigenes PayPal Business-Konto**: Direkte Verbindung, Auszahlungen direkt auf PayPal-Konto

### Webhook-Handling

Keine Änderungen am Webhook-Handler nötig. PayPal-Zahlungen lösen dieselben Stripe-Events aus:
- `checkout.session.completed` → Subscription aktivieren
- `customer.subscription.updated` → Status-Updates
- `customer.subscription.deleted` → Downgrade zu Free
- `invoice.payment_failed` / `invoice.payment_succeeded` → Renewal-Handling

---

## Google Pay Integration

### Status: ✅ Aktivierbar (kein separater Code-Eintrag nötig)

Google Pay wird in Stripe **über `card` abgedeckt** und ist **kein eigener `payment_method_types` Eintrag**. Es erscheint automatisch im Checkout, wenn es im Stripe Dashboard aktiviert ist.

### Recherche-Ergebnis (Stripe Docs via context7)

> *"You can enable Apple Pay and Google Pay in your payment methods settings. By default, Apple Pay is enabled and Google Pay is disabled. Checkout's Stripe-hosted pages don't need integration changes to enable Apple Pay or Google Pay. Stripe handles these payments the same way as other card payments."*

### Kein Code-Änderung in `convex/stripe.ts` erforderlich

Die bestehende Konfiguration reicht aus:

```typescript
payment_method_types: ["card", "paypal"],
// Google Pay wird über "card" abgedeckt – kein eigener Eintrag nötig
```

### Stripe Dashboard – Aktivierung erforderlich

1. Stripe Dashboard öffnen: [dashboard.stripe.com/settings/payment_methods](https://dashboard.stripe.com/settings/payment_methods)
2. **Google Pay** in der Liste suchen
3. **"Aktivieren"** klicken
4. Für **Live-Modus**: Separate Aktivierung im Live-Dashboard erforderlich

### Kompatibilität

- ✅ **Subscriptions**: Google Pay funktioniert mit `mode: "subscription"`
- ✅ **`price_data` / Inline Prices**: Kompatibel
- ✅ **EUR-Währung**: Unterstützt
- ⚠️ **Einschränkung**: Stripe filtert Google Pay heraus, wenn automatische Steuerberechnung ohne Lieferadresse aktiviert ist

### Webhook-Handling

Keine Änderungen nötig. Google Pay-Zahlungen lösen dieselben Stripe-Events aus wie Kartenzahlungen:
- `checkout.session.completed` → Subscription aktivieren
- `customer.subscription.updated` → Status-Updates
- `customer.subscription.deleted` → Downgrade zu Free
- `invoice.payment_failed` / `invoice.payment_succeeded` → Renewal-Handling
