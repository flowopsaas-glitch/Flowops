# SARS EDI Customs Bridge — Design

## Overview

The bridge replaces the clearly-marked stub in
`CustomsDeclarationService.submit()` with a **pluggable, per-tenant transport
layer**. The existing declaration build pipeline (`buildForFile` → CUSDEC-style
`payload` → estimate totals) is unchanged; we add (1) per-tenant credential
storage, (2) a transport strategy resolved from those credentials, (3) a message
log for audit + idempotency, and (4) an inbound CUSRES handler.

Design principle: **FlowOps formats and routes; the tenant's
accreditation/agent/provider transmits.** No platform-wide SARS credential
exists anywhere in the system.

```
ShipmentFile ──► buildForFile() ──► CustomsDeclaration (DRAFT, payload, lrn)
                                          │
                              submit(companyId, id)
                                          │
                      CustomsEdiTransportFactory.resolve(companyId)
                                          │
        ┌───────────────┬────────────────┴───────────────┬──────────────────┐
        ▼               ▼                                 ▼                  ▼
 DirectSarsEdi   ServiceProviderEdi              ClearingAgentHandoff     Null
 (tenant is      (tenant API keys to a           (generate SAD500 +       (no creds:
  registered      SARS-approved VAN)              docs, notify agent)      honest
  EDI user)                                                                fallback)
        └───────────────┴────────────────┬───────────────┴──────────────────┘
                                          ▼
                       CustomsEdiMessage (OUTBOUND CUSDEC)  +  status=SUBMITTED
                                          │
                       CUSRES (inbound webhook / poll)
                                          ▼
              setStatus(RELEASED|QUERY|REJECTED) + mrn  +  CustomsEdiMessage (INBOUND)
```

## Data model (Prisma)

### New: `CustomsEdiCredential` (one active per tenant)
```prisma
enum CustomsEdiPath {
  DIRECT_EDI            // tenant is a registered SARS EDI user
  SERVICE_PROVIDER      // tenant uses a SARS-approved VAN / EDI service provider
  CLEARING_AGENT_HANDOFF// no live wire — package handed to the tenant's agent
}

enum CustomsEdiCredentialStatus { UNVERIFIED  VERIFIED  DISABLED }

model CustomsEdiCredential {
  id              String   @id @default(cuid())
  companyId       String
  path            CustomsEdiPath
  status          CustomsEdiCredentialStatus @default(UNVERIFIED)

  customsClientCode String?          // tenant's SARS CCN (not secret, used on the SAD)
  providerName      String?          // e.g. VAN/provider label or agent name
  endpointUrl       String?          // provider gateway / agent webhook
  agentEmail        String?          // CLEARING_AGENT_HANDOFF target

  // Secret material — AES-256-GCM, never returned to clients
  secretCiphertext  String? @db.Text
  secretIv          String?
  secretAuthTag     String?

  lastVerifiedAt  DateTime?
  createdBy       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([companyId])             // one credential record per tenant
  @@map("customs_edi_credentials")
}
```

### New: `CustomsEdiMessage` (audit + idempotency)
```prisma
model CustomsEdiMessage {
  id            String   @id @default(cuid())
  declarationId String
  declaration   CustomsDeclaration @relation(fields: [declarationId], references: [id], onDelete: Cascade)
  companyId     String
  direction     String   // OUTBOUND | INBOUND
  messageType   String   // CUSDEC | CUSRES | VERIFY
  status        String   // SENT | ACK | ERROR | RECEIVED
  reference     String?  // provider/SARS message ref
  payload       Json?
  error         String?  @db.Text
  createdAt     DateTime @default(now())

  @@index([declarationId])
  @@index([companyId, createdAt])
  @@map("customs_edi_messages")
}
```

### Extend `CustomsDeclaration`
Add a back-relation `ediMessages CustomsEdiMessage[]` and (optional)
`lodgementProvider String?` to record which path actually transmitted. The
existing `lrn` is the idempotency key; `mrn` holds the SARS reference.

## Components

### `CustomsEdiTransport` (interface)
```ts
export interface CustomsEdiTransportResult {
  accepted: boolean;
  reference?: string;     // provider/SARS message ref
  lodged: boolean;        // TRUE only if a real SARS ack was returned
  note: string;           // human-readable, honest status
}

export interface CustomsEdiTransport {
  readonly path: CustomsEdiPath;
  verify(cred: DecryptedCredential): Promise<{ ok: boolean; reason?: string }>;
  transmit(cred: DecryptedCredential, declaration: CustomsDeclaration):
    Promise<CustomsEdiTransportResult>;
}
```

### Implementations
- **`DirectSarsEdiTransport`** — formats the CUSDEC from `declaration.payload`
  and transmits via the tenant's registered EDI gateway details. Marked
  `lodged: true` only on a genuine ack. *(Wire format requires SARS EDI
  accreditation; until a real endpoint is supplied this returns
  `accepted:false, lodged:false` with an explicit reason.)*
- **`ServiceProviderEdiTransport`** — calls a SARS-approved VAN/provider REST API
  using the tenant's API key (decrypted per-call). Provider adapter pattern so
  multiple VANs can be added.
- **`ClearingAgentHandoffTransport`** — renders the SAD500 data + supporting docs
  (reuse `forwarding-pdf.service`), emails/notifies `agentEmail`, sets a note
  "Handed to clearing agent — not yet lodged with SARS". `lodged: false`.
- **`NullCustomsEdiTransport`** — no credential configured. Returns
  `accepted:false, lodged:false, note:"No SARS transmission method configured."`
  Preserves today's honest stub behaviour.

### `CustomsEdiTransportFactory`
Resolves the tenant's `CustomsEdiCredential.path` to the matching transport
(or `NullCustomsEdiTransport`). Pure lookup — the declaration workflow never
branches on provider type.

### `CustomsEdiCredentialService`
- `upsert(companyId, dto)` — encrypts secret (AES-256-GCM with `CUSTOMS_EDI_KEY`
  env), persists, audits.
- `getMasked(companyId)` — returns config with secrets masked (`••••last4`).
- `decryptFor(companyId)` — internal-only; returns `DecryptedCredential`.
- `verify(companyId)` — resolves transport, calls `verify()`, stamps
  `lastVerifiedAt` + status `VERIFIED`/`UNVERIFIED`.

### Crypto
`CryptoService.encrypt/decrypt` using `crypto.createCipheriv('aes-256-gcm', key, iv)`.
Key from `CUSTOMS_EDI_KEY` (32-byte, base64) — required only when a tenant uses
`DIRECT_EDI`/`SERVICE_PROVIDER`. Absence → only `CLEARING_AGENT_HANDOFF`/`Null`
available (no secrets to protect).

## Sequence — submit

1. `submit(companyId, id)` loads the `DRAFT`/`REJECTED` declaration (existing
   guard keeps `SUBMITTED/QUERY/RELEASED` from re-lodging).
2. Factory resolves transport from the tenant credential.
3. Idempotency check: if an OUTBOUND `CUSDEC` message with this `lrn` already
   has `status ACK`, abort with conflict.
4. `transport.transmit(cred, declaration)`.
5. Persist OUTBOUND `CustomsEdiMessage` (SENT→ACK/ERROR).
6. IF `result.lodged` → status `SUBMITTED`, note = result.note.
   ELSE → status stays `DRAFT`, note explicitly says not lodged + next action.
7. Emit AI event + audit entry (best-effort).

## Sequence — CUSRES (inbound)

1. Provider webhook `POST /forwarding/customs/edi/callback` (HMAC-verified) OR a
   scheduled poll for `SERVICE_PROVIDER`.
2. Match by `lrn`/`mrn`; record INBOUND `CustomsEdiMessage`.
3. `setStatus(RELEASED|QUERY|REJECTED, mrn, note)` (existing method).
4. Notify ops (existing notifications/events bridges) + audit.

## API surface (additions)
- `GET  /forwarding/customs/edi/credential` → masked config
- `PUT  /forwarding/customs/edi/credential` → upsert (entitlement + admin guarded)
- `POST /forwarding/customs/edi/verify` → connection test
- `POST /forwarding/customs/edi/callback` → provider CUSRES webhook (HMAC, public-but-signed)
- (existing) `POST /forwarding/declarations/:id/submit` now routes through the factory

## Frontend
- **Forwarding ▸ Customs ▸ SARS EDI Setup** panel: path selector, credential
  fields (write-only/masked), "Verify connection" button with result chip,
  prominent honest-status banner.
- **ShipmentFile ▸ Customs tab**: submit button reflects real lodgement state;
  shows MRN once released; message-log timeline (CUSDEC/CUSRES).

## Error handling
- Transport/network errors → declaration stays `DRAFT`, ERROR message logged,
  specific reason surfaced (never a generic 500).
- Webhook signature mismatch → 401, logged, no state change.
- Missing `CUSTOMS_EDI_KEY` when a secret path is selected → config error at
  save time, not at submit time.

## Security & compliance
- AES-256-GCM at rest; secrets never serialized to clients or logs; bundle-leak
  guard already enforces no secrets in frontend.
- Strict `companyId` scoping on every query (consistent with the tenant-isolation
  audit, PR #175/#180).
- POPIA: credentials + message logs are tenant-owned data; retained per customs
  record-keeping rules; deletable on tenant offboarding.
- Entitlement gate: `freightForwarding` + admin/customs permission.

## Testing strategy
- Unit: crypto round-trip; factory resolution per path; idempotency guard;
  Null/Handoff transports return `lodged:false`.
- Integration: submit → OUTBOUND message + correct status per `lodged`; webhook
  → status + INBOUND message; cross-tenant credential access denied.
- Contract: `ServiceProviderEdiTransport` against a mock VAN.
- Honesty: assert no path except a genuine ack ever sets a "lodged with SARS"
  message.

## Honest boundaries (explicit)
- FlowOps is **not** SARS-accredited and is **not** the declarant.
- `DIRECT_EDI` and `SERVICE_PROVIDER` only transmit live when the tenant supplies
  a working accredited endpoint / VAN account; until then they fail closed with a
  clear reason — they never fake an ack.
- The always-available value is the **clearing-agent package** path: a compliant
  SAD500 + document bundle the tenant's agent lodges. This is genuinely useful
  and fully honest.
