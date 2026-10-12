# Digital Train Manifest — Delivered (Compliance & Safety now fully built)

**Date:** 2026-10-12 · **Mandate:** "continue building" → recommended track, executed end to end

The one explicitly named gap in the blueprint's Core Services layer (the gap-analysis
"Compliance & Safety" box: *"a dedicated digital train manifest document form"*) is now
a complete vertical slice: model → rules → API → UI → tests → events.

## The document lifecycle (the law)

```
DRAFT ──issue (signatory)──▶ ISSUED ──depart──▶ DEPARTED ──arrive──▶ ARRIVED ──close (signatory)──▶ CLOSED
  │                             │
  └─cancel──▶ CANCELLED         └─amend──▶ SUPERSEDED ◀── new DRAFT revision (rev+1, same TM number)
```

- **DRAFT is editable** (header + wagon lines, incl. add/remove wagons).
- **ISSUED is immutable** — a signatory attestation with the server-verified identity
  recorded (`"J. Nkosi [verified: Name <email> (ROLE)]"`), same philosophy as an approved
  Process Book version. Corrections only via **Amend**, which creates a new revision and
  supersedes the old row — history is never rewritten.
- **Issue is gated by the shared dangerous-goods evaluator** (the exact engine the
  dispatch gate uses): a manifest can never be issued for a consist that lacks DG
  particulars. Empty consists, missing wagon numbers and negative weights also block.
- Creation **snapshots the consignment consist** into manifest lines; the frozen copy
  never changes when the live wagon register does.

## What shipped

| Layer | Detail |
|---|---|
| Schema | `RailTrainManifest` + `RailTrainManifestWagon`, `RailTrainManifestStatus`; migration `20261012090000_rail_train_manifests` (**11th** migration) |
| Rules | `rail-manifest.rules.ts` (pure) + 7 unit tests |
| Service | numbering `TM-YYYY-NNNNN`, snapshot create, update, issue, amend, depart, arrive, close, cancel — every mutation atomic with its outbox event |
| API | `POST/GET/PATCH /rail/manifests…`; issue/amend/close = **SIGNATORY** roles |
| Events | `rail.manifest.created|issued|amended|departed|arrived|closed|cancelled` (event catalog now 24 names; selectable in Settings → Integrations) |
| UI | **Train Manifests tab** in Rail Ops Console: list, create-from-consignment, draft editor, issue & freeze, lifecycle buttons, cancel-with-reason, **print view** |
| Tests | BE **2,080/2,080** (66 suites) · FE **765/765** (31 files) — incl. 5 panel tests (issue requires signatory, cancel requires reason, departure on issued) |

## Ops notes for the next session / VPS deploy

1. Migration #11 applies automatically via `./deploy/vps-deploy.sh` (`prisma migrate deploy`).
2. The full chain is now: **slot application → possession → train manifest → weighbridge → daily handshake → dispute**, each step evidenced and eventing.

## Environment incident (recorded honestly)

The sandbox snapshot mechanism rewound `.git` to the branch base mid-round and deleted
`node_modules`/engine caches. No file content was lost; the whole workspace was
re-committed as `28904e0` (preservation checkpoint) and this slice as `bca2148`. A
fuzzy-edit glitch briefly duplicated a tail block of `schema.prisma`; it was repaired by
line surgery (the file now validates and generates a clean client). If the PR diff looks
large, that checkpoint commit explains it — content equals the previously reviewed state.
