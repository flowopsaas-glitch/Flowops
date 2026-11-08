/**
 * Tenant-scope policy — the reviewed decisions behind the scanner.
 *
 * The scanner reports database operations with no `companyId` in their `where`
 * clause. Most of those are not bugs. This file is where each one is either
 * explained or left to fail the build, and every entry carries the reason it
 * exists, because an allowlist without reasons is just a way of hiding things.
 *
 * Two rules keep it honest:
 *   1. A file may be listed only if it is genuinely cross-tenant by design —
 *      platform-owner surfaces, or code that runs before a tenant is known.
 *   2. An entry that no longer matches anything is a dead entry, and `--check`
 *      fails on it. Allowlists rot; this makes the rot visible instead of
 *      accumulating silent exemptions.
 */

/**
 * Files that operate across tenants deliberately.
 *
 * `reason` is required and is printed by the scanner, so a reviewer can argue
 * with the decision rather than with a bare exception.
 */
export const PLATFORM_SCOPE = [
  {
    file: 'src/owner/owner.service.ts',
    reason:
      'Platform owner. The whole module exists to act across tenants; scoping it to one company would remove its purpose.',
  },
  {
    file: 'src/okr/okr.service.ts',
    reason:
      "Platform-owner OKRs, not tenant data. The controller is @Controller('owner/okrs') behind OwnerAuthGuard and @OwnerOnly(); a tenant JWT cannot reach these routes, and the Objective/KeyResult models carry no companyId by design.",
  },
  {
    file: 'src/auth/auth.service.ts',
    reason:
      'Identity is resolved here, so there is no tenant yet. Login, token verification and password reset look up by email or token before any company is known.',
  },
  {
    file: 'src/webhooks/webhooks.service.ts',
    reason:
      'Deliveries are dispatched by the platform and keyed by endpoint. A webhook carries no tenant JWT, so the endpoint record is the scope.',
  },
  {
    file: 'src/paystack/paystack.service.ts',
    reason:
      'Payment callbacks arrive with a reference and no tenant context; the payment row is found by reference and carries its own companyId.',
  },
  {
    file: 'src/alerting/alerting.service.ts',
    reason:
      'platformAlert is platform-level, and the sweeps that deactivate companies iterate companies rather than being scoped to one.',
  },
  {
    file: 'src/ai/platform-protection.service.ts',
    reason: 'Platform-wide credential sweeps (expired refresh-token cleanup).',
  },
  {
    file: 'src/ai/integration-sentinel.service.ts',
    reason: 'Monitors integration health across every tenant by design.',
  },
  {
    file: 'src/common/guards/api-health-monitor.service.ts',
    reason:
      'Health probes sample one arbitrary row (take: 1) to check the database is reachable; there is no tenant in a health check.',
  },
];

/**
 * Fields that identify a row before any tenant is known.
 *
 * A lookup by these is how a tenant gets discovered, so the absence of
 * companyId is the point rather than the defect.
 */
export const IDENTITY_FIELDS = [
  'email',
  'emailLower',
  'normalizedEmail',
  'verifyToken',
  'resetToken',
  'ratingToken',
  'reference',
  'token',
  'phone',
  'apiKey',
  'shareToken',
];

/**
 * Operations classified as internal housekeeping rather than tenant reads.
 * Kept explicit so the exemption is a decision and not a default.
 */
export const HOUSEKEEPING_MODELS = ['refreshToken', 'driverRefreshToken', 'ownerRefreshToken'];

/**
 * Individual methods reviewed and accepted, keyed `file#method`.
 *
 * This is the escape hatch, so it is the part most likely to be abused. The
 * rules: the reason must say why the caller can only ever pass a tenant-owned
 * id, and the entry dies (failing --check) the moment the method stops
 * producing findings.
 */
export const METHOD_SCOPE = [
  // ── Driver portal: the tenant is the DRIVER, not a company ────────────────
  // Every one of these is reached as `req.driver.id` from the driver JWT, so
  // the scope is the driver. companyId would be the wrong key here.
  {
    file: 'src/driver-portal/driver-portal.service.ts',
    method: 'updateGps',
    reason: 'Driver portal. The controller passes req.driver.id from the driver JWT; a driver writes their own GPS.',
  },
  {
    file: 'src/driver-portal/driver-portal.service.ts',
    method: 'getModes',
    reason: 'Driver portal, keyed by req.driver.id. Reads the calling driver’s own record and duty.',
  },
  {
    file: 'src/driver-portal/driver-portal.service.ts',
    method: 'getActiveDuty',
    reason: 'Driver portal, keyed by req.driver.id. Reads the calling driver’s own duty.',
  },
  {
    file: 'src/driver-portal/driver-portal.service.ts',
    method: 'getWorkForDuty',
    reason: 'Driver portal, keyed by req.driver.id. Reads the calling driver’s own duty.',
  },
  {
    file: 'src/driver-portal/driver-portal.service.ts',
    method: 'markRead',
    reason:
      'Driver portal. Called only as markRead(req.driver.id), so both the driver lookup and the bulk update are confined to the calling driver. Guarded by the caller, not by companyId.',
  },

  // ── Private continuations of an already-scoped operation ─────────────────
  // These never receive a tenant because their caller already did the scoped
  // read and is handing them a row it owns.
  {
    file: 'src/fleet-maintenance/fleet-maintenance.service.ts',
    method: 'logService',
    reason:
      'Writes keyed by uniqueWhere built from the tenant-scoped logService(companyId, dto) input; the vehicle/driver were resolved in this method.',
  },
  {
    file: 'src/fleet-maintenance/fleet-maintenance.service.ts',
    method: 'predictForDriver',
    reason: 'Private. Called from the tenant-scoped prediction sweep with a driver already resolved inside the company.',
  },
  {
    file: 'src/fleet-maintenance/fleet-maintenance.service.ts',
    method: 'predictNextService',
    reason: 'Private continuation of logService(companyId, dto) — the service row was created in that scoped call.',
  },
  {
    file: 'src/fleet-maintenance/fleet-maintenance.service.ts',
    method: 'updateDriverNextService',
    reason: 'Private continuation of logService(companyId, dto) — the driver was resolved in that scoped call.',
  },
  {
    file: 'src/waybills/waybills.service.ts',
    method: 'aiExtract',
    reason:
      'Private. Only called from uploadInbox(companyId, file) with the id of the inbox row that method just created for that company, and from the deprecated stubExtract. The item cannot be another tenant’s.',
  },
  {
    file: 'src/accounting-integrations/accounting-integrations.service.ts',
    method: 'ensureFreshToken',
    reason: 'Private. Refreshes a connection the caller loaded for its own company; the id never comes from a request.',
  },
  {
    file: 'src/cod/cod-settlement.service.ts',
    method: 'settlementReplay',
    reason:
      'Private idempotency guard inside settleDriver(companyId, …). Looked up by (walletId, idempotencyKey) where the wallet was resolved for that company.',
  },
  {
    file: 'src/forwarding/customs-declaration.service.ts',
    method: 'buildForFile',
    reason: 'Private. Operates on the draft declaration found for the tenant-scoped file in the same call.',
  },
  {
    file: 'src/rail/rail.service.ts',
    method: 'gatherHandoffEvidence',
    reason: 'Private evidence gatherer; the handoff was resolved with companyId by its caller.',
  },

  // ── Platform sweeps: iterate tenants, they are not inside one ────────────
  {
    file: 'src/rail/rail-slot.service.ts',
    method: 'runMobilisationSweep',
    reason: 'Scheduled sweep across all tenants; it iterates companies rather than running inside one.',
  },
  {
    file: 'src/rail/rail-slot.service.ts',
    method: 'runComplianceExpirySweep',
    reason: 'Scheduled sweep across all tenants; it iterates companies rather than running inside one.',
  },
  {
    file: 'src/rail/rail-possession.service.ts',
    method: 'runStatusSweep',
    reason: 'Scheduled sweep across all tenants; it iterates companies rather than running inside one.',
  },
  {
    file: 'src/rail/rail-handshake.service.ts',
    method: 'withRefreshedEscalation',
    reason: 'Internal helper operating on a deviation the caller resolved inside its own company.',
  },

  // ── Public / unauthenticated surfaces: the identifier IS the secret ──────
  {
    file: 'src/logistics-ops/logistics-ops.service.ts',
    method: 'getTrackingTimeline',
    reason:
      'Public tracking. Unauthenticated by design, keyed by tracking number, and selects only journey fields — the absence of companyId is deliberate and documented on the method.',
  },
  {
    file: 'src/whatsapp/whatsapp.service.ts',
    method: 'handleStatusUpdate',
    reason: 'Webhook. Status updates arrive keyed by the external wabaMessageId; there is no tenant JWT on a webhook.',
  },
  {
    file: 'src/whatsapp/whatsapp.service.ts',
    method: 'handleInboundMessage',
    reason:
      'Legacy single-tenant fallback only, gated on !creds.anyConfigured(\'whatsapp\'). In any multi-tenant install the company is resolved from the phone_number_id instead and this branch never runs.',
  },
  {
    file: 'src/push/push.service.ts',
    method: 'removeSubscription',
    reason: 'Push endpoint URLs are unguessable capabilities; delete-by-endpoint is the standard pattern and is how a driver unsubscribes.',
  },
  {
    file: 'src/push/push.service.ts',
    method: 'wakeDriver',
    reason: 'Prunes dead push subscriptions by endpoint while iterating the driver’s own subscriptions.',
  },

  // ── Self-service on own record ───────────────────────────────────────────
  {
    file: 'src/notifications/notifications.service.ts',
    method: 'getPreferences',
    reason: 'Reads the calling user’s own preferences. NotificationPreference is keyed by a unique userId and holds no companyId.',
  },
  {
    file: 'src/companies/companies.service.ts',
    method: 'update',
    reason:
      'Ownership is enforced in the controller: it rejects id !== user.companyId and passes user.companyId, never the URL id. Verified against companies.controller.ts.',
  },
];
