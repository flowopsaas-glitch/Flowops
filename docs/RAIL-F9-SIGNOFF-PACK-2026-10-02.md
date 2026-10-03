# F-9 sign-off pack — owner + independent reviewer (2026-10-02)

Closes gate **F-9** of `docs/RAIL-PRICING-RELEASE-GATES-2026-10-02.md`.
Branch: `arena/01a0fbb8-flowops`. PR #442 (supersedes #441).

## 0. Rule (binding)

F-9 passes **only when both humans sign every part below**: the **owner** and an
**independent reviewer** (a second person who did not author the release).
No matrix row may move above `UNVERIFIED` without both signatures.

- **Signing authorises:** the F-8 synthetic pilot to proceed, and — where Part 1
  says so — rows to move to `APPROVED_FOR_PILOT` under matrix §4.
- **Signing does NOT authorise:** production pricing, any
  `APPROVED_FOR_PRODUCTION` status, closing any exception without its Transnet
  source location, or merging / deploying (F-10 stays gated on F-8 too).

## 0.1 Solo-operator adaptation (only if no second human exists)

The two-person rule (§0) is the preferred control. If the operating team is one
person, that person may proceed **only** by signing here, accepting the residual
risk in writing, and meeting every compensating control:

- a. The owner signs BOTH the owner and reviewer blocks in Parts 1–3 and §4,
  marking the reviewer blocks "solo-operator — same person, independence waived".
- b. The first-party adversarial review (§6) is attached. It is supporting
  evidence, NOT independent review — the agent authored the release.
- c. Gates F-1–F-7 stay PASS (objective, automated controls — they take nobody's word).
- d. F-8 still runs as a pilot with artifacts — never an approval.
- e. This release cannot move money: every real calculation is BLOCKED by code
  (Part 1), so the waived control gates dormant code paths, not pricing.

☐ I am the sole operator. No second human is available. I sign both roles, I
accept the residual risk, and I will seek independent review before any real
rate is ever marked VERIFIED.
SIGNATURED in chat 2026-10-03 by **Kader** (sole operator, 09:44 SAST assumed — to correct if UTC). Reviewer blocks throughout = same person, independence waived per §0.1.

How to sign: each party fills their block in Parts 1–3 and the signature page
(§4) with name + UTC date + signature (handwritten scan or SSO-attested
approval reference — record which). The agent then records F-9 PASS and files
this pack's reference in the matrix §5 change log. Unsigned = gate stays open.

## Part 1 — Pricing-source matrix §4 (enforcement)

Source: `docs/RAIL-PRICING-SOURCE-MATRIX-2026-10-02.md` (§4 + §5).

**Stated position (2026-10-02, unchanged by this release):**

- Every pricing row (P-01…P-18) is `UNVERIFIED`; every unavailable Transnet
  document is `UNKNOWN`. No prices invented.
- `TARIFF_SCHEDULE_CATALOG` is empty; the calculator (`pickSchedule`) uses only
  `VERIFIED` schedules with a positive loaded rate — anything else is `BLOCKED`
  with reasons and nothing is saved.
- Unpriced lines carry `amountZar: null`; subtotals cover priced lines only;
  status `INCOMPLETE`; invoice draft refused.
- Frontend renders `Not priced` for `amountZar === null` — never `R0.00`.
- The seeder never downgrades `VERIFIED`, never overwrites a `PUBLISHED` rate
  with a catalogue null, never reactivates a deactivated row, and lists every
  rate change before applying.
- Real corridors today: `hasVerifiedLoadedRate: false` on all 6 → every real
  calculation `BLOCKED`.

| # | Statement | Owner (confirm) | Reviewer (confirm) |
| --- | --- | --- | --- |
| 1.1 | The register accurately describes what Transnet material was and was not supplied | ☐ + initials/date | ☐ + initials/date |
| 1.2 | The enforcement above matches the code (schedule picker, validator, seeder guards, frontend null handling) | — (owner notes) | ☐ + initials/date |
| 1.3 | No row moves above `UNVERIFIED` today; pilot-only approvals, if any, are recorded in matrix §5 with both signatures | ☐ + initials/date | ☐ + initials/date |

## Part 2 — Exceptions closure log

Source: `docs/RAIL-PRICING-EXCEPTIONS-2026-10-02.md` (rule + closure log).

**Rule restated:** an exception is `OPEN` until **all three** exist: (1) the
Transnet source location, (2) owner sign-off, (3) reviewer sign-off. `OPEN`
exceptions keep their matrix rows `UNVERIFIED` and their outputs
`NOT_PRICED` / `BLOCKED`. A draft invoice touching an `OPEN` exception is refused.

**Stated position: all OPEN, closure log empty.** No exception closes on assumption.

| Exception | One-line question | Closes today? |
| --- | --- | --- |
| EXC-039 | 0.65 capacity factor universal or route-specific? | NO — open |
| EXC-040 | Which FY / timetable period does each priced figure belong to? | NO — open |
| EXC-041 | What do section markers (I)/(E)/(S)/(N) mean? | NO — open |
| EXC-042 | Fractional/negative "trains lost" — what methodology? | NO — open |
| EXC-043 | Confirmed route→corridor map? | NO — open |
| EXC-044 | Ancillary rates + unit methodology (incl. 8× TBD)? | NO — open |
| EXC-045 | Effective from/to per price row? | NO — open |
| EXC-046 | Penalty rate + corrected-overload chargeability + Annexure 22 rules? | NO — open |
| EXC-047 | NS vs annexure/workbook mismatches reconciled per sub-item? | NO — open |
| EXC-048 | Explicit closed/open attribute per section per period? | NO — open |
| EXC-001/007/012/020/025/037/030/031 | Prior gating items (capacity wording, `xx` thresholds, 29b vintage, corridor map, Annexure 40 no-prices, yards/corridor data, no c/GTK rates) | NO — open |

| # | Statement | Owner | Reviewer |
| --- | --- | --- | --- |
| 2.1 | No exception closes today; the `OPEN` list above is complete to my knowledge | ☐ + initials/date | ☐ + initials/date |
| 2.2 | I understand `OPEN` exceptions block their matrix rows and any invoice draft touching them | ☐ + initials/date | ☐ + initials/date |

## Part 3 — Decisions D20–D28

Source: `docs/RAIL-RASA-AUDIT-2026-10-02.md` §5.10. Confirm each default or record
an amendment (amendments return to the branch — the release does not proceed on
amended decisions until code/docs match).

| # | Decision | Default taken | Owner | Reviewer |
| --- | --- | --- | --- | --- |
| D20 | Financial year 1 Apr–31 Mar (SAST); caller may override | as stated | ☐ confirm / amend: ___ | ☐ confirm / amend: ___ |
| D21 | 8.50% / 4.42% escalations opt-in, earlier-year rates only, never on penalties | opt-in, recorded, unverified | ☐ | ☐ |
| D22 | Diesel at brief's R24.64/L when nothing loaded/entered | used, with warning | ☐ | ☐ |
| D23 | Corrected-before-departure overload carries no penalty line | warning asks owner | ☐ | ☐ |
| D24 | Registered vs entered axle count differ → smaller applies | as W4-2 | ☐ | ☐ |
| **D25** | **VAT on rail charges — standard / zero-rated / exempt?** (no rate set; platform default 15% applies at finalisation unless decided) | **owner must decide** | ☐ standard / zero / exempt: ___ | ☐ countersign |
| D26 | No manual hold override; only re-weigh within limit lifts it | as §5.5 | ☐ | ☐ |
| D27 | One draft per calculation; one lump-sum line per charge; `INCOMPLETE` never invoiced | as §5.6 | ☐ | ☐ |
| D28 | Reference-data seeder optional (6 corridors, 82 codes, 113 lines, **0 schedules**); API serves code catalogues until it runs | optional, gated | ☐ | ☐ |

D25 is called out by deployment-checklist item A4: the release prices nothing
until tariff rates are supplied, and VAT treatment must be decided before any
real invoice — not during the pilot.

## 4. Signature page

**Owner.** I have read Parts 1–3, I confirm the statements I initialled, and I
understand what my signature does and does not authorise (§0).

- Name (print): **Kader** Date (UTC): **2026-10-03** Signature / approval ref: **chat-signed (Parts 1–3 confirmed, no amendments; D25 pending)**

**Independent reviewer (solo-operator: same person, waived per §0.1).** Independence statement N/A —'s authorship. I have
checked Part 1.2 against the code and Parts 1–3 against the cited documents, I
confirm the statements I initialled, and I understand §0.

- Name (print): ______________________ Date (UTC): __________ Signature / approval ref: ______________________

## 6. First-party adversarial review (supporting — not independent)

Conducted 2026-10-02 by the release agent against §0.1(b). Method and limits
stated honestly: 153 files / +27.5k lines cannot be re-read line-by-line here;
breadth is carried by CI (Backend incl. real engines, E2E, Trivy, drift guard —
10/10 green on the tip) and the suites. This review targeted the money paths
and the release envelope structurally:

| # | Check | Result |
| --- | --- | --- |
| R-1 | Secrets: tracked secret-adjacent files; private-key/cert patterns in added lines | PASS — none found |
| R-2 | Blast radius: `backend/src` subdirs touched | PASS — rail (73), ai (10), audit (2), common (1 new decorators file). No auth/billing/payment/user modules |
| R-3 | Envelope: compose/Dockerfiles/deploy untouched; exactly 5 migrations; `.env` examples gain only commented fail-closed switches | PASS |
| R-4 | `pickSchedule` uses only VERIFIED + positive loaded rate | PASS — `rail-tariff.rules.ts:292` |
| R-5 | BLOCKED refused at save; INCOMPLETE refused at invoice draft; preview saves nothing; client name required | PASS — `rail-tariff.service.ts:188-189`, `:266`, `:171-175`, `:270` |
| R-6 | Frontend renders null/undefined/NaN/Infinity as "Not priced", never R0.00 (explicit trap-avoidance + tests) | PASS — `railTariff.ts:21`, `railTariff.test.ts:19-29` |
| R-7 | Pack accuracy: EXC ids complete vs exceptions doc; D20–D28 exact match vs audit §5.10 | PASS |
| R-8 | `024b420` time-bomb fix is spec-only | PASS — 1 spec file |

Verdict: no blocking findings. Residual risks (unchanged, already on record):
backup cadence is ad hoc (fresh pre-release backup mandatory); D25 VAT undecided
until the owner picks; production pricing impossible until VERIFIED rates arrive.

## 5. Effect

When §4 is complete: the agent marks **F-9 PASS** in the release-gates doc,
files this pack's reference in matrix §5, and F-8 may start. If any box is
amended rather than confirmed, the amendment returns to the branch and F-9 stays
open until code and docs match the amended decision.
