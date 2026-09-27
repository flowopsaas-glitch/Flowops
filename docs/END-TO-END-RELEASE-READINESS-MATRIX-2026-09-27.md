# FlowOps end-to-end release-readiness matrix

**Working handoff; not production approval.** Do not describe FlowOps as “100% end to end” or production-ready until every applicable evidence gate is closed and signed off.

**Snapshot date:** 2026-09-27 (Africa/Johannesburg)
**Workspace:** branch `arena/01a0e23b-flowops`, base HEAD before this documentation commit `c9fc648e93fa22ed410d04dc1f9c6ee5017c8188`. This is **not** PR #436's head. The supplied handoff referred to branch `arena/01a0e1ff-flowops` and two untracked documents; neither document was present in this checkout. This matrix is saved from that approved handoff, with workspace context corrected and a newly recorded, explicitly not-run staging-clone report. Approval is to commit/push documentation only, not to close release gates.
**PR #436:** OPEN, head branch `arena/01a0dd70-flowops`, commit `7844fffa512965d98e9a4184a7e3d8fe104404bb`; latest observed CI is 10/10 green. Review decision is empty. These PR metadata were rechecked via GitHub on the snapshot date; individual scenario coverage and deployed environments were not reverified. Do not merge or deploy from this handoff.
**Production status:** not production-ready; no live VPS change is authorized.

## Status key

- **PASS — CI only:** named automated checks passed at the stated PR head; this is not staging/pilot/production evidence.
- **PARTIAL — CI only:** some stated scenarios have CI evidence; missing scenarios remain open.
- **BLOCKED:** a prerequisite is missing; no apply or downstream release action is allowed.
- **NOT VERIFIED:** no acceptable evidence for the stated scenario was found in this snapshot.
- **GATED:** intentionally held until the migration decision and upstream approvals are complete.

Owners below are **proposed role owners**, not named approvals. Assign named owners before staging/pilot. Evidence links point to the remote PR head or this report; source-code presence alone is not a passed test.

The operator return template named in the supplied handoff (`STAGING-CLONE-MIGRATION-REHEARSAL-REPORT-TEMPLATE.md`) is absent from this checkout and the cited PR head's docs directory. Obtain the actual operator template before the rehearsal; no completed operator report is available here.

## Gate summary

| Gate | Evidence | Proposed owner | Status | Exit condition |
|---|---|---|---|---|
| Staging-clone migration rehearsal and adoption decision | [Not-run rehearsal report](STAGING-CLONE-REHEARSAL-REPORT.md) · [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Staging DB operator + DB owner | **BLOCKED** | Verified disposable clone returns an accepted verdict, all blocking/unknown findings are resolved, and the baseline/drift path is independently reviewed. |
| Clean-database migration + PostgreSQL integration suite | [PR #436 CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) · [CI workflow at PR head](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/.github/workflows/ci.yml) | Backend owner | **PASS — CI only** | Keep as CI evidence; it does not prove adoption of existing staging data. |
| Data backfills | [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) · [phase status](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/PROCESS-CONTROL-PHASE-A-STATUS-2026-09-26.md) | Data owner + backend owner | **BLOCKED** | Dry-run, report unknown/duplicate matches, obtain owner approval, then separately apply and verify; no automatic historical GoodsReceipt linkage. |
| Security / production controls | [PR #436 CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) · [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) | Security owner | **NOT VERIFIED** | Close P0/security gates below with deployed-environment evidence and an approved vulnerability exception/remediation plan. |
| Controlled staging and pilot | [PR #436 merge gate](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Release owner + operations owner | **BLOCKED** | Migration decision, staging approval, smoke tests, pilot evidence, rollback/backup verification and owner sign-off. |
| Rail non-production vertical | [RAIL requirement register](https://github.com/flowopsaas-glitch/Flowops/blob/arena/01a0e23b-flowops/docs/RAIL-REQUIREMENT-REGISTER-TRACEABILITY-2026-09-27.md) · [Rail source register](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md) · [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) | Rail source owner + independent reviewer | **GATED** | Register authored as PROPOSED baseline (2026-09-27). After migration decision: owner approval of the register + exception disposition, then independent review. No production implementation. |

## Migration-related database coverage still explicitly open

The PR runbook names the following checks as residual work even though the current CI run is green. Do not infer them as complete from the CI result alone.

| Check | Evidence | Proposed owner | Status | Evidence needed |
|---|---|---|---|---|
| Product alias uniqueness and resolution | [Migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) · [Product Master integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/product-master.integration.spec.ts) | Product-data owner | **NOT VERIFIED** | Explicit database-backed uniqueness and alias-resolution tests. |
| `proposeSolution` / `reviewChange` | [Migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) · [Process Control integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/process-control.integration.spec.ts) | Process owner + backend owner | **NOT VERIFIED** | Persisted proposal/solution lifecycle and authorization tests. |
| Automation retries and attempt limits | [Migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Backend owner | **NOT VERIFIED** | Retry, idempotency, max-attempt and recovery assertions against PostgreSQL. |
| Cross-tenant warehouse and Process Control reads | [Migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Security owner | **NOT VERIFIED** | Tenant A/B fixtures, forbidden reads and no-leak assertions against PostgreSQL. |
| Production-flag denial against a real database | [Migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Security + backend owners | **NOT VERIFIED** | Demonstrate denied operation with production flags off; do not enable flags to pass the test. |
| Tenant-deletion cascade behavior | [Migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Backend + data owners | **NOT VERIFIED** | PostgreSQL cascade assertions and confirmation that unrelated tenant data remains intact. |
| `InventoryItem.productVariantId` dry-run backfill | [Migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) · [phase status](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/PROCESS-CONTROL-PHASE-A-STATUS-2026-09-26.md) | Data owner + backend owner | **BLOCKED** | Match normalized SKU only when unique; report duplicate/unknown rows; never auto-link ambiguous stock; owner approval before writes. |
| `GoodsReceipt.processInstanceId` historical backfill | [Migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Warehouse data owner | **BLOCKED — no automatic backfill** | No historical reconstruction without a separately approved plan, dry-run and verification. |

## A. Platform and authentication

| Check | Evidence | Proposed owner | Status | Evidence needed |
|---|---|---|---|---|
| Tenant creation and approval | [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Platform owner | **NOT VERIFIED** | Tenant lifecycle test evidence in a controlled environment. |
| User creation and role assignment | [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Identity/platform owner | **NOT VERIFIED** | Database-backed role assignment and audit result. |
| ADMIN / COMPANY_ADMIN / MANAGER / WAREHOUSE / DRIVER permissions | [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Security + platform owners | **NOT VERIFIED** | Positive and negative permission matrix across all named roles. |
| Cross-tenant read refusal | [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Security owner | **NOT VERIFIED** | Database-backed tenant A/B test with refusal evidence. |
| Cross-tenant mutation refusal | [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Security owner | **NOT VERIFIED** | Database-backed attempted mutation and unchanged-row proof. |
| Expired and revoked session behavior | [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) | Identity/security owner | **NOT VERIFIED** | Expiry, revocation, refresh and replay test evidence. |
| Audit event for privileged changes | [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) | Platform owner | **NOT VERIFIED** | Event content, actor/tenant attribution and persistence verification. |
| Production-only routes denied when flags are disabled | [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Security + release owners | **NOT VERIFIED** | Real-database denial test and confirmation of deployed flag values. |

## B. Product Master

| Check | Evidence | Proposed owner | Status | Evidence needed |
|---|---|---|---|---|
| Draft product → approval → variant → SKU → variant approval → alias/barcode → audit history | [Product Master integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/product-master.integration.spec.ts) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Product-data owner | **PARTIAL — CI only; production path NOT VERIFIED** | Integration tests cover product/variant approval, SKU allocation and audit; alias/barcode completion needs explicit test evidence. Repeat in controlled staging after migration approval. |
| Duplicate normalized variant attributes and duplicate SKU | [Product Master integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/product-master.integration.spec.ts) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Product-data + backend owners | **PASS — CI only** | Confirm each case is asserted in the submitted DB-backed suite; preserve results. |
| Concurrent SKU requests and sequence non-reuse | [Product Master integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/product-master.integration.spec.ts) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Backend owner | **PASS — CI only** | Review race test and assert monotonicity/no reuse under PostgreSQL. |
| Parent approval requirement and alias uniqueness/resolution | [Product Master integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/product-master.integration.spec.ts) · [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Product-data owner | **NOT VERIFIED** | Runbook lists alias uniqueness and resolution among remaining DB-backed coverage; close explicitly. |
| Tenant isolation and rollback/error behavior | [Product Master integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/product-master.integration.spec.ts) · [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Security + backend owners | **NOT VERIFIED** | Explicit cross-tenant integration and transactional failure/rollback evidence. |

## C. Warehouse and Goods Receipt

| Check | Evidence | Proposed owner | Status | Evidence needed |
|---|---|---|---|---|
| Receipt → approved Process Book → validate → inspect → put away → outcome | [Goods Receipt integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/goods-receipt.integration.spec.ts) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Warehouse operations + backend owners | **PASS — CI only; pilot NOT VERIFIED** | Map each workflow action to DB assertions; run a controlled staging smoke test after the migration gate. |
| Short/over receipt, damage, missing put-away and unknown SKU | [Goods Receipt integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/goods-receipt.integration.spec.ts) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Warehouse operations owner | **PARTIAL — CI only** | Short, damage, missing-put-away and unknown-SKU cases appear in the integration spec; over-receipt needs explicit test evidence. Confirm exception classification, evidence and audit persistence for each. |
| Duplicate webhook/event and retry after partial failure | [Goods Receipt integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/goods-receipt.integration.spec.ts) · [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Integration owner | **NOT VERIFIED** | Runbook identifies automation retries/attempt limits as remaining DB-backed coverage; add explicit assertions. |
| Blocking incident → resolution → resumed process | [Goods Receipt integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/goods-receipt.integration.spec.ts) · [Process Control integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/process-control.integration.spec.ts) | Warehouse + backend owners | **PASS — CI only; scenario crosswalk NOT VERIFIED** | Show blocked state, refusal, resolution and successful continuation in DB-backed assertions. |
| Warehouse cross-tenant reads and audit/evidence verification | [Goods Receipt integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/goods-receipt.integration.spec.ts) · [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Security + warehouse owners | **NOT VERIFIED** | Explicit cross-tenant DB tests and persisted evidence/audit assertions. |

## D. Process Book

| Check | Evidence | Proposed owner | Status | Evidence needed |
|---|---|---|---|---|
| Definition creation and invalid-process rejection | [Process Control integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/process-control.integration.spec.ts) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Process owner + backend owner | **PASS — CI only** | Retain DB-backed success/failure assertions. |
| Draft → pilot → approved lifecycle and approved-version immutability | [Process Control integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/process-control.integration.spec.ts) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Process owner | **PASS — CI only** | Verify lifecycle gates, content hash and immutability assertions; require process-owner sign-off before pilot. |
| Step ordering, evidence requirements and out-of-order refusal | [Process Control integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/process-control.integration.spec.ts) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Process owner + QA | **PASS — CI only** | Confirm refusal and evidence-validation assertions against PostgreSQL. |
| Blocking incident refusal, solution recording and change proposal/review | [Process Control integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/process-control.integration.spec.ts) · [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Process owner + backend owner | **NOT VERIFIED** | Runbook names `proposeSolution` / `reviewChange` among remaining DB-backed coverage. |
| Outcome rules, idempotent business key and audit trail | [Process Control integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/process-control.integration.spec.ts) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Process owner + QA | **PASS — CI only; scenario crosswalk NOT VERIFIED** | Preserve evidence for repeated business-key calls, outcomes and audit event persistence. |
| Automation retries and attempt limits | [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) · [CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Backend owner | **NOT VERIFIED** | Explicit database-backed tests are listed as outstanding in the runbook. |
| Process Control cross-tenant reads | [Process Control integration spec](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/backend/test/integration/process-control.integration.spec.ts) · [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Security owner | **NOT VERIFIED** | Add explicit cross-tenant DB-backed read/refusal assertions. |

## E. Road and last-mile

| Check | Evidence | Proposed owner | Status | Evidence needed |
|---|---|---|---|---|
| Quote/order → collection → assignment → driver execution | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) · [repository backend docs](BACKEND.md) | Road operations + QA | **NOT VERIFIED** | End-to-end journey with persisted state and named test environment. |
| Proof of collection → transit events → delivery/POD | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) · [repository backend docs](BACKEND.md) | Road operations + QA | **NOT VERIFIED** | Event sequence, POD evidence, persistence and audit trail. |
| Failed delivery → reschedule/return → customer tracking | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) · [repository backend docs](BACKEND.md) | Road operations + customer ops | **NOT VERIFIED** | Failed-delivery recovery and authorized customer-view evidence. |
| Invoice/payment journey | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) · [repository backend docs](BACKEND.md) | Finance + QA | **NOT VERIFIED** | Reconciled invoice/payment status with tenant authorization. |
| Offline driver behavior and duplicate event handling | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Mobile + integration owners | **NOT VERIFIED** | Offline/reconnect and idempotent replay tests on supported clients. |
| Customer portal authorization and tenant isolation | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Security + customer-portal owners | **NOT VERIFIED** | Cross-tenant and resource-bound token tests in a deployed staging environment. |

## F. Warehouse, forwarding and ports

| Check | Evidence | Proposed owner | Status | Evidence needed |
|---|---|---|---|---|
| Inventory, stock movement and cycle counts | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) · [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Warehouse owner + QA | **NOT VERIFIED** | Existing-data regression and reconciliation evidence after the reviewed migration. |
| Pick/pack/dispatch and cross-docking | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Warehouse owner + QA | **NOT VERIFIED** | Complete operational path, inventory invariants and exception tests. |
| Forwarding shipment file and customs declaration/document workflow | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Forwarding owner + QA | **NOT VERIFIED** | Database-backed document/status workflow and authorization tests. |
| Integration/webhook retries | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) · [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Integration owner | **NOT VERIFIED** | Duplicate/retry, partial failure, attempt-limit and recovery evidence. |
| Port/terminal hand-off contracts where implemented | [current CI run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Forwarding owner | **NOT VERIFIED** | Contract and test environment evidence; do not claim SARS, TEMS, IIMS or terminal connectivity without an actual contract and test environment. |

## G. Rail non-production vertical

| Check | Evidence | Proposed owner | Status | Evidence needed |
|---|---|---|---|---|
| Source registry: official source, retrieval URL/date, binary/hash and effective periods | [Rail source register at PR head](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md) | Rail source owner | **GATED / VALIDATION REQUIRED** | Obtain the official PDF/workbook and complete provenance/hash/retrieval evidence; preserve V4 periods separately from workbook periods. |
| Network master → capacity statement → schedule → access seeker/application → evidence/review → pre-screen → handover | [Rail source register](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md) | Rail product owner | **GATED — not implemented for production** | Approved source and non-production requirements/interfaces first. |
| Formal RAIL-005–RAIL-015 requirement register and traceability matrix | [RAIL requirement register](https://github.com/flowopsaas-glitch/Flowops/blob/arena/01a0e23b-flowops/docs/RAIL-REQUIREMENT-REGISTER-TRACEABILITY-2026-09-27.md) | Rail product owner | **GATED — authored as PROPOSED baseline 2026-09-27; owner approval OPEN** | Requirements and source/interface/test traceability now documented (RAIL-009 undefined; gaps/exc register included). Owner approval + independent review remain; per source register, approval may follow the migration decision. |
| Independent review | [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) | Independent reviewer | **GATED** | Review after the formal register is authored; reviewer must be independent of its author. |
| Interfaces and synthetic fixtures | [Rail source register](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md) | Rail engineering owner | **GATED** | Define contracts and test synthetic fixtures only after source and requirement gates. |
| Capacity ambiguities (0.65 factor, “Line Closed”, floating losses, section markers, mappings, period selectors, section/TQI mismatches) | [Rail source register](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md) | Rail source owner + independent reviewer | **GATED — exceptions, not rules** | Keep as source-review exceptions; do not encode as system behavior before evidence and review. |
| Pilot evidence | [Rail source register](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/RAIL-NETWORK-STATEMENT-V4-SOURCE-REGISTER-2026-09-26.md) | Rail operations owner | **GATED** | Approved non-production pilot and evidence; no production Rail implementation. |

## Security and production go/no-go

| Control | Evidence | Proposed owner | Status | Exit evidence |
|---|---|---|---|---|
| P0 invoice XSS remediation deployed and verified | [CI / Trivy run](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Security + billing owners | **NOT VERIFIED** | Deployment version, exploit regression test and independent security sign-off. |
| Portal resource-bound tokens deployed and cross-tenant tested | [PR #436 CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Security + portal owners | **NOT VERIFIED** | Deployed build and tenant/resource authorization evidence. |
| Default approval password removed; legacy users handled | [PR #436](https://github.com/flowopsaas-glitch/Flowops/pull/436) | Identity owner | **NOT VERIFIED** | Production config audit and controlled legacy-user remediation evidence. |
| AI DevOps fail-closed and AI event tenant scope | [PR #436 CI](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | AI/security owners | **NOT VERIFIED** | Negative tests plus deployed configuration/log evidence. |
| Dependency vulnerability remediation/exception plan | [Trivy CI check](https://github.com/flowopsaas-glitch/Flowops/actions/runs/36306059000) | Security owner | **NOT VERIFIED** | Review actual findings; approved owners, due dates and exceptions. A passing scan alone is not a plan. |
| Historical SSH key rotated | [deployment docs](DEPLOYMENT.md) | Infrastructure owner | **NOT VERIFIED** | Rotation record and confirmation old key is revoked. |
| Backup and rollback tested | [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | DBA + infrastructure owner | **NOT VERIFIED** | Restore verification, rollback procedure and timed rehearsal. |
| Staging smoke, pilot, maintenance window and owner/independent go-no-go | [migration runbook](https://github.com/flowopsaas-glitch/Flowops/blob/7844fffa512965d98e9a4184a7e3d8fe104404bb/docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md) | Release owner + service owner + independent reviewer | **BLOCKED** | All upstream gates closed, named approvals, monitored rollout/rollback plan. |

## Production flag hold

No production environment was inspected or changed in this work. Keep all flags off; the PR documents these defaults/guards, but deployed values still require operator verification:

```text
PROCESS_CONTROL_ENABLED=false
PROCESS_CONTROL_WMS_RECEIPT_ENABLED=false
PROCESS_CONTROL_WMS_RECEIPT_ENFORCE=false
PROCESS_CONTROL_PRODUCTION_ALLOWED=false
PRODUCT_MASTER_ENABLED=false
PRODUCT_MASTER_PRODUCTION_ALLOWED=false
```

Do not change a flag for a demo or to make a test pass.

## Immediate next action

Obtain the actual operator-run rehearsal report for the disposable clone of the existing staging database. The current [report](STAGING-CLONE-REHEARSAL-REPORT.md) is **not that result**: it accurately records that no connection was tested, with overall status `Hold` and rehearsal verdict `unknown`. Do not run `migrate deploy`, `migrate resolve --applied`, `db push`, or any apply mode until the clone evidence supports a reviewed decision. A `blocking` or `unknown` finding requires remediation/backfill planning first.

No PR merge, staging apply or VPS deployment is authorized by this matrix. After a valid migration decision, close the remaining database-backed gaps/backfill dry-runs, then staging/pilot evidence and security review. Only after those gates can an owner and independent reviewer make a production go/no-go.
