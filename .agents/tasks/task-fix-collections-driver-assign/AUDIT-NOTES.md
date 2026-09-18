# Static-Audit Notes — Lower-Priority Hits (FEAT-003)

This file records the fix/leave decision for each remaining static-audit hit that
was NOT part of the confirmed-real Collections.tsx driver-assign fix (FEAT-001/002).
No backend subsystems were built for dead code. Verification was static only
(grep + read); the sandbox has no node/npm, so nothing was built or run here.
The owner builds and deploys via Docker on a VPS.

Branch: `feat/api-health-monitor`
Scope rule applied: additive-only, do-not-remove-working-code, no speculative subsystems.

---

## 1. LeadCapture.tsx — `EarlyAccessForm`, `POST /leads/quote`

- **Verdict: LEAVE (unmounted dead code).**
- **Evidence:** `grep EarlyAccessForm|LeadCapture` across `frontend/src` returns only the
  definition inside `frontend/src/components/LeadCapture.tsx` itself; no other file imports it.
  There is no `/leads` controller anywhere in `backend/src`.
- **Note:** If a public early-access form is wanted later, a minimal `POST /leads` (or
  `POST /leads/quote`) endpoint would be required. Do NOT build it speculatively now.

## 2. ReceivingQueue.tsx — `GET /branches/manifests/incoming`

- **Verdict: LEAVE (unmounted dead code).**
- **Evidence:** `grep ReceivingQueue` across `frontend/src` returns only the component's own
  definition in `frontend/src/components/ReceivingQueue.tsx`; nothing imports it.
- **Correct endpoint mapping (for if it is ever mounted):** the real inbound-manifests route
  is `GET /branches/inbound` (`backend/src/manifests/manifests.controller.ts:49`), and the
  receive action `POST /branches/manifest/:id/receive` already exists
  (`manifests.controller.ts:33`). The component's `GET /branches/manifests/incoming` string
  does NOT exist and would need to be repointed to `GET /branches/inbound` before use.

## 3. lib/api.ts — `workflowApi` (`/workflows`) and `memoryApi` (`/memory/*`)

- **Verdict: LEAVE — DO NOT build backend.**
- **Evidence:** `grep workflowApi|memoryApi` across `frontend/src` shows the definitions in
  `frontend/src/lib/api.ts` and consumption only under the unrouted `frontend/src/pages/CreateWorkflow/*`
  scaffolding (e.g. `MemoryView.tsx`, which imports only the `Column` type). No route mounts
  `CreateWorkflow` in `App.tsx`. No `/workflows` or `/memory` controller exists in `backend/src`.
  (Note: the `/workflows` string in `DashboardSidebar.tsx` is a client-side React Router nav
  path, unrelated to `workflowApi`.)
- **Note:** Dead workflow-builder scaffolding. Safe to delete in a future cleanup, but that is
  out of scope for this task (additive-only). No backend was created.

## 4. api/owner.ts — `ownerLogin` (`POST /owner/auth/login`)

- **Verdict: LEAVE (harmless dead helper).**
- **Evidence:** The LIVE owner login is `frontend/src/api/authApi.ts` `ownerLogin`
  (`POST /auth/owner-login`), used by `frontend/src/pages/LoginPage.tsx`. `grep` for imports of
  `api/owner` / `./owner` across `frontend/src` returns **no matches** — the entire
  `frontend/src/api/owner.ts` module is unused, not just its `ownerLogin` function.
- **Decision rationale:** Because the whole module is dead (not merely one helper), removing a
  single function would leave the file inconsistent while still dead. To keep the change focused
  and avoid over-scoping, the file was LEFT untouched. No code change was made for this item.

## 5. api/addressBookApi.ts — `PATCH /address-book/:id/used`

- **Verdict: LEAVE (low priority).**
- **Evidence:** `frontend/src/api/addressBookApi.ts:40` —
  `markUsed = (id) => api.patch(\`/address-book/${id}/used\`, {}).catch(() => {})`. The call is
  best-effort: the `.catch(() => {})` swallows a missing-route error, so an absent backend route
  cannot produce a user-visible failure.
- **Note:** Adding a tiny `PATCH /address-book/:id/used` route is optional future polish; not
  required and not built here.

## 6. DEFINITE FALSE POSITIVES — verified working, NOT modified

The audit script mis-parsed query-string template literals. All four resolve to real,
working endpoints and their files were left untouched:

- `frontend/src/api/forwardingApi.ts:62` — `GET /forwarding/files${qs ? \`?${qs}\` : ""}`
  (base `/forwarding/files` plus optional query string). **Working.**
- `frontend/src/api/railApi.ts:92` — `GET /rail/consignments${qs ? \`?${qs}\` : ""}`. **Working.**
- `frontend/src/pages/Observatory.tsx:72` — `GET /owner/observatory/errors${q}`
  (paired with the real `/owner/observatory/stats`, `/errors/:id/resolve`, `/errors/:id/retriage`).
  **Working.**
- `frontend/src/pages/owner/OwnerOkrs.tsx:88` —
  `GET /owner/okrs${quarter ? \`?quarter=${encodeURIComponent(quarter)}\` : ""}`
  (route mounted at `App.tsx:247`). **Working.**

---

## Summary

| # | Item | Verdict | Code change |
|---|------|---------|-------------|
| 1 | LeadCapture.tsx `/leads/quote` | LEAVE (dead) | none |
| 2 | ReceivingQueue.tsx `/branches/manifests/incoming` | LEAVE (dead) | none |
| 3 | lib/api.ts `workflowApi` / `memoryApi` | LEAVE (dead) | none |
| 4 | api/owner.ts `ownerLogin` | LEAVE (dead module) | none |
| 5 | addressBookApi.ts `PATCH .../used` | LEAVE (best-effort no-op) | none |
| 6 | forwarding / rail / observatory / okrs query strings | FALSE POSITIVE — working | none |

No backend controller, module, or route was created for any dead-code item
(no `/leads`, no `/workflows`, no `/memory`). No frontend files were modified.
