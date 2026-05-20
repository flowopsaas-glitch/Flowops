# FlowOps legal templates

The files in this folder are **draft legal-technical templates** for South African SaaS operators in logistics. They are **not legal advice** and are **not a substitute** for review by a qualified attorney (including Popia compliance, consumer law, and sector-specific liability).

| File | Purpose |
|------|--------|
| `TERMS_OF_SERVICE.md` | Subscription / usage terms, liability caps, logistics context, SLA-style availability, dispute resolution. |
| `PRIVACY_NOTICE_POPIA.md` | Operator privacy notice: lawful basis, data subjects’ rights, security, cross-border transfers, complaints. |

**Versioning:** When your counsel approves changes, bump the version in `frontend/src/legal/termsMeta.ts` and `backend/src/legal/termsMeta.ts` (keep them identical) so the login “accept terms” gate can require re-acceptance.

## Platform controls (engineering — not legal)

| Variable | Purpose |
|----------|--------|
| `FLOWOPS_ALLOWED_DEPLOYMENT_IDS` | Optional comma-separated allow-list of deployment IDs. |
| `FLOWOPS_DEPLOYMENT_ID` | Set on each production host to match the allow-list. |
| `FLOWOPS_LICENSE_STRICT` | `true` / `1` → mismatch or missing ID **exits** the API process at startup when an allow-list is configured. |
| `FLOWOPS_PLATFORM_SUSPEND` | `true` / `1` → returns **503** for non-public routes (auth, legal, health stay available). |
| `FLOWOPS_TENANT_LIMITS_JSON` | Optional JSON map of plan → numeric limits for future enforcement (`GET /api/legal/tenant-limits`). |

## Terms acceptance persistence (product)

- **Tenant users (Prisma):** On successful `POST /api/auth/login`, when the client sends `acceptedTermsVersion` and `acceptedTermsAt`, the API updates that user’s `termsAcceptedVersion` and `termsAcceptedAt` on the `User` table (see migration `20260419120000_add_user_terms_acceptance`). Run `npx prisma migrate deploy` (or `migrate dev`) on each environment.
- **Platform owner:** There is no `User` row for the super-owner login. Acceptances are appended to `backend/data/owner-terms-acceptance.json` (`last` + rolling `history`, capped at 50 entries). Treat this file as **sensitive operational data** and restrict filesystem access on the server.
