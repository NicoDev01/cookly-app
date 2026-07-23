---
type: "query"
date: "2026-07-14T23:35:57.213977+00:00"
question: "Was ist AP-03 im Audit- und Umsetzungsplan und welche Codepfade betrifft es?"
contributor: "graphify"
source_nodes: ["importOperations.ts", "rateLimiter.ts"]
---

# Q: Was ist AP-03 im Audit- und Umsetzungsplan und welche Codepfade betrifft es?

## Answer

AP-03 implementiert idempotente Importoperationen mit atomarer Quota-Reservierung, internen Provider-Actions, getrennten API-Rate-Limits und globalen Provider-Tagesbudgets.

## Source Nodes

- importOperations.ts
- rateLimiter.ts