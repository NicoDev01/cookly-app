# AP-06: Google Play Billing

## Verbindliche Konfiguration

| System | Wert |
|---|---|
| RevenueCat Entitlement | `pro` |
| Offering | aktuelles/default Offering |
| Monats-Package | RevenueCat-Typ `MONTHLY` |
| Jahres-Package | RevenueCat-Typ `ANNUAL` |
| Android App ID | `com.cookly.recipe` |

Die konkreten Google-Play-Produkt- und Base-Plan-IDs werden nicht im Client fest verdrahtet. Sie müssen nach der Anlage in Play Console und RevenueCat als kommagetrennte Convex-Variablen gesetzt werden:

```text
REVENUECAT_PRO_MONTHLY_PRODUCT_IDS=<subscription_id>:<monthly_base_plan_id>
REVENUECAT_PRO_YEARLY_PRODUCT_IDS=<subscription_id>:<yearly_base_plan_id>
REVENUECAT_WEBHOOK_AUTH=<zufälliger Authorization-Headerwert>
```

Android-Buildvariablen:

```text
VITE_REVENUECAT_GOOGLE_API_KEY=<öffentlicher RevenueCat Android SDK Key>
VITE_NATIVE_BILLING_ENABLED=false
```

Webhook-URL: `<CONVEX_SITE_URL>/revenuecat/webhook`. Der in RevenueCat konfigurierte Authorization-Header muss exakt `REVENUECAT_WEBHOOK_AUTH` entsprechen. Sandbox- und Produktionsereignisse bleiben über das Feld `environment` getrennt.

## Rollout

1. Schema und Backend ohne Aktivierung des Native-Checkouts deployen.
2. `internal.billing.backfillBillingUsers` paginiert ausführen, bis `isDone: true` zurückkommt.
3. Play-Produkte, Base Plans, RevenueCat-Produkte, Packages und Entitlement verbinden.
4. Webhook-Test sowie Monats- und Jahreskauf mit Google-Lizenztester durchführen.
5. Restore, Neustart, Neuinstallation, Ablauf, Storno, Grace Period, Billing Issue und Refund prüfen.
6. Share Intent, OAuth-Rückkehr und Warm-Start mit `singleTop` prüfen.
7. Erst danach `VITE_NATIVE_BILLING_ENABLED=true` setzen und einen neuen Android-Build veröffentlichen.

## Release-Gate

- [ ] Kein Stripe-Kauf- oder Portal-Link in Android.
- [ ] Store-Preis stammt aus dem aktuellen RevenueCat Offering.
- [ ] Webhook verarbeitet Retries idempotent.
- [ ] Convex vereinigt aktive Stripe- und Store-Entitlements.
- [ ] „Käufe wiederherstellen“ und Store-Verwaltung funktionieren.
- [ ] Kontolöschung weist auf separat zu verwaltende Store-Abos hin.
