---
type: "query"
date: "2026-07-14T23:45:05.484462+00:00"
question: "AP04 sichere idempotente Kontolöschung Stripe vor lokaler Datenlöschung"
contributor: "graphify"
source_nodes: ["requestDeletion", "deleteCustomer", "deleteLocalData", "accountDeletionRequests", "handleDeleteAccount"]
---

# Q: AP04 sichere idempotente Kontolöschung Stripe vor lokaler Datenlöschung

## Answer

AP04 wurde mit accountDeletionRequests und requestDeletion umgesetzt. Stripe customers.del läuft vor deleteLocalData; Fehler bleiben mit derselben UUID retrybar. Lokale Daten, Storage, Importoperationen, API- und Auth-Limits sowie Auth-Zustand werden erst danach atomar entfernt. Stripe-Webhooks werden durch einen 45 Tage aufbewahrten Tombstone ignoriert. UI leert Cache und Logs erst nach completed.

## Source Nodes

- requestDeletion
- deleteCustomer
- deleteLocalData
- accountDeletionRequests
- handleDeleteAccount