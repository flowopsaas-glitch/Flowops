# SARS EDI Customs Bridge — Requirements

## Introduction

FlowOps Freight Forwarding already models the South African customs declaration
lifecycle (`CustomsDeclaration`: `lrn`, `mrn`, CUSDEC-style `payload`, status
`DRAFT → SUBMITTED → QUERY → RELEASED → REJECTED`). What is missing is the
**transmission layer** — getting a declaration to SARS and capturing the
response.

The defining constraint, confirmed with the platform owner: **FlowOps holds no
SARS credentials and is never the legal declarant.** The tenant (the registered
importer/exporter, or their licensed clearing agent) is the party that handles
the goods, owns the customs client code, and pays the duty/VAT. Therefore the
bridge is a **per-tenant, bring-your-own-credentials (BYO), provider-agnostic**
layer: FlowOps formats and routes the declaration; the tenant's accreditation,
appointed clearing agent, or approved EDI service provider transmits it.

This is both the compliant model and the commercial moat: no SA-native, AI-first
platform offers an affordable customs bridge for the small/mid forwarders being
squeezed by incumbent per-transaction pricing.

### Glossary
- **SAD500 / CUSDEC** — the customs declaration message lodged with SARS.
- **CUSRES** — SARS's response message (accepted / query / release / reject).
- **LRN** — Local Reference Number (our side, idempotency key).
- **MRN** — Movement/customs Reference Number (assigned by SARS).
- **Customs Client Code (CCN)** — the tenant's SARS importer/exporter code.
- **VAN / EDI service provider** — a SARS-approved gateway that relays messages.

---

## Requirements

### Requirement 1 — Per-tenant BYO credentials
**User story:** As a forwarding tenant, I want to configure my own SARS customs
transmission method, so that declarations are lodged under my legal standing and
FlowOps never holds my credentials platform-wide.

#### Acceptance criteria
1. WHEN a tenant admin opens Customs settings THEN the system SHALL let them
   choose exactly one transmission path: `DIRECT_EDI`, `SERVICE_PROVIDER`, or
   `CLEARING_AGENT_HANDOFF`.
2. WHEN a tenant saves credentials THEN the system SHALL store them encrypted at
   rest (AES-256-GCM) and SHALL NOT return secret values to any client (mask on
   read).
3. WHEN no transmission path is configured for a tenant THEN `submit()` SHALL
   degrade gracefully to producing a clearing-agent package and SHALL clearly
   mark the declaration as "not lodged with SARS".
4. The system SHALL scope every credential strictly to its `companyId`; a tenant
   SHALL never read or use another tenant's credentials.

### Requirement 2 — Provider-agnostic transmission
**User story:** As a forwarder, I want FlowOps to transmit my declaration through
whatever channel I use, so that I am not locked to one vendor.

#### Acceptance criteria
1. The system SHALL define a single `CustomsEdiTransport` interface with
   pluggable implementations per path.
2. WHEN a declaration is submitted THEN a factory SHALL resolve the tenant's
   configured transport and invoke it; adding a new provider SHALL NOT require
   changes to the declaration workflow.
3. WHEN the resolved transport is `CLEARING_AGENT_HANDOFF` THEN the system SHALL
   generate the SAD500 data + supporting documents and notify the nominated
   agent, WITHOUT attempting a live SARS connection.

### Requirement 3 — Declaration transmission & response lifecycle
**User story:** As an operator, I want to submit a declaration and see SARS's
response reflected on the file, so that I know when cargo is released.

#### Acceptance criteria
1. WHEN a `DRAFT` (or `REJECTED`) declaration is submitted THEN the system SHALL
   transmit a CUSDEC message, set status `SUBMITTED`, and record an OUTBOUND
   message log entry.
2. WHEN a CUSRES is received (webhook or poll) THEN the system SHALL update
   status to `RELEASED`, `QUERY`, or `REJECTED`, persist the `mrn` and response
   note, and record an INBOUND message log entry.
3. WHEN a declaration is already `SUBMITTED`, `QUERY`, or `RELEASED` THEN a
   repeat submit SHALL be rejected (no double-lodgement).
4. The system SHALL use the `lrn` as an idempotency key so a retried transmission
   never produces a duplicate SARS lodgement.

### Requirement 4 — Connection verification
**User story:** As a tenant admin, I want to test my customs connection before
relying on it, so that I find misconfiguration early.

#### Acceptance criteria
1. WHEN a tenant clicks "Verify connection" THEN the system SHALL perform a
   non-mutating health/auth check against the configured provider and report
   success or a specific failure reason.
2. The verification SHALL NOT lodge any declaration.

### Requirement 5 — Audit, security & compliance
**User story:** As a compliance owner, I want every customs action logged and
credentials protected, so that we meet POPIA and customs record-keeping duties.

#### Acceptance criteria
1. The system SHALL write an audit entry for every credential create/update,
   submit, verify, and status change (actor, tenant, timestamp).
2. The system SHALL retain CUSDEC/CUSRES message logs per declaration for the
   statutory record-keeping period.
3. Secret material SHALL be encrypted at rest and SHALL never appear in logs,
   API responses, or the frontend bundle.
4. The system SHALL enforce that only tenant roles with the `forwarding`
   entitlement and an admin/customs permission can manage credentials or submit.

### Requirement 6 — Honest integration boundaries
**User story:** As the platform owner, I must never misrepresent a regulated
integration, so that tenants trust the system.

#### Acceptance criteria
1. WHERE a live SARS channel is not actually connected THEN every relevant UI and
   API response SHALL state plainly that the declaration was not lodged with
   SARS and what the tenant must do.
2. The system SHALL NOT claim "submitted to SARS" unless a real transport
   returned a SARS acknowledgement.
