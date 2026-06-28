# SARS EDI Customs Bridge — Implementation Plan

> Build order is incremental: each task compiles and is safe to ship behind the
> existing `freightForwarding` entitlement. The clearing-agent path delivers
> real value first; live EDI paths fail closed (honest) until a tenant supplies
> a working endpoint/VAN.

- [ ] 1. **Data model**
  - [ ] 1.1 Add `CustomsEdiPath`, `CustomsEdiCredentialStatus` enums and
        `CustomsEdiCredential` model to `schema.prisma`.
  - [ ] 1.2 Add `CustomsEdiMessage` model + back-relation on `CustomsDeclaration`
        (`ediMessages`, optional `lodgementProvider`).
  - [ ] 1.3 `prisma generate` + `prisma db push`; verify build.
  - _Requirements: 1, 3, 5_

- [ ] 2. **Crypto utility**
  - [ ] 2.1 `CryptoService` (AES-256-GCM) reading `CUSTOMS_EDI_KEY`; encrypt/
        decrypt + unit tests (round-trip, tamper → auth fail).
  - [ ] 2.2 Document `CUSTOMS_EDI_KEY` in `.env.example` + VPS runbook.
  - _Requirements: 1.2, 5.3_

- [ ] 3. **Credential service + API**
  - [ ] 3.1 `CustomsEdiCredentialService.upsert/getMasked/decryptFor`.
  - [ ] 3.2 Controller: `GET`/`PUT /forwarding/customs/edi/credential`
        (entitlement + admin guard; masked reads).
  - [ ] 3.3 Audit every create/update; strict `companyId` scoping + cross-tenant
        denial test.
  - _Requirements: 1, 4, 5_

- [ ] 4. **Transport abstraction**
  - [ ] 4.1 Define `CustomsEdiTransport` interface + `CustomsEdiTransportResult`.
  - [ ] 4.2 `NullCustomsEdiTransport` (preserves honest stub behaviour).
  - [ ] 4.3 `ClearingAgentHandoffTransport` — render SAD500 + docs (reuse
        `forwarding-pdf.service`), notify `agentEmail`, `lodged:false`.
  - [ ] 4.4 `CustomsEdiTransportFactory.resolve(companyId)`.
  - _Requirements: 2, 6_

- [ ] 5. **Wire `submit()` through the factory**
  - [ ] 5.1 Replace stub body: resolve transport → idempotency check on `lrn` →
        `transmit` → persist OUTBOUND `CustomsEdiMessage`.
  - [ ] 5.2 Set status only when `result.lodged`; otherwise keep `DRAFT` with an
        explicit "not lodged" note.
  - [ ] 5.3 Keep existing AI-event + audit best-effort emits.
  - _Requirements: 3, 6_

- [ ] 6. **Inbound CUSRES handler**
  - [ ] 6.1 `POST /forwarding/customs/edi/callback` with HMAC signature verify.
  - [ ] 6.2 Match by `lrn`/`mrn`, record INBOUND message, call `setStatus`.
  - [ ] 6.3 Fire ops notification + dashboard event (reuse existing bridges).
  - _Requirements: 3.2, 5_

- [ ] 7. **Verify connection**
  - [ ] 7.1 `POST /forwarding/customs/edi/verify` → transport.verify, stamp
        `lastVerifiedAt`/status, return specific reason on failure.
  - _Requirements: 4_

- [ ] 8. **Service-provider transport (first live path)**
  - [ ] 8.1 `ServiceProviderEdiTransport` adapter against a VAN REST API using the
        tenant's decrypted key; map CUSDEC payload → provider schema.
  - [ ] 8.2 Contract test against a mock VAN; honesty test (no fake ack).
  - _Requirements: 2, 3, 6_

- [ ] 9. **Direct EDI transport (accreditation-gated)**
  - [ ] 9.1 `DirectSarsEdiTransport` skeleton; fails closed with clear reason
        until a real accredited endpoint is configured.
  - _Requirements: 2, 6_

- [ ] 10. **Frontend — SARS EDI Setup**
  - [ ] 10.1 Customs settings panel: path selector + write-only/masked credential
        fields + honest-status banner.
  - [ ] 10.2 "Verify connection" button with success/failure chip.
  - _Requirements: 1, 4, 6_

- [ ] 11. **Frontend — ShipmentFile customs tab**
  - [ ] 11.1 Submit reflects real lodgement state; show MRN on release.
  - [ ] 11.2 CUSDEC/CUSRES message-log timeline.
  - _Requirements: 3, 6_

- [ ] 12. **Hardening**
  - [ ] 12.1 Tenant-isolation tests across all new endpoints.
  - [ ] 12.2 Confirm bundle-leak guard passes (no secrets client-side).
  - [ ] 12.3 Verify `nest build` + `tsc` + `vite build` clean.
  - _Requirements: 5, 6_
