-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'DISPATCH', 'WAREHOUSE', 'AGENT', 'USER', 'DRIVER', 'VIEWER');

-- CreateEnum
CREATE TYPE "WaybillStatus" AS ENUM ('PENDING', 'COLLECTED', 'AT_ORIGIN_HUB', 'IN_TRANSIT', 'AT_DESTINATION_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FailedDeliveryReason" AS ENUM ('CUSTOMER_NOT_HOME', 'CUSTOMER_REFUSED', 'INCORRECT_ADDRESS', 'ADDRESS_NOT_FOUND', 'ACCESS_RESTRICTED', 'BUSINESS_CLOSED', 'NO_SAFE_DROP_LOCATION', 'COD_PAYMENT_UNAVAILABLE', 'DAMAGED_IN_TRANSIT', 'WEATHER_OR_HAZARD', 'VEHICLE_BREAKDOWN', 'OUTSIDE_DELIVERY_WINDOW', 'OTHER');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COLLECTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'ON_ROUTE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('INSTANT', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "OkrStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'BEHIND', 'ACHIEVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KeyResultUnit" AS ENUM ('NUMBER', 'PERCENT', 'CURRENCY');

-- CreateEnum
CREATE TYPE "DriverMode" AS ENUM ('BICYCLE', 'BAKKIE', 'TRUCK', 'LINEHAUL', 'TRAIN');

-- CreateEnum
CREATE TYPE "DriverDutyStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GeneralAverageStatus" AS ENUM ('DECLARED', 'SECURING', 'SECURED', 'ADJUSTED', 'SETTLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GeneralAverageSecurity" AS ENUM ('AVERAGE_BOND', 'INSURER_GUARANTEE', 'CASH_DEPOSIT');

-- CreateEnum
CREATE TYPE "GeneralAverageValueBasis" AS ENUM ('CIF', 'DECLARED', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "FreightMode" AS ENUM ('OCEAN', 'AIR', 'ROAD', 'RAIL');

-- CreateEnum
CREATE TYPE "FreightDirection" AS ENUM ('IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "LoadType" AS ENUM ('FCL', 'LCL', 'BREAKBULK', 'AIR');

-- CreateEnum
CREATE TYPE "ShipmentFileStatus" AS ENUM ('DRAFT', 'BOOKED', 'CARGO_RECEIVED', 'LOADED', 'DEPARTED', 'ARRIVED', 'CUSTOMS_CLEARED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomsDeclarationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'QUERY', 'RELEASED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CustomsEdiPath" AS ENUM ('DIRECT_EDI', 'SERVICE_PROVIDER', 'CLEARING_AGENT_HANDOFF');

-- CreateEnum
CREATE TYPE "CustomsEdiCredentialStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CarrierType" AS ENUM ('OCEAN_LINE', 'AIRLINE', 'ROAD_CARRIER', 'COURIER', 'CUSTOMS_BROKER', 'OTHER');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('OUTSTANDING', 'INVOICED', 'RECOVERED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "CodTransactionType" AS ENUM ('COLLECTION', 'SETTLEMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'RETRYING', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSED', 'RETRYING', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "ClientBillingType" AS ENUM ('COD', 'PREPAID', 'CONTRACT', 'CASH');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('DAMAGED', 'DEFECTIVE', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'MISSING_PARTS', 'NO_LONGER_NEEDED', 'FAILED_DELIVERY', 'LATE_DELIVERY', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnResolution" AS ENUM ('PENDING', 'REFUND', 'REPLACEMENT', 'REPAIR', 'STORE_CREDIT', 'RESTOCK', 'DISPOSE');

-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('RESELLABLE', 'MINOR_DAMAGE', 'DAMAGED', 'UNUSABLE');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'APPLIED', 'VOID');

-- CreateEnum
CREATE TYPE "DebitNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'SETTLED', 'VOID');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "AccountingProvider" AS ENUM ('XERO', 'SAGE', 'PASTEL');

-- CreateEnum
CREATE TYPE "AccountingConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AccountingSyncDocType" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "AccountingSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CourierOrderStatus" AS ENUM ('NEW', 'ASSIGNED', 'DISPATCHED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CourierOrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "WarehouseZoneType" AS ENUM ('RECEIVING', 'BULK', 'PICK', 'PACKING', 'DISPATCH', 'RETURNS', 'COLD', 'HAZMAT', 'QUARANTINE', 'CROSSDOCK');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'PUT_AWAY', 'PICK', 'PACK', 'TRANSFER', 'ADJUSTMENT', 'RETURN_IN', 'DISPATCH', 'CYCLE_COUNT', 'REPLENISH');

-- CreateEnum
CREATE TYPE "PickOrderStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PICKED', 'PACKED', 'DISPATCHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('EXPECTED', 'ARRIVED', 'INSPECTING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CycleCountStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'APPROVED');

-- CreateEnum
CREATE TYPE "MarginExceptionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AllocationProvenance" AS ENUM ('MEASURED', 'ALLOCATED', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "TripCostType" AS ENUM ('FUEL', 'TOLL', 'OTHER');

-- CreateEnum
CREATE TYPE "TripCostSource" AS ENUM ('DRIVER_APP', 'OFFICE', 'IMPORT');

-- CreateEnum
CREATE TYPE "SafetyZoneRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RouteOptimizationStatus" AS ENUM ('PENDING', 'OPTIMIZING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'CONFIGURING');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'MAGENTO', 'CUSTOM_API', 'CSV_IMPORT', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "RoutePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EpodStatus" AS ENUM ('PENDING', 'CAPTURED', 'VERIFIED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "RailConsignmentStatus" AS ENUM ('PLANNED', 'WAGONS_ALLOCATED', 'LOADING', 'DEPARTED', 'IN_TRANSIT', 'AT_INTERCHANGE', 'ARRIVED', 'OFFLOADED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WagonType" AS ENUM ('FLAT', 'GONDOLA', 'TANK', 'BOXCAR', 'HOPPER', 'CONTAINER_CAR');

-- CreateEnum
CREATE TYPE "IntermodalLegMode" AS ENUM ('ROAD', 'RAIL', 'PORT');

-- CreateEnum
CREATE TYPE "IntermodalLegStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'HANDED_OVER', 'COMPLETED', 'DELAYED');

-- CreateEnum
CREATE TYPE "HandoffReadinessStatus" AS ENUM ('DRAFT', 'BLOCKED', 'READY', 'HANDED_OVER');

-- CreateEnum
CREATE TYPE "HandoffEvidenceType" AS ENUM ('RAIL_RELEASE', 'WAREHOUSE_RECEIPT', 'WAYBILL_SCAN', 'CARRIER_ACCEPTANCE', 'COD_RECONCILIATION', 'BILLING_RELEASE');

-- CreateEnum
CREATE TYPE "HandoffEvidenceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RailTrainManifestStatus" AS ENUM ('DRAFT', 'ISSUED', 'DEPARTED', 'ARRIVED', 'CLOSED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RailDeviceKind" AS ENUM ('WAGON_TRACKER', 'LOCO_TELEMATICS', 'WAYBILL_SCANNER', 'PORT_SCANNER');

-- CreateEnum
CREATE TYPE "RailDeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'FAULTY');

-- CreateEnum
CREATE TYPE "RailTelemetryAlertKind" AS ENUM ('SPEED_EXCEEDED', 'BATTERY_LOW', 'DEVICE_SILENT', 'TEMPERATURE');

-- CreateEnum
CREATE TYPE "RailAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "HandshakeReportStatus" AS ENUM ('DRAFT', 'PENDING_TOC', 'SIGNED_OFF', 'DISPUTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DeviationCategory" AS ENUM ('CANCELLATION', 'DELAY', 'NO_SHOW', 'RESCHEDULE', 'INFRASTRUCTURE', 'ROLLING_STOCK', 'OPERATIONAL', 'SECURITY', 'WEATHER', 'OTHER');

-- CreateEnum
CREATE TYPE "ResponsibleParty" AS ENUM ('UNDETERMINED', 'IM', 'THIS_TOC', 'ANOTHER_TOC', 'EXTERNAL', 'FORCE_MAJEURE');

-- CreateEnum
CREATE TYPE "SlotImpact" AS ENUM ('NONE', 'NOT_USED', 'CANCELLED', 'RESCHEDULED', 'DELAYED');

-- CreateEnum
CREATE TYPE "DeviationStatus" AS ENUM ('LOGGED', 'AGREED', 'OPEN', 'RESOLVED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "EscalationStage" AS ENUM ('NONE', 'LIAISON_MANAGER_24H', 'HEAD_LIAISON_48H', 'HEAD_NSPO_72H', 'ROUTE_LOGISTICS_FORUM', 'REGULATOR_DISPUTE');

-- CreateEnum
CREATE TYPE "ProcessLifecycleStatus" AS ENUM ('DRAFT', 'PILOT', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ProcessStepType" AS ENUM ('MANUAL', 'AUTOMATED', 'DECISION', 'INSPECTION', 'APPROVAL', 'HANDOFF', 'WAIT');

-- CreateEnum
CREATE TYPE "ProcessInstanceStatus" AS ENUM ('IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'ABANDONED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProcessStepInstanceStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ProcessIncidentSeverity" AS ENUM ('MINOR', 'MAJOR', 'BLOCKING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProcessIncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ProcessSolutionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'IMPLEMENTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProcessOutcomeStatus" AS ENUM ('COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'ABANDONED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChangeProposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED');

-- CreateEnum
CREATE TYPE "ProductApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "VariantApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "RailGauge" AS ENUM ('CAPE_1067MM', 'NARROW_610MM', 'STANDARD_1435MM');

-- CreateEnum
CREATE TYPE "RailElectrification" AS ENUM ('DC_3KV', 'AC_25KV', 'AC_50KV', 'DIESEL');

-- CreateEnum
CREATE TYPE "RailVehicleProfile" AS ENUM ('A', 'B', 'B_PLUS_1');

-- CreateEnum
CREATE TYPE "RailDataStatus" AS ENUM ('SOURCE_PENDING', 'VERIFIED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "RailComplianceDocType" AS ENUM ('RSR_PERMIT', 'INSURANCE', 'ROLLING_STOCK_CERT', 'TRAIN_CREW_CERT', 'DANGEROUS_GOODS', 'INTERFACE_AGREEMENT', 'ACCESS_CONTRACT', 'SECURITY_DEPOSIT');

-- CreateEnum
CREATE TYPE "RailComplianceDocStatus" AS ENUM ('PENDING_REVIEW', 'VALID', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RailSlotApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_ASSESSMENT', 'CAPACITY_CONFLICT', 'ALLOCATED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RailCancellationParty" AS ENUM ('RAIL_OPERATIONS', 'INFRASTRUCTURE_MANAGER', 'FORCE_MAJEURE', 'ALLOCATION_REQUIRED');

-- CreateEnum
CREATE TYPE "RailAttribution" AS ENUM ('TRIM', 'TOC', 'FORCE_MAJEURE', 'UNDETERMINED');

-- CreateEnum
CREATE TYPE "RailChangeKind" AS ENUM ('CANCEL', 'RESCHEDULE', 'REPLAN');

-- CreateEnum
CREATE TYPE "RailChangeInitiator" AS ENUM ('TOC', 'YARD_OPERATOR', 'TRIM', 'PORT_TERMINAL_OPERATOR', 'PRASA_OTHER_IM');

-- CreateEnum
CREATE TYPE "RailChangeStatus" AS ENUM ('SUBMITTED', 'ACKNOWLEDGED', 'ALTERNATIVE_PROPOSED', 'ACCEPTED', 'CANCELLED_CONFIRMED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RailPossessionKind" AS ENUM ('ANNUAL_PLAN', 'LOCKED_60_DAY', 'AD_HOC_EMERGENCY');

-- CreateEnum
CREATE TYPE "RailPossessionStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RailOccurrenceType" AS ENUM ('DERAILMENT', 'COLLISION', 'OHTE_CABLE_THEFT', 'SPAD', 'HAZMAT_SPILL', 'OTHER');

-- CreateEnum
CREATE TYPE "RailOccurrenceLevel" AS ENUM ('LEVEL_1_CODE_GREEN', 'LEVEL_2_CODE_ORANGE', 'LEVEL_3_CODE_RED');

-- CreateEnum
CREATE TYPE "RailOccurrenceStatus" AS ENUM ('REPORTED', 'UNDER_INVESTIGATION', 'PRELIMINARY_REPORT_FILED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RailCapacityUnit" AS ENUM ('PATHS_PER_DAY', 'TRAINS_PER_WEEK');

-- CreateEnum
CREATE TYPE "RailHoldStatus" AS ENUM ('NONE', 'HOLD_FOR_LOAD_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RailPriceStatus" AS ENUM ('NOT_PUBLISHED', 'TBD', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "RailAncillaryGroup" AS ENUM ('RAIL', 'TELECOMS', 'SAFETY_EMERGENCY', 'PROPERTY');

-- CreateEnum
CREATE TYPE "RailLimitSource" AS ENUM ('CORRIDOR', 'MANUAL', 'NONE');

-- CreateEnum
CREATE TYPE "RailWeighStatus" AS ENUM ('WITHIN_LIMIT', 'OVERLOADED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "RailTariffCalcStatus" AS ENUM ('PRICED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "TruckAppointmentStatus" AS ENUM ('BOOKED', 'ARRIVED', 'LOADING', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TruckWindowChangeKind" AS ENUM ('RESCHEDULED', 'REPLANNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TruckWindowChangeStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TruckWindowRecipientType" AS ENUM ('HAULIER', 'DRIVER');

-- CreateEnum
CREATE TYPE "TruckWindowChannel" AS ENUM ('REALTIME', 'PUSH', 'SHARE_LINK', 'DRIVER_PORTAL', 'IN_APP', 'WEBHOOK', 'NONE');

-- CreateEnum
CREATE TYPE "TruckWindowDeliveryState" AS ENUM ('QUEUED', 'PUBLISHED', 'SENT', 'DELIVERED', 'FAILED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TruckWindowAckState" AS ENUM ('UNACKED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "TruckWindowAckSource" AS ENUM ('TENANT_USER', 'DRIVER_PORTAL', 'SHARE_TOKEN');

-- CreateEnum
CREATE TYPE "TruckWindowEscalation" AS ENUM ('NONE', 'REMINDER', 'ESCALATED');

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JourneyStageStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JourneyUpdateStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'ASSIGNED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "JourneyUpdateType" AS ENUM ('ETA_CHANGE', 'DELAY_REPORT', 'INCIDENT_REPORT', 'PROOF_OF_DELIVERY', 'GENERAL_NOTE');

-- CreateEnum
CREATE TYPE "JourneyStageType" AS ENUM ('BORDER', 'CLEARING', 'BOND', 'EMPTY_RETURN', 'LINEHAUL');

-- CreateEnum
CREATE TYPE "TripLegKind" AS ENUM ('LINEHAUL', 'BORDER', 'CLEARING', 'BOND', 'EMPTY_RETURN');

-- CreateEnum
CREATE TYPE "OriginStatus" AS ENUM ('PREFERENTIAL', 'NON_PREFERENTIAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TripDutyProvenance" AS ENUM ('ESTIMATED', 'ACTUAL');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('DAMAGE', 'LOSS', 'SHORTAGE', 'DELAY', 'THEFT');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SETTLED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ClaimLiability" AS ENUM ('UNASSESSED', 'CARRIER', 'INSURER', 'CLIENT', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "ClaimEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'NOTE_ADDED', 'EVIDENCE_ADDED', 'SETTLED');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('REACH_STACKER', 'RTG', 'RMG', 'STRADDLE_CARRIER', 'FORKLIFT', 'TRACTOR', 'TRUCK', 'HAULER', 'TRAILER', 'GENSET', 'CRANE', 'PUMP', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetMeterType" AS ENUM ('HOURS', 'KM');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_SERVICE', 'DOWN', 'UNDER_REPAIR', 'RETIRED');

-- CreateEnum
CREATE TYPE "MaintenanceJobType" AS ENUM ('BREAKDOWN', 'PLANNED', 'INSPECTION', 'RECALL');

-- CreateEnum
CREATE TYPE "MaintenanceJobStatus" AS ENUM ('REPORTED', 'IN_PROGRESS', 'COMPLETED', 'SIGNED_OFF', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceCostKind" AS ENUM ('PART', 'LABOUR', 'OUTSIDE_SERVICE', 'TRAVEL', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "MaintenanceEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'METER_RECORDED', 'COST_ADDED', 'NOTE_ADDED', 'COMEBACK_LINKED', 'WARRANTY_SET', 'COMMERCIAL_CHANGED');

-- CreateTable
CREATE TABLE "owner_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradingName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'ZA',
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "vatNumber" TEXT,
    "whatsappNumber" TEXT,
    "bankName" TEXT,
    "bankAccountHolder" TEXT,
    "bankAccountNumber" TEXT,
    "bankBranchCode" TEXT,
    "bankAccountType" TEXT,
    "logoUrl" TEXT,
    "brandName" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "invoiceHeaderColor" TEXT,
    "portalBrandName" TEXT,
    "portalSubdomain" TEXT,
    "portalPrimaryColor" TEXT,
    "portalLogoUrl" TEXT,
    "slaWarningMinutes" INTEGER NOT NULL DEFAULT 30,
    "slaBreachMinutes" INTEGER NOT NULL DEFAULT 60,
    "slaEscalateMinutes" INTEGER NOT NULL DEFAULT 120,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "trialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "featureOverrides" JSONB,
    "terminalGateCutoffHours" INTEGER NOT NULL DEFAULT 2,
    "priceOverrideZar" DOUBLE PRECISION,
    "commercialStatus" TEXT,
    "commercialStatusReason" TEXT,
    "commercialStatusChangedAt" TIMESTAMP(3),
    "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autopilotAggression" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB,
    "externalRef" TEXT,
    "secretCiphertext" TEXT,
    "secretIv" TEXT,
    "secretAuthTag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "lastVerifiedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'AGENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB,
    "companyId" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "verifyTokenExpiry" TIMESTAMP(3),
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "activeSessionId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastLoginUserAgent" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "notes" TEXT,
    "passwordHash" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_upgrade_requests" (
    "id" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "companyId" TEXT NOT NULL,
    "currentPlan" TEXT NOT NULL,
    "requestedPlan" TEXT NOT NULL,
    "requestedById" TEXT,
    "requestedByEmail" TEXT,
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedByEmail" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_upgrade_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectives" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quarter" TEXT NOT NULL,
    "owner" TEXT,
    "status" "OkrStatus" NOT NULL DEFAULT 'ON_TRACK',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_results" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "unit" "KeyResultUnit" NOT NULL DEFAULT 'NUMBER',
    "startValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "OkrStatus" NOT NULL DEFAULT 'ON_TRACK',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "key_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "operationsEmail" BOOLEAN NOT NULL DEFAULT true,
    "operationsSms" BOOLEAN NOT NULL DEFAULT false,
    "operationsPush" BOOLEAN NOT NULL DEFAULT true,
    "billingEmail" BOOLEAN NOT NULL DEFAULT true,
    "billingPush" BOOLEAN NOT NULL DEFAULT false,
    "securityEmail" BOOLEAN NOT NULL DEFAULT true,
    "securityPush" BOOLEAN NOT NULL DEFAULT true,
    "systemEmail" BOOLEAN NOT NULL DEFAULT false,
    "systemPush" BOOLEAN NOT NULL DEFAULT false,
    "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'INSTANT',
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '07:00',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_duties" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "mode" "DriverMode" NOT NULL,
    "status" "DriverDutyStatus" NOT NULL DEFAULT 'ACTIVE',
    "vehicleReg" TEXT,
    "note" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "driver_duties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "vehicleType" TEXT NOT NULL DEFAULT 'motorbike',
    "vehicleReg" TEXT,
    "status" "DriverStatus" NOT NULL DEFAULT 'OFFLINE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "customerRating" INTEGER,
    "customerRatingNote" TEXT,
    "ratingToken" TEXT,
    "ratingRequestedAt" TIMESTAMP(3),
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSeen" TIMESTAMP(3),
    "driverPin" TEXT,
    "defaultMode" "DriverMode",
    "allowedModes" "DriverMode"[],
    "activeSessionId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastLoginUserAgent" TEXT,
    "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "userId" TEXT,
    "currentKm" INTEGER,
    "nextServiceKm" INTEGER,
    "nextServiceDate" TIMESTAMP(3),
    "vehicleNotes" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "insuranceExpiry" TIMESTAMP(3),
    "backgroundCheckExpiry" TIMESTAMP(3),
    "complianceHold" BOOLEAN NOT NULL DEFAULT false,
    "complianceHoldReason" TEXT,
    "complianceHoldAt" TIMESTAMP(3),
    "complianceHoldBy" TEXT,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_push_subscriptions" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_files" (
    "id" TEXT NOT NULL,
    "fileNumber" TEXT NOT NULL,
    "mode" "FreightMode" NOT NULL,
    "direction" "FreightDirection" NOT NULL,
    "loadType" "LoadType" NOT NULL,
    "status" "ShipmentFileStatus" NOT NULL DEFAULT 'DRAFT',
    "incoterm" TEXT,
    "shipperName" TEXT,
    "consigneeName" TEXT,
    "notifyParty" TEXT,
    "carrierName" TEXT,
    "agentName" TEXT,
    "goodsDescription" TEXT,
    "packages" INTEGER,
    "grossWeightKg" DOUBLE PRECISION,
    "volumeCbm" DOUBLE PRECISION,
    "pol" TEXT,
    "pod" TEXT,
    "vesselVoyage" TEXT,
    "vesselMmsi" TEXT,
    "vesselImo" TEXT,
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "shipperAddress" TEXT,
    "consigneeAddress" TEXT,
    "originCountry" TEXT,
    "destinationCountry" TEXT,
    "transitCountries" TEXT,
    "vehicleReg" TEXT,
    "sealNumbers" TEXT,
    "importerTin" TEXT,
    "aiRiskScore" INTEGER,
    "aiRiskNote" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isMaster" BOOLEAN NOT NULL DEFAULT false,
    "masterFileId" TEXT,

    CONSTRAINT "shipment_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_containers" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "containerNo" TEXT NOT NULL,
    "isoType" TEXT NOT NULL,
    "sealNo" TEXT,
    "vgmKg" DOUBLE PRECISION,
    "freeDays" INTEGER,
    "perDiemRate" DOUBLE PRECISION,
    "availableFrom" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "shipment_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargo_lines" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pieces" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "dimensions" TEXT,
    "hsCode" TEXT,
    "customsValue" DOUBLE PRECISION,
    "dutyRatePct" DOUBLE PRECISION,
    "unNumber" TEXT,
    "dgClass" TEXT,
    "packingGroup" TEXT,
    "emergencyPhone" TEXT,

    CONSTRAINT "cargo_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_charges" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sell" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceTo" TEXT,

    CONSTRAINT "shipment_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_documents" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_milestones" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "status" "ShipmentFileStatus" NOT NULL,
    "note" TEXT,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customs_declarations" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "CustomsDeclarationStatus" NOT NULL DEFAULT 'DRAFT',
    "lrn" TEXT,
    "mrn" TEXT,
    "payload" JSONB,
    "customsValueTotal" DOUBLE PRECISION,
    "dutyTotal" DOUBLE PRECISION,
    "vatTotal" DOUBLE PRECISION,
    "lodgementProvider" TEXT,
    "submittedAt" TIMESTAMP(3),
    "responseAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customs_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customs_edi_credentials" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "path" "CustomsEdiPath" NOT NULL,
    "status" "CustomsEdiCredentialStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "customsClientCode" TEXT,
    "providerName" TEXT,
    "endpointUrl" TEXT,
    "agentEmail" TEXT,
    "secretCiphertext" TEXT,
    "secretIv" TEXT,
    "secretAuthTag" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customs_edi_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customs_edi_messages" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reference" TEXT,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customs_edi_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carriers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CarrierType" NOT NULL DEFAULT 'OTHER',
    "code" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "accountNumber" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrier_rates" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lane" TEXT,
    "mode" TEXT,
    "containerType" TEXT,
    "buyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrier_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fileId" TEXT,
    "clientName" TEXT,
    "authority" TEXT NOT NULL,
    "category" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "status" "DisbursementStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waybills" (
    "id" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "status" "WaybillStatus" NOT NULL DEFAULT 'PENDING',
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "senderEmail" TEXT,
    "senderAddress" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "senderLat" DOUBLE PRECISION,
    "senderLng" DOUBLE PRECISION,
    "recipientLat" DOUBLE PRECISION,
    "recipientLng" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "dimensions" TEXT,
    "description" TEXT,
    "totalAmount" DOUBLE PRECISION,
    "codAmount" DOUBLE PRECISION,
    "codCollected" BOOLEAN NOT NULL DEFAULT false,
    "codCollectedAt" TIMESTAMP(3),
    "codCollectedAmount" DOUBLE PRECISION,
    "codDiscrepancy" DOUBLE PRECISION,
    "customerRating" INTEGER,
    "customerRatingNote" TEXT,
    "ratingToken" TEXT,
    "ratingRequestedAt" TIMESTAMP(3),
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "riskScore" DOUBLE PRECISION,
    "riskNotes" TEXT,
    "podSignatureUrl" TEXT,
    "podImageUrl" TEXT,
    "podRecipient" TEXT,
    "podDeliveredAt" TIMESTAMP(3),
    "podScannedCodes" TEXT[],
    "pocSenderSignatureUrl" TEXT,
    "pocSenderName" TEXT,
    "pocDriverSignatureUrl" TEXT,
    "pocCollectionPhotoUrl" TEXT,
    "pocCollectedAt" TIMESTAMP(3),
    "sourceCollectionId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3),
    "lastAttemptNote" TEXT,
    "lastAttemptReasonCode" "FailedDeliveryReason",
    "returnToSender" BOOLEAN NOT NULL DEFAULT false,
    "fileUrl" TEXT,
    "fileKey" TEXT,
    "companyId" TEXT NOT NULL,
    "railConsignmentId" TEXT,
    "originBranchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waybills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waybill_inbox_items" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fileUrl" TEXT,
    "fileKey" TEXT,
    "mimeType" TEXT,
    "extractedData" JSONB,
    "aiConfidence" DOUBLE PRECISION,
    "aiError" TEXT,
    "waybillId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waybill_inbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "status" "CollectionStatus" NOT NULL DEFAULT 'PENDING',
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "clientEmail" TEXT,
    "pickupAddress" TEXT NOT NULL,
    "notes" TEXT,
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "scheduledAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "driverId" TEXT,
    "agentId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "waybillId" TEXT NOT NULL,
    "driverId" TEXT,
    "userId" TEXT,
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "estimatedDelivery" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manifests" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "branchId" TEXT,
    "driverId" TEXT,
    "dispatched" BOOLEAN NOT NULL DEFAULT false,
    "dispatchedAt" TIMESTAMP(3),
    "pdfKey" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manifest_waybills" (
    "manifestId" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "scannedAt" TIMESTAMP(3),

    CONSTRAINT "manifest_waybills_pkey" PRIMARY KEY ("manifestId","waybillId")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "notes" TEXT,
    "publicToken" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "waybillId" TEXT,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_drafts" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "draftData" JSONB,
    "aiAnalysis" JSONB,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fromZone" TEXT,
    "toZone" TEXT,
    "minWeight" DOUBLE PRECISION,
    "maxWeight" DOUBLE PRECISION,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "pricePerKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "clientName" TEXT,
    "weight" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "breakdown" JSONB,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "link" TEXT,
    "userId" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_threads" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "lastMessage" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "wabaMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "threadId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "description" TEXT,
    "paystackReference" TEXT,
    "paystackChannel" TEXT,
    "invoiceId" TEXT,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "paidAt" TIMESTAMP(3),
    "webhookPayload" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_portal_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_portal_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_requests" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "companyId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "senderAddress" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "notes" TEXT,
    "linkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "sourceType" TEXT,
    "sourceId" TEXT,
    "metadata" JSONB,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_hub_items" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    "senderName" TEXT,
    "senderEmail" TEXT,
    "recipientEmail" TEXT,
    "waybillNumber" TEXT,
    "podNumber" TEXT,
    "aiSummary" TEXT,
    "aiConfidence" DOUBLE PRECISION,
    "aiCategory" TEXT,
    "aiSuggestedAction" TEXT,
    "opsNote" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "needsOpsAction" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_hub_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_attachments" (
    "id" TEXT NOT NULL,
    "emailHubItemId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "fileKey" TEXT,
    "fileUrl" TEXT,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "threatLevel" TEXT NOT NULL DEFAULT 'NONE',
    "threatReason" TEXT,
    "scanEngine" TEXT,
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_databases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "rows" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_databases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'owner',
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "targetName" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrr_snapshots" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mrr" DOUBLE PRECISION NOT NULL,
    "activeTenants" INTEGER NOT NULL,
    "payingTenants" INTEGER NOT NULL,
    "perTenant" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrr_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_alerts" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "tenantId" TEXT,
    "tenantName" TEXT,
    "metadata" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_wallets" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCollected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSettled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSettledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "waybillId" TEXT,
    "companyId" TEXT NOT NULL,
    "type" "CodTransactionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "idempotencyKey" TEXT,
    "requestFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cod_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_services" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT,
    "serviceType" TEXT NOT NULL,
    "notes" TEXT,
    "kmAtService" INTEGER,
    "cost" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "servicedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiPredictedNextKm" INTEGER,
    "aiPredictedNextDate" TIMESTAMP(3),
    "aiConfidence" DOUBLE PRECISION,
    "aiRiskLevel" TEXT,
    "aiNotes" TEXT,
    "providerName" TEXT,
    "invoiceRef" TEXT,
    "partsReplaced" TEXT,
    "warrantyExpiry" TIMESTAMP(3),

    CONSTRAINT "vehicle_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradingName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "billingType" "ClientBillingType" NOT NULL DEFAULT 'COD',
    "creditLimit" DOUBLE PRECISION,
    "paymentTerms" INTEGER,
    "vatNumber" TEXT,
    "accountCode" TEXT,
    "contractStart" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_chat_messages" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "attachmentType" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "rmaNumber" TEXT NOT NULL,
    "waybillId" TEXT,
    "trackingNumber" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "pickupAddress" TEXT,
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "reason" "ReturnReason" NOT NULL DEFAULT 'OTHER',
    "reasonNote" TEXT,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "resolution" "ReturnResolution" NOT NULL DEFAULT 'PENDING',
    "refundAmount" DOUBLE PRECISION,
    "restockFee" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "assignedDriverId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "inspectionNotes" TEXT,
    "condition" "ReturnCondition",
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitValue" DOUBLE PRECISION,
    "condition" "ReturnCondition",
    "restocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "invoiceId" TEXT,
    "reason" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "appliedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_items" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "creditNoteId" TEXT NOT NULL,

    CONSTRAINT "credit_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_notes" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "DebitNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "invoiceId" TEXT,
    "reason" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_note_items" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "debitNoteId" TEXT NOT NULL,

    CONSTRAINT "debit_note_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salespeople" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "defaultCommissionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salespeople_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "salespersonId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "periodMonth" TEXT NOT NULL,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "ratePct" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_connections" (
    "id" TEXT NOT NULL,
    "provider" "AccountingProvider" NOT NULL,
    "status" "AccountingConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "externalTenantId" TEXT,
    "externalTenantName" TEXT,
    "settings" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_sync_logs" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "docType" "AccountingSyncDocType" NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentNumber" TEXT,
    "externalId" TEXT,
    "status" "AccountingSyncStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DOUBLE PRECISION,
    "direction" TEXT NOT NULL DEFAULT 'PUSH',
    "error" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'oidc',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "issuer" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "authUrl" TEXT,
    "tokenUrl" TEXT,
    "userInfoUrl" TEXT,
    "scopes" TEXT NOT NULL DEFAULT 'openid email profile',
    "allowedDomain" TEXT,
    "autoProvision" BOOLEAN NOT NULL DEFAULT true,
    "defaultRole" TEXT NOT NULL DEFAULT 'AGENT',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_events" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'backend',
    "level" TEXT NOT NULL DEFAULT 'error',
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT,
    "method" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "aiSeverity" TEXT,
    "aiSummary" TEXT,
    "aiSuggestion" TEXT,
    "aiTriagedAt" TIMESTAMP(3),
    "context" JSONB,
    "companyId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "category" TEXT,
    "raisedById" TEXT,
    "raisedByName" TEXT,
    "transcript" JSONB,
    "aiSummary" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientId" TEXT,
    "pickupAddress" TEXT NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "itemsDesc" TEXT,
    "pieces" INTEGER NOT NULL DEFAULT 1,
    "weightKg" DOUBLE PRECISION,
    "priority" "CourierOrderPriority" NOT NULL DEFAULT 'NORMAL',
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "status" "CourierOrderStatus" NOT NULL DEFAULT 'NEW',
    "assignedDriverId" TEXT,
    "sequence" INTEGER,
    "aiReasoning" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courier_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "totalAreaSqm" DOUBLE PRECISION,
    "usableAreaSqm" DOUBLE PRECISION,
    "totalBinLocations" INTEGER NOT NULL DEFAULT 0,
    "maxPalletCapacity" INTEGER,
    "operatingHoursStart" TEXT,
    "operatingHoursEnd" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_zones" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "WarehouseZoneType" NOT NULL DEFAULT 'BULK',
    "areaSqm" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "maxWeight" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "warehouse_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bin_locations" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "aisle" TEXT,
    "rack" TEXT,
    "level" TEXT,
    "position" TEXT,
    "maxWeightKg" DOUBLE PRECISION,
    "maxVolumeCbm" DOUBLE PRECISION,
    "widthCm" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "depthCm" DOUBLE PRECISION,
    "binType" TEXT NOT NULL DEFAULT 'SHELF',
    "isEmpty" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "pickSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bin_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "binId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "productVariantId" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "quantityAllocated" INTEGER NOT NULL DEFAULT 0,
    "quantityAvailable" INTEGER NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "lotNumber" TEXT,
    "serialNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "manufacturedDate" TIMESTAMP(3),
    "unitCost" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "weightKg" DOUBLE PRECISION,
    "volumeCbm" DOUBLE PRECISION,
    "reorderPoint" INTEGER,
    "reorderQuantity" INTEGER,
    "maxQuantity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "lastCountedAt" TIMESTAMP(3),
    "lastMovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reference" TEXT,
    "fromBinId" TEXT,
    "toBinId" TEXT,
    "goodsReceiptId" TEXT,
    "pickOrderId" TEXT,
    "cycleCountId" TEXT,
    "reason" TEXT,
    "performedBy" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "poNumber" TEXT,
    "supplierName" TEXT,
    "carrierName" TEXT,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'EXPECTED',
    "expectedDate" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dockSlotId" TEXT,
    "expectedLines" INTEGER NOT NULL DEFAULT 0,
    "receivedLines" INTEGER NOT NULL DEFAULT 0,
    "expectedQty" INTEGER NOT NULL DEFAULT 0,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "damagedQty" INTEGER NOT NULL DEFAULT 0,
    "rejectedQty" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "inspectionNotes" TEXT,
    "receivedBy" TEXT,
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "expectedQty" INTEGER NOT NULL DEFAULT 0,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "damagedQty" INTEGER NOT NULL DEFAULT 0,
    "putAwayBinId" TEXT,
    "putAwayComplete" BOOLEAN NOT NULL DEFAULT false,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "unitCost" DOUBLE PRECISION,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pick_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "PickOrderStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "clientName" TEXT,
    "assignedTo" TEXT,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "totalLines" INTEGER NOT NULL DEFAULT 0,
    "pickedLines" INTEGER NOT NULL DEFAULT 0,
    "totalQty" INTEGER NOT NULL DEFAULT 0,
    "pickedQty" INTEGER NOT NULL DEFAULT 0,
    "shipToName" TEXT,
    "shipToAddress" TEXT,
    "trackingNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pick_order_lines" (
    "id" TEXT NOT NULL,
    "pickOrderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "requestedQty" INTEGER NOT NULL,
    "pickedQty" INTEGER NOT NULL DEFAULT 0,
    "shortQty" INTEGER NOT NULL DEFAULT 0,
    "suggestedBinId" TEXT,
    "actualBinId" TEXT,
    "picked" BOOLEAN NOT NULL DEFAULT false,
    "pickedAt" TIMESTAMP(3),
    "pickedBy" TEXT,

    CONSTRAINT "pick_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_counts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "countNumber" TEXT NOT NULL,
    "status" "CycleCountStatus" NOT NULL DEFAULT 'SCHEDULED',
    "countType" TEXT NOT NULL DEFAULT 'FULL',
    "scheduledDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "zoneFilter" TEXT,
    "skuFilter" TEXT,
    "abcClass" TEXT,
    "totalBins" INTEGER NOT NULL DEFAULT 0,
    "countedBins" INTEGER NOT NULL DEFAULT 0,
    "totalVariances" INTEGER NOT NULL DEFAULT 0,
    "varianceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accuracyRate" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycle_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_count_lines" (
    "id" TEXT NOT NULL,
    "cycleCountId" TEXT NOT NULL,
    "binCode" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "systemQty" INTEGER NOT NULL,
    "countedQty" INTEGER,
    "variance" INTEGER,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "adjustmentPosted" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "cycle_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dock_slots" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BOTH',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dock_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dock_appointments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dockSlotId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "actualArrival" TIMESTAMP(3),
    "actualDepart" TIMESTAMP(3),
    "carrierName" TEXT,
    "vehicleReg" TEXT,
    "reference" TEXT,
    "goodsReceiptId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dock_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_cost_allocations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fuelCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labourCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vehicleCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overheadCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tollsCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "provenance" "AllocationProvenance",
    "sourceEntryCount" INTEGER NOT NULL DEFAULT 0,
    "allocationNote" TEXT,
    "exceptionStatus" "MarginExceptionStatus",
    "exceptionNote" TEXT,
    "exceptionBy" TEXT,
    "exceptionAt" TIMESTAMP(3),
    "grossMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marginPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fromZone" TEXT,
    "toZone" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "driverId" TEXT,
    "clientName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_cost_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_cost_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "waybillId" TEXT,
    "manifestId" TEXT,
    "type" "TripCostType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "litres" DOUBLE PRECISION,
    "odometerKm" INTEGER,
    "note" TEXT,
    "receiptUrl" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" "TripCostSource" NOT NULL DEFAULT 'OFFICE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lane_profitability" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "fromZone" TEXT NOT NULL,
    "toZone" TEXT NOT NULL,
    "totalDeliveries" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgRevenuePerDel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgCostPerDel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marginPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenueDelta" DOUBLE PRECISION,
    "volumeDelta" DOUBLE PRECISION,
    "marginDelta" DOUBLE PRECISION,
    "pricingSignal" TEXT,
    "aiRecommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lane_profitability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_profitability" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenueGrowthPct" DOUBLE PRECISION,
    "deliveryCount" INTEGER NOT NULL DEFAULT 0,
    "avgRevenuePerDel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costToServePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marginPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitRank" INTEGER,
    "avgDaysToPay" DOUBLE PRECISION,
    "collectionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overdueAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clv" DOUBLE PRECISION,
    "clvTier" TEXT,
    "churnRisk" DOUBLE PRECISION,
    "churnSignals" JSONB,
    "monthsActive" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAt" TIMESTAMP(3),
    "volumeTrend" TEXT,
    "aiInsights" JSONB,
    "aiGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_profitability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_recommendations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromZone" TEXT,
    "toZone" TEXT,
    "clientName" TEXT,
    "rateCardId" TEXT,
    "currentPrice" DOUBLE PRECISION,
    "currentMargin" DOUBLE PRECISION,
    "currentVolume" INTEGER,
    "recommendedPrice" DOUBLE PRECISION,
    "expectedMargin" DOUBLE PRECISION,
    "expectedImpact" TEXT,
    "confidence" DOUBLE PRECISION,
    "reasoning" TEXT,
    "dataPoints" JSONB,
    "signal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "pricing_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_forecasts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forecastPeriod" TEXT NOT NULL,
    "forecastType" TEXT NOT NULL DEFAULT 'MONTHLY',
    "predictedRevenue" DOUBLE PRECISION NOT NULL,
    "lowerBound" DOUBLE PRECISION NOT NULL,
    "upperBound" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "historicalAvg" DOUBLE PRECISION,
    "trend" DOUBLE PRECISION,
    "seasonalFactor" DOUBLE PRECISION,
    "pipelineValue" DOUBLE PRECISION,
    "actualRevenue" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,

    CONSTRAINT "revenue_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fuelCostPerKm" DOUBLE PRECISION NOT NULL DEFAULT 2.50,
    "driverHourlyCost" DOUBLE PRECISION NOT NULL DEFAULT 45.0,
    "vehicleCostPerKm" DOUBLE PRECISION NOT NULL DEFAULT 1.80,
    "overheadPerDelivery" DOUBLE PRECISION NOT NULL DEFAULT 15.0,
    "avgDeliveryMinutes" DOUBLE PRECISION NOT NULL DEFAULT 25.0,
    "avgKmPerDelivery" DOUBLE PRECISION NOT NULL DEFAULT 12.0,
    "targetMarginPct" DOUBLE PRECISION NOT NULL DEFAULT 35.0,
    "minMarginPct" DOUBLE PRECISION NOT NULL DEFAULT 15.0,
    "seasonalityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "forecastMonths" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "tags" JSONB,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_analytics" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "totalDeliveries" INTEGER NOT NULL DEFAULT 0,
    "deliveredOnTime" INTEGER NOT NULL DEFAULT 0,
    "failedDeliveries" INTEGER NOT NULL DEFAULT 0,
    "returnedParcels" INTEGER NOT NULL DEFAULT 0,
    "totalCollections" INTEGER NOT NULL DEFAULT 0,
    "onTimePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgDeliveryMinutes" DOUBLE PRECISION,
    "slaBreaches" INTEGER NOT NULL DEFAULT 0,
    "customerRatingAvg" DOUBLE PRECISION,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPerDelivery" DOUBLE PRECISION,
    "codCollected" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activeDrivers" INTEGER NOT NULL DEFAULT 0,
    "avgDriverUtilPct" DOUBLE PRECISION,
    "topDriverId" TEXT,
    "aiInsights" JSONB,
    "aiGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carbon_reports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "totalKmDriven" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeliveries" INTEGER NOT NULL DEFAULT 0,
    "avgKmPerDelivery" DOUBLE PRECISION,
    "totalCo2Kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "co2PerDelivery" DOUBLE PRECISION,
    "co2PerKm" DOUBLE PRECISION,
    "petrolVehicles" INTEGER NOT NULL DEFAULT 0,
    "dieselVehicles" INTEGER NOT NULL DEFAULT 0,
    "electricVehicles" INTEGER NOT NULL DEFAULT 0,
    "motorbikeCount" INTEGER NOT NULL DEFAULT 0,
    "offsetKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netEmissionsKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prevPeriodCo2Kg" DOUBLE PRECISION,
    "changePercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carbon_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_zones" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 1000,
    "riskLevel" "SafetyZoneRiskLevel" NOT NULL DEFAULT 'HIGH',
    "alertMessage" TEXT,
    "notifyDriver" BOOLEAN NOT NULL DEFAULT true,
    "notifyDispatch" BOOLEAN NOT NULL DEFAULT true,
    "notifyAdmin" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_alerts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT,
    "zoneId" TEXT NOT NULL,
    "zoneName" TEXT,
    "riskLevel" "SafetyZoneRiskLevel" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION,
    "driverNotified" BOOLEAN NOT NULL DEFAULT false,
    "dispatchNotified" BOOLEAN NOT NULL DEFAULT false,
    "adminNotified" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "exitedZoneAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address_book_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BOTH',
    "name" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'ZA',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_book_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_events" (
    "id" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "actorType" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_optimizations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT,
    "status" "RouteOptimizationStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryIds" TEXT[],
    "vehicleIds" TEXT[],
    "depot" JSONB,
    "optimizedRoutes" JSONB,
    "totalDistance" DOUBLE PRECISION,
    "totalDuration" DOUBLE PRECISION,
    "savingsPercent" DOUBLE PRECISION,
    "modelUsed" TEXT,
    "aiInsights" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_optimizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_allocations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "optimizationId" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "sequence" INTEGER NOT NULL,
    "estimatedArrival" TIMESTAMP(3),
    "distance" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "waybillId" TEXT,
    "content" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "category" TEXT,
    "createdBy" TEXT,
    "createdByName" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_flow_integrations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'CONFIGURING',
    "config" JSONB,
    "credentials" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "failedOrders" INTEGER NOT NULL DEFAULT 0,
    "autoDispatch" BOOLEAN NOT NULL DEFAULT false,
    "dispatchRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_flow_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_sync_logs" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "externalOrderId" TEXT,
    "waybillId" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_plans" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT,
    "status" "RoutePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "vehicleId" TEXT,
    "driverId" TEXT,
    "routeCoordinates" JSONB,
    "stops" JSONB,
    "totalStops" INTEGER NOT NULL DEFAULT 0,
    "estimatedTime" DOUBLE PRECISION,
    "estimatedDistance" DOUBLE PRECISION,
    "actualTime" DOUBLE PRECISION,
    "actualDistance" DOUBLE PRECISION,
    "scheduledDate" TIMESTAMP(3),
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "vehicleCapacity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electronic_pods" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "driverId" TEXT,
    "status" "EpodStatus" NOT NULL DEFAULT 'PENDING',
    "signatureUrl" TEXT,
    "photoUrls" TEXT[],
    "recipientName" TEXT,
    "recipientId" TEXT,
    "notes" TEXT,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "disputeResolution" TEXT,
    "disputeResolvedBy" TEXT,
    "disputeResolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "electronic_pods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_tracking_sessions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "manifestId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "lastPingAt" TIMESTAMP(3),
    "distanceCovered" DOUBLE PRECISION,
    "stopsCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalStops" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_tracking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "waybillId" TEXT,
    "driverId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "externalId" TEXT,
    "payerName" TEXT,
    "payerPhone" TEXT,
    "payerEmail" TEXT,
    "gateway" TEXT,
    "gatewayResponse" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_consignments" (
    "id" TEXT NOT NULL,
    "consignmentNumber" TEXT NOT NULL,
    "status" "RailConsignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "clientName" TEXT,
    "commodity" TEXT NOT NULL,
    "tonnage" DOUBLE PRECISION,
    "wagonsPlanned" INTEGER,
    "corridor" TEXT,
    "originSiding" TEXT,
    "destinationSiding" TEXT,
    "railOperator" TEXT,
    "serviceRef" TEXT,
    "interchangePoint" TEXT,
    "plannedDeparture" TIMESTAMP(3),
    "plannedArrival" TIMESTAMP(3),
    "actualDeparture" TIMESTAMP(3),
    "actualArrival" TIMESTAMP(3),
    "slaHours" INTEGER,
    "riskLevel" "RiskLevel",
    "riskNote" TEXT,
    "isDangerousGoods" BOOLEAN NOT NULL DEFAULT false,
    "unNumber" TEXT,
    "imdgClass" TEXT,
    "placardRef" TEXT,
    "emergencyContact24h" TEXT,
    "msdsDocumentUrl" TEXT,
    "holdStatus" "RailHoldStatus" NOT NULL DEFAULT 'NONE',
    "holdReason" TEXT,
    "holdSetAt" TIMESTAMP(3),
    "holdClearedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_consignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wagons" (
    "id" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "wagonNumber" TEXT NOT NULL,
    "type" "WagonType" NOT NULL DEFAULT 'CONTAINER_CAR',
    "tareTonnes" DOUBLE PRECISION,
    "loadedTonnes" DOUBLE PRECISION,
    "commodity" TEXT,
    "sealNumbers" TEXT,
    "lastKnownSiding" TEXT,
    "loadedAt" TIMESTAMP(3),
    "offloadedAt" TIMESTAMP(3),
    "axles" INTEGER,
    "gauge" "RailGauge",
    "vehicleProfile" "RailVehicleProfile",
    "isDangerousGoods" BOOLEAN NOT NULL DEFAULT false,
    "unNumber" TEXT,
    "imdgClass" TEXT,
    "placardRef" TEXT,
    "emergencyContact24h" TEXT,
    "msdsDocumentUrl" TEXT,

    CONSTRAINT "wagons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_train_manifests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "manifestNumber" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "status" "RailTrainManifestStatus" NOT NULL DEFAULT 'DRAFT',
    "consignmentId" TEXT NOT NULL,
    "consignmentNumber" TEXT NOT NULL,
    "slotApplicationId" TEXT,
    "trainServiceRef" TEXT,
    "corridor" TEXT,
    "originSiding" TEXT,
    "destinationSiding" TEXT,
    "railOperator" TEXT,
    "locoReference" TEXT,
    "plannedDeparture" TIMESTAMP(3),
    "plannedArrival" TIMESTAMP(3),
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedBy" TEXT,
    "departedAt" TIMESTAMP(3),
    "departedBy" TEXT,
    "arrivedAt" TIMESTAMP(3),
    "arrivedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "supersededAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_train_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_train_manifest_wagons" (
    "id" TEXT NOT NULL,
    "manifestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "wagonNumber" TEXT NOT NULL,
    "type" "WagonType" NOT NULL DEFAULT 'CONTAINER_CAR',
    "tareTonnes" DOUBLE PRECISION,
    "loadedTonnes" DOUBLE PRECISION,
    "commodity" TEXT,
    "sealNumbers" TEXT,
    "axles" INTEGER,
    "gauge" "RailGauge",
    "vehicleProfile" "RailVehicleProfile",
    "isDangerousGoods" BOOLEAN NOT NULL DEFAULT false,
    "unNumber" TEXT,
    "imdgClass" TEXT,
    "placardRef" TEXT,
    "emergencyContact24h" TEXT,
    "msdsDocumentUrl" TEXT,
    "note" TEXT,

    CONSTRAINT "rail_train_manifest_wagons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_devices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "kind" "RailDeviceKind" NOT NULL DEFAULT 'WAGON_TRACKER',
    "status" "RailDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" TEXT,
    "wagonNumber" TEXT,
    "locoReference" TEXT,
    "simRef" TEXT,
    "speedLimitKph" DOUBLE PRECISION,
    "batteryThresholdPct" DOUBLE PRECISION,
    "notes" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSpeedKph" DOUBLE PRECISION,
    "lastBatteryPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_telemetry_points" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speedKph" DOUBLE PRECISION,
    "headingDeg" DOUBLE PRECISION,
    "odometerKm" DOUBLE PRECISION,
    "batteryPct" DOUBLE PRECISION,
    "temperatureC" DOUBLE PRECISION,
    "doorOpen" BOOLEAN,
    "raw" JSONB,

    CONSTRAINT "rail_telemetry_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_telemetry_alerts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "kind" "RailTelemetryAlertKind" NOT NULL,
    "status" "RailAlertStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "rail_telemetry_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intermodal_legs" (
    "id" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "mode" "IntermodalLegMode" NOT NULL,
    "status" "IntermodalLegStatus" NOT NULL DEFAULT 'PENDING',
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "handler" TEXT,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "dwellHours" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "intermodal_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_handoff_readiness" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "legId" TEXT,
    "warehouseId" TEXT,
    "status" "HandoffReadinessStatus" NOT NULL DEFAULT 'DRAFT',
    "blockedReasons" JSONB,
    "notes" TEXT,
    "handedOverAt" TIMESTAMP(3),
    "handedOverBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_handoff_readiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_handoff_evidence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "readinessId" TEXT NOT NULL,
    "waybillId" TEXT,
    "type" "HandoffEvidenceType" NOT NULL,
    "status" "HandoffEvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "evidenceUrl" TEXT,
    "capturedBy" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "rail_handoff_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_consignment_events" (
    "id" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "status" "RailConsignmentStatus" NOT NULL,
    "note" TEXT,
    "location" TEXT,
    "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rail_consignment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_schedule_imports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "importedBy" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rail_schedule_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_schedule_rows" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "importId" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "train" TEXT NOT NULL,
    "nodeSequence" INTEGER,
    "corridor" TEXT,
    "station" TEXT NOT NULL,
    "arrivalTime" TEXT,
    "departureTime" TEXT,
    "pointToPointRuntime" TEXT,
    "standingTime" TEXT,
    "standingReason" TEXT,
    "destination" TEXT,
    "originDepartureTime" TEXT,
    "destinationArrivalTime" TEXT,
    "scheduleCode" TEXT,
    "frequency" TEXT,
    "trainType" TEXT,
    "throughputRuntime" TEXT,
    "departDay" INTEGER,
    "distanceKm" DOUBLE PRECISION,
    "rawLine" TEXT NOT NULL,

    CONSTRAINT "rail_schedule_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_networks" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "country" TEXT NOT NULL DEFAULT 'ZA',
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "companyId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "networkStatementRef" TEXT,
    "resolveByHours" INTEGER NOT NULL DEFAULT 96,
    "roleLabels" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_networks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_escalation_rungs" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "role" TEXT,
    "afterHours" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "isManualOnly" BOOLEAN NOT NULL DEFAULT false,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "legacyStage" "EscalationStage",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_escalation_rungs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_handshake_reports" (
    "id" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "status" "HandshakeReportStatus" NOT NULL DEFAULT 'DRAFT',
    "networkId" TEXT,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "railOperator" TEXT,
    "corridor" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "signedOffBy" TEXT,
    "imReference" TEXT,
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_handshake_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_handshake_deviations" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "trainSlotRef" TEXT NOT NULL,
    "orderNumber" TEXT,
    "consignmentId" TEXT,
    "category" "DeviationCategory" NOT NULL DEFAULT 'OTHER',
    "reason" TEXT NOT NULL,
    "rootCause" TEXT,
    "location" TEXT,
    "occurredAt" TIMESTAMP(3),
    "delayMinutes" INTEGER,
    "responsibleParty" "ResponsibleParty" NOT NULL DEFAULT 'UNDETERMINED',
    "slotImpact" "SlotImpact" NOT NULL DEFAULT 'NONE',
    "otherTrainPathsImpacted" TEXT,
    "slaKpisImpacted" TEXT,
    "costZar" DOUBLE PRECISION,
    "costRecovered" BOOLEAN NOT NULL DEFAULT false,
    "status" "DeviationStatus" NOT NULL DEFAULT 'LOGGED',
    "escalationRungId" TEXT,
    "escalationStage" "EscalationStage" NOT NULL DEFAULT 'NONE',
    "disputeReason" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "resolveByAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_handshake_deviations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_intelligence_stats" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 90,
    "totalDeliveries" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "returned" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_intelligence_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_definitions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "ownerRole" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_versions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ProcessLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "contentHash" TEXT NOT NULL,
    "createdById" TEXT,
    "submittedForApprovalAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "pilotStartedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "retiredById" TEXT,
    "isImmutable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_step_definitions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ProcessStepType" NOT NULL DEFAULT 'MANUAL',
    "isAutomated" BOOLEAN NOT NULL DEFAULT false,
    "requiresHumanApproval" BOOLEAN NOT NULL DEFAULT true,
    "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,
    "evidenceSchema" JSONB,
    "validationRules" JSONB,
    "nextStepOnSuccess" TEXT,
    "nextStepOnFailure" TEXT,
    "nextStepOnException" TEXT,
    "allowedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slaMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_step_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_automation_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stepDefinitionId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" TEXT NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionConfig" JSONB NOT NULL,
    "maxRunsPerInstance" INTEGER NOT NULL DEFAULT 1,
    "requiresHumanApproval" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_instances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "businessKey" TEXT NOT NULL,
    "status" "ProcessInstanceStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStepId" TEXT,
    "context" JSONB,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "goodsReceiptId" TEXT,

    CONSTRAINT "process_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_step_instances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepDefinitionId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "ProcessStepInstanceStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "executedById" TEXT,
    "executedByName" TEXT,
    "evidence" JSONB,
    "result" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_step_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_incidents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepInstanceId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "severity" "ProcessIncidentSeverity" NOT NULL DEFAULT 'MINOR',
    "status" "ProcessIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "isBlocking" BOOLEAN NOT NULL DEFAULT false,
    "evidence" JSONB,
    "detectedBy" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_solutions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proposedById" TEXT,
    "proposedByName" TEXT,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ProcessSolutionStatus" NOT NULL DEFAULT 'PROPOSED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "implementedById" TEXT,
    "implementedAt" TIMESTAMP(3),
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_solutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_outcomes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "status" "ProcessOutcomeStatus" NOT NULL DEFAULT 'COMPLETED',
    "completedSteps" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "incidentCount" INTEGER NOT NULL DEFAULT 0,
    "blockingIncidentCount" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "firstTimeRight" BOOLEAN NOT NULL DEFAULT false,
    "evidence" JSONB,
    "artifacts" JSONB,
    "lessonsLearned" TEXT,
    "completedById" TEXT,
    "completedByName" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_change_proposals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "outcomeId" TEXT,
    "incidentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "proposedById" TEXT,
    "proposedByName" TEXT,
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ChangeProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "implementedInVersionId" TEXT,
    "implementedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_change_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepInstanceId" TEXT,
    "triggerData" JSONB NOT NULL,
    "actionResult" JSONB,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "process_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "definitionId" TEXT,
    "versionId" TEXT,
    "instanceId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "subCategory" TEXT,
    "brand" TEXT,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'EA',
    "status" "ProductApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "previousRevisionId" TEXT,
    "attributeFingerprint" TEXT,
    "weightKg" DOUBLE PRECISION,
    "volumeCbm" DOUBLE PRECISION,
    "dimensions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isHazardous" BOOLEAN NOT NULL DEFAULT false,
    "hazardousClass" TEXT,
    "requiresBatchTracking" BOOLEAN NOT NULL DEFAULT false,
    "requiresSerialTracking" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attributes" JSONB NOT NULL,
    "attributeFingerprint" TEXT NOT NULL,
    "sku" TEXT,
    "skuAllocatedAt" TIMESTAMP(3),
    "status" "VariantApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "weightKg" DOUBLE PRECISION,
    "volumeCbm" DOUBLE PRECISION,
    "dimensions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reorderPoint" INTEGER,
    "reorderQuantity" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_aliases" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "supplierRef" TEXT,
    "customerRef" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sku_sequences" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "prefix" TEXT NOT NULL DEFAULT 'SKU',
    "format" TEXT NOT NULL DEFAULT 'SKU-{number:05d}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sku_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_data_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_data_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_corridor_nodes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workbookRoutes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "gauge" "RailGauge",
    "electrification" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxAxleLoadTonnes" DOUBLE PRECISION,
    "vehicleProfile" "RailVehicleProfile",
    "maxTrainLengthM" INTEGER,
    "contacts" JSONB,
    "envelopeExceptions" JSONB,
    "dataStatus" "RailDataStatus" NOT NULL DEFAULT 'SOURCE_PENDING',
    "sourceRef" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "networkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_corridor_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_yard_specs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "corridorCode" TEXT,
    "isTransferYard" BOOLEAN NOT NULL DEFAULT true,
    "gauge" "RailGauge",
    "electrification" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxAxleLoadTonnes" DOUBLE PRECISION,
    "vehicleProfile" "RailVehicleProfile",
    "maxTrainLengthM" INTEGER,
    "sidingCapacityWagons" INTEGER,
    "contacts" JSONB,
    "dataStatus" "RailDataStatus" NOT NULL DEFAULT 'SOURCE_PENDING',
    "sourceRef" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_yard_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_operator_compliance_docs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docType" "RailComplianceDocType" NOT NULL,
    "status" "RailComplianceDocStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "referenceNumber" TEXT,
    "issuer" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "documentUrl" TEXT,
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedByEmail" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_operator_compliance_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_slot_applications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "status" "RailSlotApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "corridorCode" TEXT NOT NULL,
    "originName" TEXT,
    "destinationName" TEXT,
    "originYardCode" TEXT,
    "destinationYardCode" TEXT,
    "railOperator" TEXT,
    "imReference" TEXT,
    "tractionType" "RailElectrification",
    "commodity" TEXT,
    "isDangerousGoods" BOOLEAN NOT NULL DEFAULT false,
    "trainsPerWeek" INTEGER,
    "wagonsPerTrain" INTEGER,
    "annualTonnes" DOUBLE PRECISION,
    "gauge" "RailGauge",
    "axleLoadTonnes" DOUBLE PRECISION,
    "vehicleProfile" "RailVehicleProfile",
    "trainLengthM" INTEGER,
    "requestedFrom" TIMESTAMP(3) NOT NULL,
    "requestedUntil" TIMESTAMP(3) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "selfScreening" JSONB,
    "selfScreeningAccessType" TEXT,
    "selfScreeningCompletedAt" TIMESTAMP(3),
    "envelopeCheckStatus" TEXT,
    "envelopeCheck" JSONB,
    "complianceSnapshot" JSONB,
    "capacityCheckStatus" TEXT,
    "capacityCheck" JSONB,
    "submittedAt" TIMESTAMP(3),
    "assessmentStartedAt" TIMESTAMP(3),
    "conflictFlaggedAt" TIMESTAMP(3),
    "conflictNote" TEXT,
    "allocatedAt" TIMESTAMP(3),
    "mobilizeBy" TIMESTAMP(3),
    "firstOperatedAt" TIMESTAMP(3),
    "forfeitureFlaggedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "expiredAt" TIMESTAMP(3),
    "consignmentId" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_slot_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_corridor_capacity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "theoreticalPathsPerDay" DOUBLE PRECISION NOT NULL,
    "capacityFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "practicalPathsPerDay" DOUBLE PRECISION NOT NULL,
    "unit" "RailCapacityUnit" NOT NULL DEFAULT 'PATHS_PER_DAY',
    "dataStatus" "RailDataStatus" NOT NULL DEFAULT 'SOURCE_PENDING',
    "sourceRef" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_corridor_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_cancellation_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "responsibleParty" "RailCancellationParty" NOT NULL,
    "possibleParties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceText" TEXT NOT NULL,
    "annexureVersion" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "networkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_cancellation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_slot_change_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "kind" "RailChangeKind" NOT NULL,
    "status" "RailChangeStatus" NOT NULL DEFAULT 'SUBMITTED',
    "initiatedBy" "RailChangeInitiator" NOT NULL,
    "cancellationCode" TEXT NOT NULL,
    "cancellationReason" TEXT NOT NULL,
    "codeResponsibleParty" "RailCancellationParty" NOT NULL,
    "attribution" "RailAttribution" NOT NULL DEFAULT 'UNDETERMINED',
    "isForceMajeure" BOOLEAN NOT NULL DEFAULT false,
    "isPlannedOccupation" BOOLEAN NOT NULL DEFAULT false,
    "trainSlotRef" TEXT NOT NULL,
    "slotApplicationId" TEXT,
    "consignmentId" TEXT,
    "handshakeReportId" TEXT,
    "handshakeDeviationId" TEXT,
    "originalDeparture" TIMESTAMP(3),
    "proposedDeparture" TIMESTAMP(3),
    "eventOccurredAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "noticeLateMinutes" INTEGER,
    "hoursBeforeDeparture" DOUBLE PRECISION,
    "noticeBand" TEXT NOT NULL,
    "commercialWindow" TEXT NOT NULL,
    "consequence" TEXT NOT NULL,
    "penaltyApplicable" BOOLEAN NOT NULL DEFAULT false,
    "penaltyAgainst" TEXT,
    "penaltyBasis" TEXT,
    "requiresStaging" BOOLEAN NOT NULL DEFAULT false,
    "replacementAccepted" BOOLEAN,
    "note" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_slot_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_possession_windows" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "kind" "RailPossessionKind" NOT NULL,
    "status" "RailPossessionStatus" NOT NULL DEFAULT 'PLANNED',
    "title" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "imReference" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "noticeGivenAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_possession_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_occurrence_reports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "occurrenceNumber" TEXT NOT NULL,
    "type" "RailOccurrenceType" NOT NULL,
    "level" "RailOccurrenceLevel" NOT NULL,
    "status" "RailOccurrenceStatus" NOT NULL DEFAULT 'REPORTED',
    "corridorCode" TEXT,
    "location" TEXT,
    "trainSlotRef" TEXT,
    "consignmentId" TEXT,
    "deviationId" TEXT,
    "auditLogId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "responsibleParty" "RailAttribution" NOT NULL DEFAULT 'UNDETERMINED',
    "fatalities" BOOLEAN NOT NULL DEFAULT false,
    "hazmatInvolved" BOOLEAN NOT NULL DEFAULT false,
    "reportedToTcoAt" TIMESTAMP(3),
    "reportedToRsrAt" TIMESTAMP(3),
    "preliminaryReportDueAt" TIMESTAMP(3),
    "preliminaryReportFiledAt" TIMESTAMP(3),
    "investigationNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_occurrence_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_tariff_schedules" (
    "id" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "loadedCentsPerGtk" DOUBLE PRECISION,
    "emptyCentsPerGtk" DOUBLE PRECISION,
    "dieselLitresPer1000Gtk" DOUBLE PRECISION,
    "electricKwhPer1000Gtk" DOUBLE PRECISION,
    "dieselPricePerLitreZar" DOUBLE PRECISION,
    "electricityPricePerKwhZar" DOUBLE PRECISION,
    "overloadPenaltyPerTonneZar" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "dataStatus" "RailDataStatus" NOT NULL DEFAULT 'SOURCE_PENDING',
    "sourceRef" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "networkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_tariff_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_ancillary_services" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serviceNumber" INTEGER NOT NULL,
    "serviceName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "section" TEXT,
    "description" TEXT,
    "unitOfMeasure" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "tierName" TEXT NOT NULL,
    "serviceGroup" "RailAncillaryGroup" NOT NULL,
    "isCompulsory" BOOLEAN NOT NULL DEFAULT false,
    "priceStatus" "RailPriceStatus" NOT NULL,
    "unitRateZar" DOUBLE PRECISION,
    "rateSourceRef" TEXT,
    "annexureVersion" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "networkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_ancillary_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_weighbridge_readings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "wagonId" TEXT,
    "wagonNumber" TEXT NOT NULL,
    "weighbridge" TEXT,
    "weighedAt" TIMESTAMP(3) NOT NULL,
    "actualTonnes" DOUBLE PRECISION NOT NULL,
    "axles" INTEGER,
    "maxAxleLoadTonnes" DOUBLE PRECISION,
    "limitSource" "RailLimitSource" NOT NULL DEFAULT 'NONE',
    "corridorCode" TEXT,
    "allowedTonnes" DOUBLE PRECISION,
    "excessTonnes" DOUBLE PRECISION,
    "status" "RailWeighStatus" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rail_weighbridge_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rail_tariff_calculations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "calculationNumber" TEXT NOT NULL,
    "consignmentId" TEXT NOT NULL,
    "consignmentNumber" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "scheduleId" TEXT,
    "status" "RailTariffCalcStatus" NOT NULL,
    "inputs" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "gtkLoaded" DOUBLE PRECISION,
    "gtkEmpty" DOUBLE PRECISION,
    "subtotalZar" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "holdTriggered" BOOLEAN NOT NULL DEFAULT false,
    "invoiceDraftId" TEXT,
    "invoiceDraftedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rail_tariff_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_truck_appointments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "consignmentId" TEXT,
    "legId" TEXT,
    "terminalName" TEXT NOT NULL,
    "haulierName" TEXT NOT NULL,
    "vehicleReg" TEXT NOT NULL,
    "driverName" TEXT,
    "driverId" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'DELIVERY',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "arrivedAt" TIMESTAMP(3),
    "loadingAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "windowVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "TruckAppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "bookedBy" TEXT,
    "note" TEXT,
    "shareToken" TEXT,
    "shareTokenIssuedAt" TIMESTAMP(3),
    "shareTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_truck_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_truck_window_changes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changeKind" "TruckWindowChangeKind" NOT NULL,
    "status" "TruckWindowChangeStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeAppointmentId" TEXT,
    "previousWindowStart" TIMESTAMP(3) NOT NULL,
    "previousWindowEnd" TIMESTAMP(3) NOT NULL,
    "newWindowStart" TIMESTAMP(3),
    "newWindowEnd" TIMESTAMP(3),
    "reason" TEXT,
    "forced" BOOLEAN NOT NULL DEFAULT false,
    "insideCutoff" BOOLEAN NOT NULL DEFAULT false,
    "cutoffHours" INTEGER NOT NULL,
    "truckStatusAtChange" "TruckAppointmentStatus" NOT NULL,
    "windowAlreadyClosed" BOOLEAN NOT NULL DEFAULT false,
    "changedById" TEXT,
    "changedByEmail" TEXT,
    "changedByRole" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_truck_window_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_truck_window_recipients" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "recipientType" "TruckWindowRecipientType" NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "recipientLabel" TEXT NOT NULL,
    "driverId" TEXT,
    "deliveryChannels" "TruckWindowChannel"[] DEFAULT ARRAY[]::"TruckWindowChannel"[],
    "deliveryState" "TruckWindowDeliveryState" NOT NULL DEFAULT 'QUEUED',
    "deliveryReason" TEXT,
    "deliveryDetail" JSONB,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "ackState" "TruckWindowAckState" NOT NULL DEFAULT 'UNACKED',
    "ackedAt" TIMESTAMP(3),
    "ackDeviceAt" TIMESTAMP(3),
    "ackSource" "TruckWindowAckSource",
    "ackedByLabel" TEXT,
    "ackIdempotencyKey" TEXT,
    "escalation" "TruckWindowEscalation" NOT NULL DEFAULT 'NONE',
    "reminderSentAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "ackDueMinutes" INTEGER NOT NULL,
    "toldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_truck_window_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_gate_policies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "terminalName" TEXT NOT NULL,
    "ackDueMinutes" INTEGER NOT NULL DEFAULT 30,
    "reminderAfterMinutes" INTEGER NOT NULL DEFAULT 15,
    "escalateAfterMinutes" INTEGER NOT NULL DEFAULT 45,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_gate_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journeys" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "driverId" TEXT,
    "reference" TEXT NOT NULL,
    "origin" TEXT,
    "destination" TEXT,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" "JourneyStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_stages" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "stageNumber" INTEGER NOT NULL,
    "type" "JourneyStageType" NOT NULL,
    "locationName" TEXT,
    "locationRef" TEXT,
    "plannedAt" TIMESTAMP(3),
    "status" "JourneyStageStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journey_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journey_updates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "stageId" TEXT,
    "type" "JourneyUpdateType" NOT NULL,
    "message" TEXT NOT NULL,
    "clientMessageId" TEXT,
    "deviceOccurredAt" TIMESTAMP(3),
    "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JourneyUpdateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journey_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "border_posts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countries" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "is24Hour" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "border_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "border_geofences" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "provenance" TEXT NOT NULL DEFAULT 'SEED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "border_geofences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "border_dwell_sessions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "geofenceId" TEXT NOT NULL,
    "driverId" TEXT,
    "state" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "enteredFromFixAt" TIMESTAMP(3),
    "exitedAt" TIMESTAMP(3),
    "exitedFromFixAt" TIMESTAMP(3),
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "precisionSeconds" INTEGER,
    "gapLargestSeconds" INTEGER,
    "direction" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "border_dwell_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "driverId" TEXT,
    "reference" TEXT NOT NULL,
    "origin" TEXT,
    "destination" TEXT,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "hsCode" TEXT,
    "originStatus" "OriginStatus" NOT NULL DEFAULT 'UNKNOWN',
    "certificateOfOriginRef" TEXT,
    "dutyEstimated" DOUBLE PRECISION,
    "estimateSource" TEXT,
    "estimateVersion" TEXT,
    "estimatedAt" TIMESTAMP(3),
    "dutyActual" DOUBLE PRECISION,
    "declarationRef" TEXT,
    "capturedBy" TEXT,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_legs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "kind" "TripLegKind" NOT NULL,
    "postId" TEXT,
    "dwellSessionId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "provenance" TEXT NOT NULL,
    "source" TEXT,
    "confidenceNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "waybillId" TEXT NOT NULL,
    "waybillNumber" TEXT,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "invoiceId" TEXT,
    "creditNoteId" TEXT,
    "creditNoteNumber" TEXT,
    "type" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "liability" "ClaimLiability" NOT NULL DEFAULT 'UNASSESSED',
    "liabilityBasis" TEXT,
    "liabilityCap" DOUBLE PRECISION,
    "claimedAmount" DOUBLE PRECISION NOT NULL,
    "approvedAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "incidentAt" TIMESTAMP(3),
    "evidence" JSONB,
    "metadata" JSONB,
    "rejectionReason" TEXT,
    "raisedById" TEXT,
    "raisedByName" TEXT,
    "assessedById" TEXT,
    "approvedById" TEXT,
    "respondBy" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_events" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "ClaimEventType" NOT NULL,
    "fromStatus" "ClaimStatus",
    "toStatus" "ClaimStatus",
    "actorId" TEXT,
    "actorName" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_assets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT,
    "assetClass" "AssetClass" NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "custodian" TEXT,
    "site" TEXT,
    "meterType" "AssetMeterType" NOT NULL DEFAULT 'HOURS',
    "meterReading" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meterReadAt" TIMESTAMP(3),
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "commissionedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "warrantySupplier" TEXT,
    "warrantyStartAt" TIMESTAMP(3),
    "warrantyTermDays" INTEGER,
    "warrantyServiceIntervalDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_meter_readings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "reading" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "jobId" TEXT,
    "recordedByName" TEXT,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_fault_codes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "guidance" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_fault_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_jobs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "type" "MaintenanceJobType" NOT NULL,
    "status" "MaintenanceJobStatus" NOT NULL DEFAULT 'REPORTED',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedByName" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "signedOffAt" TIMESTAMP(3),
    "signedOffBy" TEXT,
    "faultCodeId" TEXT,
    "faultDescription" TEXT NOT NULL,
    "workPerformed" TEXT,
    "downtimeMinutes" INTEGER,
    "meterAtJob" DOUBLE PRECISION,
    "priorJobId" TEXT,
    "warrantyTermDays" INTEGER,
    "warrantyExpiresAt" TIMESTAMP(3),
    "labourHours" DOUBLE PRECISION,
    "providerName" TEXT,
    "invoiceRef" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "quotationAmount" DOUBLE PRECISION,
    "quotationAt" TIMESTAMP(3),
    "purchaseOrderNumber" TEXT,
    "purchaseOrderAt" TIMESTAMP(3),
    "invoicedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_job_costs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "MaintenanceCostKind" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_job_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_job_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "MaintenanceEventType" NOT NULL,
    "fromStatus" "MaintenanceJobStatus",
    "toStatus" "MaintenanceJobStatus",
    "actorId" TEXT,
    "actorName" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_job_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_average_events" (
    "id" TEXT NOT NULL,
    "vesselName" TEXT NOT NULL,
    "vesselImo" TEXT,
    "vesselMmsi" TEXT,
    "voyageNumber" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "portOfRefuge" TEXT,
    "nature" TEXT NOT NULL,
    "declaredBy" TEXT,
    "declaredAt" TIMESTAMP(3),
    "adjusterName" TEXT,
    "adjusterRef" TEXT,
    "totalExpenditure" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSacrifice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "GeneralAverageStatus" NOT NULL DEFAULT 'DECLARED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "general_average_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_average_contributors" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "shipmentFileId" TEXT NOT NULL,
    "contributoryValue" DOUBLE PRECISION NOT NULL,
    "valueBasis" "GeneralAverageValueBasis" NOT NULL DEFAULT 'DECLARED',
    "adjustedValue" DOUBLE PRECISION,
    "sharePct" DOUBLE PRECISION,
    "estimatedContribution" DOUBLE PRECISION,
    "assessedContribution" DOUBLE PRECISION,
    "securityType" "GeneralAverageSecurity",
    "securityAmount" DOUBLE PRECISION,
    "securityRef" TEXT,
    "securityLodgedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releasedBy" TEXT,
    "balanceDue" DOUBLE PRECISION,
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "general_average_contributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_incidents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REPORTED',
    "reportedByDriverId" TEXT,
    "reportedByUserId" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportLat" DOUBLE PRECISION NOT NULL,
    "reportLng" DOUBLE PRECISION NOT NULL,
    "locationSource" TEXT NOT NULL,
    "geohash6" TEXT,
    "narrative" TEXT,
    "zoneId" TEXT,
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "broadcastCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentRef" TEXT,
    "hsCode" TEXT,
    "originStatus" TEXT,
    "dutyEstimated" DOUBLE PRECISION,
    "dutyActual" DOUBLE PRECISION,
    "declarationRef" TEXT,
    "capturedBy" TEXT,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_users_email_key" ON "owner_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "owner_refresh_tokens_token_key" ON "owner_refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "companies_email_key" ON "companies"("email");

-- CreateIndex
CREATE UNIQUE INDEX "companies_portalSubdomain_key" ON "companies"("portalSubdomain");

-- CreateIndex
CREATE INDEX "integration_credentials_provider_externalRef_idx" ON "integration_credentials"("provider", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_companyId_provider_key" ON "integration_credentials"("companyId", "provider");

-- CreateIndex
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_companyId_key" ON "users"("email", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_companyId_idx" ON "api_keys"("companyId");

-- CreateIndex
CREATE INDEX "webhook_endpoints_companyId_idx" ON "webhook_endpoints"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_companyId_key" ON "approval_requests"("companyId");

-- CreateIndex
CREATE INDEX "plan_upgrade_requests_companyId_idx" ON "plan_upgrade_requests"("companyId");

-- CreateIndex
CREATE INDEX "plan_upgrade_requests_status_idx" ON "plan_upgrade_requests"("status");

-- CreateIndex
CREATE INDEX "objectives_quarter_idx" ON "objectives"("quarter");

-- CreateIndex
CREATE INDEX "key_results_objectiveId_idx" ON "key_results"("objectiveId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- CreateIndex
CREATE INDEX "driver_duties_companyId_startedAt_idx" ON "driver_duties"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "driver_duties_driverId_status_idx" ON "driver_duties"("driverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_ratingToken_key" ON "drivers"("ratingToken");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers"("userId");

-- CreateIndex
CREATE INDEX "drivers_companyId_idx" ON "drivers"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_refresh_tokens_token_key" ON "driver_refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "driver_push_subscriptions_endpoint_key" ON "driver_push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "driver_push_subscriptions_driverId_idx" ON "driver_push_subscriptions"("driverId");

-- CreateIndex
CREATE INDEX "branches_companyId_idx" ON "branches"("companyId");

-- CreateIndex
CREATE INDEX "shipment_files_companyId_status_idx" ON "shipment_files"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_files_fileNumber_companyId_key" ON "shipment_files"("fileNumber", "companyId");

-- CreateIndex
CREATE INDEX "shipment_containers_fileId_idx" ON "shipment_containers"("fileId");

-- CreateIndex
CREATE INDEX "cargo_lines_fileId_idx" ON "cargo_lines"("fileId");

-- CreateIndex
CREATE INDEX "shipment_charges_fileId_idx" ON "shipment_charges"("fileId");

-- CreateIndex
CREATE INDEX "shipment_documents_fileId_idx" ON "shipment_documents"("fileId");

-- CreateIndex
CREATE INDEX "shipment_milestones_fileId_idx" ON "shipment_milestones"("fileId");

-- CreateIndex
CREATE INDEX "customs_declarations_fileId_idx" ON "customs_declarations"("fileId");

-- CreateIndex
CREATE INDEX "customs_declarations_companyId_status_idx" ON "customs_declarations"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customs_edi_credentials_companyId_key" ON "customs_edi_credentials"("companyId");

-- CreateIndex
CREATE INDEX "customs_edi_messages_declarationId_idx" ON "customs_edi_messages"("declarationId");

-- CreateIndex
CREATE INDEX "customs_edi_messages_companyId_createdAt_idx" ON "customs_edi_messages"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "carriers_companyId_isActive_idx" ON "carriers"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "carrier_rates_companyId_idx" ON "carrier_rates"("companyId");

-- CreateIndex
CREATE INDEX "carrier_rates_carrierId_idx" ON "carrier_rates"("carrierId");

-- CreateIndex
CREATE INDEX "disbursements_companyId_status_idx" ON "disbursements"("companyId", "status");

-- CreateIndex
CREATE INDEX "disbursements_fileId_idx" ON "disbursements"("fileId");

-- CreateIndex
CREATE INDEX "disbursements_invoiceId_idx" ON "disbursements"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "waybills_ratingToken_key" ON "waybills"("ratingToken");

-- CreateIndex
CREATE UNIQUE INDEX "waybills_sourceCollectionId_key" ON "waybills"("sourceCollectionId");

-- CreateIndex
CREATE INDEX "waybills_companyId_status_idx" ON "waybills"("companyId", "status");

-- CreateIndex
CREATE INDEX "waybills_companyId_createdAt_idx" ON "waybills"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "waybills_companyId_updatedAt_idx" ON "waybills"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "waybills_railConsignmentId_idx" ON "waybills"("railConsignmentId");

-- CreateIndex
CREATE INDEX "waybills_status_updatedAt_idx" ON "waybills"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "waybills_trackingNumber_companyId_key" ON "waybills"("trackingNumber", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "waybill_inbox_items_waybillId_key" ON "waybill_inbox_items"("waybillId");

-- CreateIndex
CREATE INDEX "waybill_inbox_items_companyId_idx" ON "waybill_inbox_items"("companyId");

-- CreateIndex
CREATE INDEX "collections_companyId_idx" ON "collections"("companyId");

-- CreateIndex
CREATE INDEX "shipments_companyId_idx" ON "shipments"("companyId");

-- CreateIndex
CREATE INDEX "manifests_companyId_idx" ON "manifests"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "manifests_companyId_code_key" ON "manifests"("companyId", "code");

-- CreateIndex
CREATE INDEX "invoices_publicToken_idx" ON "invoices"("publicToken");

-- CreateIndex
CREATE INDEX "invoices_companyId_idx" ON "invoices"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_companyId_key" ON "invoices"("invoiceNumber", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_companyId_key" ON "invoices"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_waybillId_key" ON "invoice_items"("waybillId");

-- CreateIndex
CREATE INDEX "rate_cards_companyId_idx" ON "rate_cards"("companyId");

-- CreateIndex
CREATE INDEX "quotes_companyId_idx" ON "quotes"("companyId");

-- CreateIndex
CREATE INDEX "notifications_companyId_type_createdAt_idx" ON "notifications"("companyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_companyId_createdAt_idx" ON "notifications"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_threads_phone_companyId_key" ON "whatsapp_threads"("phone", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_wabaMessageId_key" ON "whatsapp_messages"("wabaMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_companyId_idx" ON "payments"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_portal_links_token_key" ON "booking_portal_links"("token");

-- CreateIndex
CREATE INDEX "booking_requests_companyId_status_idx" ON "booking_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "booking_requests_companyId_createdAt_idx" ON "booking_requests"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "booking_requests_linkId_idx" ON "booking_requests"("linkId");

-- CreateIndex
CREATE INDEX "ai_events_companyId_idx" ON "ai_events"("companyId");

-- CreateIndex
CREATE INDEX "email_hub_items_companyId_idx" ON "email_hub_items"("companyId");

-- CreateIndex
CREATE INDEX "email_attachments_emailHubItemId_idx" ON "email_attachments"("emailHubItemId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_targetId_idx" ON "audit_logs"("targetId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "mrr_snapshots_date_key" ON "mrr_snapshots"("date");

-- CreateIndex
CREATE INDEX "mrr_snapshots_date_idx" ON "mrr_snapshots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "platform_alerts_dedupeKey_key" ON "platform_alerts"("dedupeKey");

-- CreateIndex
CREATE INDEX "platform_alerts_resolved_idx" ON "platform_alerts"("resolved");

-- CreateIndex
CREATE INDEX "platform_alerts_createdAt_idx" ON "platform_alerts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "driver_wallets_driverId_key" ON "driver_wallets"("driverId");

-- CreateIndex
CREATE INDEX "cod_transactions_walletId_createdAt_idx" ON "cod_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "cod_transactions_companyId_idx" ON "cod_transactions"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "cod_transactions_walletId_idempotencyKey_key" ON "cod_transactions"("walletId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_nextRetryAt_idx" ON "webhook_deliveries"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpointId_createdAt_idx" ON "webhook_deliveries"("endpointId", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_events_status_nextAttemptAt_idx" ON "outbox_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "outbox_events_companyId_createdAt_idx" ON "outbox_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "vehicle_services_driverId_servicedAt_idx" ON "vehicle_services"("driverId", "servicedAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_services_driverId_idempotencyKey_key" ON "vehicle_services"("driverId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "clients_companyId_billingType_idx" ON "clients"("companyId", "billingType");

-- CreateIndex
CREATE INDEX "clients_companyId_name_idx" ON "clients"("companyId", "name");

-- CreateIndex
CREATE INDEX "driver_chat_messages_driverId_createdAt_idx" ON "driver_chat_messages"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "driver_chat_messages_companyId_createdAt_idx" ON "driver_chat_messages"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "returns_companyId_idx" ON "returns"("companyId");

-- CreateIndex
CREATE INDEX "returns_status_idx" ON "returns"("status");

-- CreateIndex
CREATE INDEX "returns_waybillId_idx" ON "returns"("waybillId");

-- CreateIndex
CREATE UNIQUE INDEX "returns_rmaNumber_companyId_key" ON "returns"("rmaNumber", "companyId");

-- CreateIndex
CREATE INDEX "return_items_returnId_idx" ON "return_items"("returnId");

-- CreateIndex
CREATE INDEX "credit_notes_companyId_status_idx" ON "credit_notes"("companyId", "status");

-- CreateIndex
CREATE INDEX "credit_notes_companyId_clientName_idx" ON "credit_notes"("companyId", "clientName");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_number_companyId_key" ON "credit_notes"("number", "companyId");

-- CreateIndex
CREATE INDEX "debit_notes_companyId_status_idx" ON "debit_notes"("companyId", "status");

-- CreateIndex
CREATE INDEX "debit_notes_companyId_clientName_idx" ON "debit_notes"("companyId", "clientName");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_number_companyId_key" ON "debit_notes"("number", "companyId");

-- CreateIndex
CREATE INDEX "salespeople_companyId_idx" ON "salespeople"("companyId");

-- CreateIndex
CREATE INDEX "commissions_companyId_periodMonth_idx" ON "commissions"("companyId", "periodMonth");

-- CreateIndex
CREATE INDEX "commissions_salespersonId_status_idx" ON "commissions"("salespersonId", "status");

-- CreateIndex
CREATE INDEX "accounting_connections_companyId_idx" ON "accounting_connections"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_connections_companyId_provider_key" ON "accounting_connections"("companyId", "provider");

-- CreateIndex
CREATE INDEX "accounting_sync_logs_companyId_status_idx" ON "accounting_sync_logs"("companyId", "status");

-- CreateIndex
CREATE INDEX "accounting_sync_logs_connectionId_idx" ON "accounting_sync_logs"("connectionId");

-- CreateIndex
CREATE INDEX "accounting_sync_logs_documentId_idx" ON "accounting_sync_logs"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "sso_connections_companyId_key" ON "sso_connections"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "error_events_fingerprint_key" ON "error_events"("fingerprint");

-- CreateIndex
CREATE INDEX "error_events_resolved_lastSeenAt_idx" ON "error_events"("resolved", "lastSeenAt");

-- CreateIndex
CREATE INDEX "error_events_source_level_idx" ON "error_events"("source", "level");

-- CreateIndex
CREATE INDEX "support_tickets_companyId_status_idx" ON "support_tickets"("companyId", "status");

-- CreateIndex
CREATE INDEX "courier_orders_companyId_status_idx" ON "courier_orders"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "courier_orders_companyId_reference_key" ON "courier_orders"("companyId", "reference");

-- CreateIndex
CREATE INDEX "warehouses_companyId_idx" ON "warehouses"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_companyId_code_key" ON "warehouses"("companyId", "code");

-- CreateIndex
CREATE INDEX "warehouse_zones_warehouseId_idx" ON "warehouse_zones"("warehouseId");

-- CreateIndex
CREATE INDEX "bin_locations_zoneId_idx" ON "bin_locations"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "bin_locations_zoneId_code_key" ON "bin_locations"("zoneId", "code");

-- CreateIndex
CREATE INDEX "inventory_items_companyId_sku_idx" ON "inventory_items"("companyId", "sku");

-- CreateIndex
CREATE INDEX "inventory_items_binId_idx" ON "inventory_items"("binId");

-- CreateIndex
CREATE INDEX "inventory_items_companyId_status_idx" ON "inventory_items"("companyId", "status");

-- CreateIndex
CREATE INDEX "inventory_items_expiryDate_idx" ON "inventory_items"("expiryDate");

-- CreateIndex
CREATE INDEX "inventory_items_productVariantId_idx" ON "inventory_items"("productVariantId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_sku_idx" ON "stock_movements"("companyId", "sku");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_type_idx" ON "stock_movements"("companyId", "type");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_performedAt_idx" ON "stock_movements"("companyId", "performedAt");

-- CreateIndex
CREATE INDEX "goods_receipts_companyId_status_idx" ON "goods_receipts"("companyId", "status");

-- CreateIndex
CREATE INDEX "goods_receipts_warehouseId_idx" ON "goods_receipts"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_companyId_receiptNumber_key" ON "goods_receipts"("companyId", "receiptNumber");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_goodsReceiptId_idx" ON "goods_receipt_lines"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "pick_orders_companyId_status_idx" ON "pick_orders"("companyId", "status");

-- CreateIndex
CREATE INDEX "pick_orders_warehouseId_idx" ON "pick_orders"("warehouseId");

-- CreateIndex
CREATE INDEX "pick_orders_assignedTo_status_idx" ON "pick_orders"("assignedTo", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pick_orders_companyId_orderNumber_key" ON "pick_orders"("companyId", "orderNumber");

-- CreateIndex
CREATE INDEX "pick_order_lines_pickOrderId_idx" ON "pick_order_lines"("pickOrderId");

-- CreateIndex
CREATE INDEX "cycle_counts_companyId_status_idx" ON "cycle_counts"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_counts_companyId_countNumber_key" ON "cycle_counts"("companyId", "countNumber");

-- CreateIndex
CREATE INDEX "cycle_count_lines_cycleCountId_idx" ON "cycle_count_lines"("cycleCountId");

-- CreateIndex
CREATE INDEX "dock_slots_warehouseId_idx" ON "dock_slots"("warehouseId");

-- CreateIndex
CREATE INDEX "dock_appointments_dockSlotId_scheduledStart_idx" ON "dock_appointments"("dockSlotId", "scheduledStart");

-- CreateIndex
CREATE INDEX "dock_appointments_companyId_status_idx" ON "dock_appointments"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_cost_allocations_waybillId_key" ON "delivery_cost_allocations"("waybillId");

-- CreateIndex
CREATE INDEX "delivery_cost_allocations_companyId_period_idx" ON "delivery_cost_allocations"("companyId", "period");

-- CreateIndex
CREATE INDEX "delivery_cost_allocations_companyId_clientName_idx" ON "delivery_cost_allocations"("companyId", "clientName");

-- CreateIndex
CREATE INDEX "delivery_cost_allocations_companyId_fromZone_toZone_idx" ON "delivery_cost_allocations"("companyId", "fromZone", "toZone");

-- CreateIndex
CREATE INDEX "trip_cost_entries_companyId_occurredAt_idx" ON "trip_cost_entries"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "trip_cost_entries_companyId_driverId_occurredAt_idx" ON "trip_cost_entries"("companyId", "driverId", "occurredAt");

-- CreateIndex
CREATE INDEX "trip_cost_entries_waybillId_idx" ON "trip_cost_entries"("waybillId");

-- CreateIndex
CREATE INDEX "lane_profitability_companyId_period_idx" ON "lane_profitability"("companyId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "lane_profitability_companyId_period_fromZone_toZone_key" ON "lane_profitability"("companyId", "period", "fromZone", "toZone");

-- CreateIndex
CREATE INDEX "client_profitability_companyId_period_idx" ON "client_profitability"("companyId", "period");

-- CreateIndex
CREATE INDEX "client_profitability_companyId_clientName_idx" ON "client_profitability"("companyId", "clientName");

-- CreateIndex
CREATE UNIQUE INDEX "client_profitability_companyId_period_clientName_key" ON "client_profitability"("companyId", "period", "clientName");

-- CreateIndex
CREATE INDEX "pricing_recommendations_companyId_status_idx" ON "pricing_recommendations"("companyId", "status");

-- CreateIndex
CREATE INDEX "pricing_recommendations_companyId_type_idx" ON "pricing_recommendations"("companyId", "type");

-- CreateIndex
CREATE INDEX "revenue_forecasts_companyId_idx" ON "revenue_forecasts"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_forecasts_companyId_forecastPeriod_forecastType_key" ON "revenue_forecasts"("companyId", "forecastPeriod", "forecastType");

-- CreateIndex
CREATE UNIQUE INDEX "commercial_configs_companyId_key" ON "commercial_configs"("companyId");

-- CreateIndex
CREATE INDEX "commercial_notes_companyId_createdAt_idx" ON "commercial_notes"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "logistics_analytics_companyId_idx" ON "logistics_analytics"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_analytics_companyId_period_key" ON "logistics_analytics"("companyId", "period");

-- CreateIndex
CREATE INDEX "carbon_reports_companyId_idx" ON "carbon_reports"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "carbon_reports_companyId_period_key" ON "carbon_reports"("companyId", "period");

-- CreateIndex
CREATE INDEX "safety_zones_companyId_isActive_idx" ON "safety_zones"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "safety_zones_lat_lng_idx" ON "safety_zones"("lat", "lng");

-- CreateIndex
CREATE INDEX "safety_alerts_companyId_createdAt_idx" ON "safety_alerts"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "safety_alerts_driverId_createdAt_idx" ON "safety_alerts"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "safety_alerts_zoneId_idx" ON "safety_alerts"("zoneId");

-- CreateIndex
CREATE INDEX "address_book_entries_companyId_type_idx" ON "address_book_entries"("companyId", "type");

-- CreateIndex
CREATE INDEX "address_book_entries_companyId_usageCount_idx" ON "address_book_entries"("companyId", "usageCount");

-- CreateIndex
CREATE INDEX "tracking_events_waybillId_createdAt_idx" ON "tracking_events"("waybillId", "createdAt");

-- CreateIndex
CREATE INDEX "tracking_events_companyId_createdAt_idx" ON "tracking_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "route_optimizations_companyId_createdAt_idx" ON "route_optimizations"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_allocations_companyId_idx" ON "delivery_allocations"("companyId");

-- CreateIndex
CREATE INDEX "delivery_allocations_optimizationId_idx" ON "delivery_allocations"("optimizationId");

-- CreateIndex
CREATE INDEX "delivery_notes_companyId_createdAt_idx" ON "delivery_notes"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_notes_waybillId_idx" ON "delivery_notes"("waybillId");

-- CreateIndex
CREATE INDEX "order_flow_integrations_companyId_idx" ON "order_flow_integrations"("companyId");

-- CreateIndex
CREATE INDEX "order_sync_logs_integrationId_createdAt_idx" ON "order_sync_logs"("integrationId", "createdAt");

-- CreateIndex
CREATE INDEX "order_sync_logs_companyId_createdAt_idx" ON "order_sync_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "route_plans_companyId_scheduledDate_idx" ON "route_plans"("companyId", "scheduledDate");

-- CreateIndex
CREATE INDEX "route_plans_driverId_idx" ON "route_plans"("driverId");

-- CreateIndex
CREATE INDEX "electronic_pods_companyId_createdAt_idx" ON "electronic_pods"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "electronic_pods_waybillId_idx" ON "electronic_pods"("waybillId");

-- CreateIndex
CREATE INDEX "live_tracking_sessions_companyId_isActive_idx" ON "live_tracking_sessions"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "live_tracking_sessions_driverId_isActive_idx" ON "live_tracking_sessions"("driverId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "digital_payments_reference_key" ON "digital_payments"("reference");

-- CreateIndex
CREATE INDEX "digital_payments_companyId_createdAt_idx" ON "digital_payments"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "digital_payments_waybillId_idx" ON "digital_payments"("waybillId");

-- CreateIndex
CREATE INDEX "rail_consignments_companyId_status_idx" ON "rail_consignments"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rail_consignments_consignmentNumber_companyId_key" ON "rail_consignments"("consignmentNumber", "companyId");

-- CreateIndex
CREATE INDEX "wagons_consignmentId_idx" ON "wagons"("consignmentId");

-- CreateIndex
CREATE INDEX "rail_train_manifests_companyId_status_idx" ON "rail_train_manifests"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_train_manifests_consignmentId_idx" ON "rail_train_manifests"("consignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "rail_train_manifests_companyId_manifestNumber_revision_key" ON "rail_train_manifests"("companyId", "manifestNumber", "revision");

-- CreateIndex
CREATE INDEX "rail_train_manifest_wagons_manifestId_idx" ON "rail_train_manifest_wagons"("manifestId");

-- CreateIndex
CREATE UNIQUE INDEX "rail_devices_tokenHash_key" ON "rail_devices"("tokenHash");

-- CreateIndex
CREATE INDEX "rail_devices_companyId_status_idx" ON "rail_devices"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rail_devices_companyId_deviceCode_key" ON "rail_devices"("companyId", "deviceCode");

-- CreateIndex
CREATE INDEX "rail_telemetry_points_deviceId_recordedAt_idx" ON "rail_telemetry_points"("deviceId", "recordedAt");

-- CreateIndex
CREATE INDEX "rail_telemetry_points_companyId_recordedAt_idx" ON "rail_telemetry_points"("companyId", "recordedAt");

-- CreateIndex
CREATE INDEX "rail_telemetry_alerts_companyId_status_idx" ON "rail_telemetry_alerts"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_telemetry_alerts_deviceId_raisedAt_idx" ON "rail_telemetry_alerts"("deviceId", "raisedAt");

-- CreateIndex
CREATE INDEX "intermodal_legs_consignmentId_idx" ON "intermodal_legs"("consignmentId");

-- CreateIndex
CREATE INDEX "rail_handoff_readiness_companyId_status_idx" ON "rail_handoff_readiness"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_handoff_readiness_consignmentId_idx" ON "rail_handoff_readiness"("consignmentId");

-- CreateIndex
CREATE INDEX "rail_handoff_readiness_warehouseId_idx" ON "rail_handoff_readiness"("warehouseId");

-- CreateIndex
CREATE INDEX "rail_handoff_evidence_companyId_type_status_idx" ON "rail_handoff_evidence"("companyId", "type", "status");

-- CreateIndex
CREATE INDEX "rail_handoff_evidence_readinessId_type_idx" ON "rail_handoff_evidence"("readinessId", "type");

-- CreateIndex
CREATE INDEX "rail_handoff_evidence_waybillId_idx" ON "rail_handoff_evidence"("waybillId");

-- CreateIndex
CREATE INDEX "rail_consignment_events_consignmentId_idx" ON "rail_consignment_events"("consignmentId");

-- CreateIndex
CREATE INDEX "rail_schedule_imports_companyId_importedAt_idx" ON "rail_schedule_imports"("companyId", "importedAt");

-- CreateIndex
CREATE INDEX "rail_schedule_imports_scopeKey_importedAt_idx" ON "rail_schedule_imports"("scopeKey", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rail_schedule_imports_scopeKey_sourceHash_key" ON "rail_schedule_imports"("scopeKey", "sourceHash");

-- CreateIndex
CREATE INDEX "rail_schedule_rows_importId_train_idx" ON "rail_schedule_rows"("importId", "train");

-- CreateIndex
CREATE INDEX "rail_schedule_rows_companyId_origin_train_idx" ON "rail_schedule_rows"("companyId", "origin", "train");

-- CreateIndex
CREATE UNIQUE INDEX "rail_schedule_rows_importId_sourceRow_key" ON "rail_schedule_rows"("importId", "sourceRow");

-- CreateIndex
CREATE UNIQUE INDEX "rail_networks_code_key" ON "rail_networks"("code");

-- CreateIndex
CREATE INDEX "rail_networks_companyId_idx" ON "rail_networks"("companyId");

-- CreateIndex
CREATE INDEX "rail_escalation_rungs_networkId_afterHours_idx" ON "rail_escalation_rungs"("networkId", "afterHours");

-- CreateIndex
CREATE UNIQUE INDEX "rail_escalation_rungs_networkId_code_key" ON "rail_escalation_rungs"("networkId", "code");

-- CreateIndex
CREATE INDEX "rail_handshake_reports_companyId_status_idx" ON "rail_handshake_reports"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_handshake_reports_companyId_reportDate_idx" ON "rail_handshake_reports"("companyId", "reportDate");

-- CreateIndex
CREATE INDEX "rail_handshake_reports_networkId_idx" ON "rail_handshake_reports"("networkId");

-- CreateIndex
CREATE UNIQUE INDEX "rail_handshake_reports_reportNumber_companyId_key" ON "rail_handshake_reports"("reportNumber", "companyId");

-- CreateIndex
CREATE INDEX "rail_handshake_deviations_reportId_idx" ON "rail_handshake_deviations"("reportId");

-- CreateIndex
CREATE INDEX "rail_handshake_deviations_status_idx" ON "rail_handshake_deviations"("status");

-- CreateIndex
CREATE INDEX "rail_handshake_deviations_escalationStage_idx" ON "rail_handshake_deviations"("escalationStage");

-- CreateIndex
CREATE INDEX "rail_handshake_deviations_escalationRungId_idx" ON "rail_handshake_deviations"("escalationRungId");

-- CreateIndex
CREATE INDEX "delivery_intelligence_stats_companyId_computedAt_idx" ON "delivery_intelligence_stats"("companyId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "process_definitions_currentVersionId_key" ON "process_definitions"("currentVersionId");

-- CreateIndex
CREATE INDEX "process_definitions_companyId_isActive_idx" ON "process_definitions"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "process_definitions_companyId_code_key" ON "process_definitions"("companyId", "code");

-- CreateIndex
CREATE INDEX "process_versions_companyId_status_idx" ON "process_versions"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "process_versions_definitionId_versionNumber_key" ON "process_versions"("definitionId", "versionNumber");

-- CreateIndex
CREATE INDEX "process_step_definitions_companyId_idx" ON "process_step_definitions"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "process_step_definitions_versionId_stepNumber_key" ON "process_step_definitions"("versionId", "stepNumber");

-- CreateIndex
CREATE UNIQUE INDEX "process_step_definitions_versionId_code_key" ON "process_step_definitions"("versionId", "code");

-- CreateIndex
CREATE INDEX "process_automation_rules_companyId_isActive_idx" ON "process_automation_rules"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "process_automation_rules_versionId_code_key" ON "process_automation_rules"("versionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "process_instances_goodsReceiptId_key" ON "process_instances"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "process_instances_companyId_definitionId_idx" ON "process_instances"("companyId", "definitionId");

-- CreateIndex
CREATE INDEX "process_instances_versionId_idx" ON "process_instances"("versionId");

-- CreateIndex
CREATE INDEX "process_instances_companyId_status_idx" ON "process_instances"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "process_instances_companyId_businessKey_key" ON "process_instances"("companyId", "businessKey");

-- CreateIndex
CREATE INDEX "process_step_instances_instanceId_stepNumber_idx" ON "process_step_instances"("instanceId", "stepNumber");

-- CreateIndex
CREATE INDEX "process_step_instances_companyId_idx" ON "process_step_instances"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "process_step_instances_instanceId_stepDefinitionId_attempt_key" ON "process_step_instances"("instanceId", "stepDefinitionId", "attempt");

-- CreateIndex
CREATE INDEX "process_incidents_instanceId_status_idx" ON "process_incidents"("instanceId", "status");

-- CreateIndex
CREATE INDEX "process_incidents_companyId_severity_idx" ON "process_incidents"("companyId", "severity");

-- CreateIndex
CREATE INDEX "process_solutions_incidentId_idx" ON "process_solutions"("incidentId");

-- CreateIndex
CREATE INDEX "process_solutions_companyId_status_idx" ON "process_solutions"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "process_outcomes_instanceId_key" ON "process_outcomes"("instanceId");

-- CreateIndex
CREATE INDEX "process_outcomes_companyId_status_idx" ON "process_outcomes"("companyId", "status");

-- CreateIndex
CREATE INDEX "process_outcomes_companyId_completedAt_idx" ON "process_outcomes"("companyId", "completedAt");

-- CreateIndex
CREATE INDEX "process_change_proposals_definitionId_status_idx" ON "process_change_proposals"("definitionId", "status");

-- CreateIndex
CREATE INDEX "process_change_proposals_companyId_status_idx" ON "process_change_proposals"("companyId", "status");

-- CreateIndex
CREATE INDEX "automation_runs_instanceId_idx" ON "automation_runs"("instanceId");

-- CreateIndex
CREATE INDEX "automation_runs_ruleId_idx" ON "automation_runs"("ruleId");

-- CreateIndex
CREATE INDEX "automation_runs_companyId_executedAt_idx" ON "automation_runs"("companyId", "executedAt");

-- CreateIndex
CREATE INDEX "process_audit_events_companyId_createdAt_idx" ON "process_audit_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "process_audit_events_definitionId_idx" ON "process_audit_events"("definitionId");

-- CreateIndex
CREATE INDEX "process_audit_events_instanceId_idx" ON "process_audit_events"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "products_previousRevisionId_key" ON "products"("previousRevisionId");

-- CreateIndex
CREATE INDEX "products_companyId_status_idx" ON "products"("companyId", "status");

-- CreateIndex
CREATE INDEX "products_companyId_attributeFingerprint_idx" ON "products"("companyId", "attributeFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "products_companyId_code_key" ON "products"("companyId", "code");

-- CreateIndex
CREATE INDEX "product_variants_companyId_productId_idx" ON "product_variants"("companyId", "productId");

-- CreateIndex
CREATE INDEX "product_variants_companyId_status_idx" ON "product_variants"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_companyId_code_key" ON "product_variants"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_companyId_sku_key" ON "product_variants"("companyId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_companyId_attributeFingerprint_key" ON "product_variants"("companyId", "attributeFingerprint");

-- CreateIndex
CREATE INDEX "product_aliases_companyId_productId_idx" ON "product_aliases"("companyId", "productId");

-- CreateIndex
CREATE INDEX "product_aliases_companyId_variantId_idx" ON "product_aliases"("companyId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "product_aliases_companyId_type_value_supplierRef_customerRe_key" ON "product_aliases"("companyId", "type", "value", "supplierRef", "customerRef");

-- CreateIndex
CREATE UNIQUE INDEX "sku_sequences_companyId_key" ON "sku_sequences"("companyId");

-- CreateIndex
CREATE INDEX "master_data_audit_events_companyId_createdAt_idx" ON "master_data_audit_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "master_data_audit_events_productId_idx" ON "master_data_audit_events"("productId");

-- CreateIndex
CREATE INDEX "master_data_audit_events_variantId_idx" ON "master_data_audit_events"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "rail_corridor_nodes_code_key" ON "rail_corridor_nodes"("code");

-- CreateIndex
CREATE INDEX "rail_corridor_nodes_networkId_idx" ON "rail_corridor_nodes"("networkId");

-- CreateIndex
CREATE UNIQUE INDEX "rail_yard_specs_code_key" ON "rail_yard_specs"("code");

-- CreateIndex
CREATE INDEX "rail_yard_specs_corridorCode_idx" ON "rail_yard_specs"("corridorCode");

-- CreateIndex
CREATE INDEX "rail_operator_compliance_docs_companyId_docType_idx" ON "rail_operator_compliance_docs"("companyId", "docType");

-- CreateIndex
CREATE INDEX "rail_operator_compliance_docs_companyId_validUntil_idx" ON "rail_operator_compliance_docs"("companyId", "validUntil");

-- CreateIndex
CREATE INDEX "rail_slot_applications_companyId_status_idx" ON "rail_slot_applications"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_slot_applications_companyId_corridorCode_idx" ON "rail_slot_applications"("companyId", "corridorCode");

-- CreateIndex
CREATE INDEX "rail_slot_applications_status_mobilizeBy_idx" ON "rail_slot_applications"("status", "mobilizeBy");

-- CreateIndex
CREATE UNIQUE INDEX "rail_slot_applications_companyId_applicationNumber_key" ON "rail_slot_applications"("companyId", "applicationNumber");

-- CreateIndex
CREATE INDEX "rail_corridor_capacity_corridor_period_idx" ON "rail_corridor_capacity"("companyId", "corridorCode", "validFrom", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "rail_corridor_capacity_companyId_corridorCode_validFrom_key" ON "rail_corridor_capacity"("companyId", "corridorCode", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "rail_cancellation_codes_code_key" ON "rail_cancellation_codes"("code");

-- CreateIndex
CREATE INDEX "rail_cancellation_codes_networkId_idx" ON "rail_cancellation_codes"("networkId");

-- CreateIndex
CREATE INDEX "rail_slot_change_requests_companyId_status_idx" ON "rail_slot_change_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_slot_change_requests_companyId_consignmentId_idx" ON "rail_slot_change_requests"("companyId", "consignmentId");

-- CreateIndex
CREATE INDEX "rail_slot_change_requests_companyId_trainSlotRef_idx" ON "rail_slot_change_requests"("companyId", "trainSlotRef");

-- CreateIndex
CREATE UNIQUE INDEX "rail_slot_change_requests_companyId_requestNumber_key" ON "rail_slot_change_requests"("companyId", "requestNumber");

-- CreateIndex
CREATE INDEX "rail_possession_windows_companyId_corridorCode_startsAt_idx" ON "rail_possession_windows"("companyId", "corridorCode", "startsAt");

-- CreateIndex
CREATE INDEX "rail_possession_windows_companyId_status_idx" ON "rail_possession_windows"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_occurrence_reports_companyId_status_idx" ON "rail_occurrence_reports"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_occurrence_reports_companyId_occurredAt_idx" ON "rail_occurrence_reports"("companyId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "rail_occurrence_reports_companyId_occurrenceNumber_key" ON "rail_occurrence_reports"("companyId", "occurrenceNumber");

-- CreateIndex
CREATE INDEX "rail_tariff_schedules_financialYear_idx" ON "rail_tariff_schedules"("financialYear");

-- CreateIndex
CREATE INDEX "rail_tariff_schedules_networkId_idx" ON "rail_tariff_schedules"("networkId");

-- CreateIndex
CREATE UNIQUE INDEX "rail_tariff_schedules_corridorCode_financialYear_key" ON "rail_tariff_schedules"("corridorCode", "financialYear");

-- CreateIndex
CREATE UNIQUE INDEX "rail_ancillary_services_code_key" ON "rail_ancillary_services"("code");

-- CreateIndex
CREATE INDEX "rail_ancillary_services_serviceNumber_idx" ON "rail_ancillary_services"("serviceNumber");

-- CreateIndex
CREATE INDEX "rail_ancillary_services_tier_idx" ON "rail_ancillary_services"("tier");

-- CreateIndex
CREATE INDEX "rail_ancillary_services_networkId_idx" ON "rail_ancillary_services"("networkId");

-- CreateIndex
CREATE INDEX "rail_weighbridge_readings_companyId_consignmentId_createdAt_idx" ON "rail_weighbridge_readings"("companyId", "consignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "rail_tariff_calculations_companyId_consignmentId_idx" ON "rail_tariff_calculations"("companyId", "consignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "rail_tariff_calculations_companyId_calculationNumber_key" ON "rail_tariff_calculations"("companyId", "calculationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_truck_appointments_shareToken_key" ON "terminal_truck_appointments"("shareToken");

-- CreateIndex
CREATE INDEX "terminal_truck_appointments_companyId_windowStart_idx" ON "terminal_truck_appointments"("companyId", "windowStart");

-- CreateIndex
CREATE INDEX "terminal_truck_appointments_companyId_status_idx" ON "terminal_truck_appointments"("companyId", "status");

-- CreateIndex
CREATE INDEX "terminal_truck_appointments_consignmentId_idx" ON "terminal_truck_appointments"("consignmentId");

-- CreateIndex
CREATE INDEX "terminal_truck_appointments_driverId_idx" ON "terminal_truck_appointments"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_truck_window_changes_activeAppointmentId_key" ON "terminal_truck_window_changes"("activeAppointmentId");

-- CreateIndex
CREATE INDEX "terminal_truck_window_changes_companyId_appointmentId_version_i" ON "terminal_truck_window_changes"("companyId", "appointmentId", "version");

-- CreateIndex
CREATE INDEX "terminal_truck_window_changes_companyId_status_idx" ON "terminal_truck_window_changes"("companyId", "status");

-- CreateIndex
CREATE INDEX "terminal_truck_window_changes_companyId_changedAt_idx" ON "terminal_truck_window_changes"("companyId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_truck_window_changes_companyId_idempotencyKey_key" ON "terminal_truck_window_changes"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "terminal_truck_window_recipients_companyId_ackState_idx" ON "terminal_truck_window_recipients"("companyId", "ackState");

-- CreateIndex
CREATE INDEX "terminal_truck_window_recipients_companyId_appointmentId_idx" ON "terminal_truck_window_recipients"("companyId", "appointmentId");

-- CreateIndex
CREATE INDEX "terminal_truck_window_recipients_driverId_ackState_idx" ON "terminal_truck_window_recipients"("driverId", "ackState");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_truck_window_recipients_changeId_recipientKey_key" ON "terminal_truck_window_recipients"("changeId", "recipientKey");

-- CreateIndex
CREATE INDEX "terminal_gate_policies_companyId_idx" ON "terminal_gate_policies"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_gate_policies_companyId_terminalName_key" ON "terminal_gate_policies"("companyId", "terminalName");

-- CreateIndex
CREATE INDEX "journeys_companyId_idx" ON "journeys"("companyId");

-- CreateIndex
CREATE INDEX "journeys_driverId_createdAt_idx" ON "journeys"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "journeys_companyId_status_idx" ON "journeys"("companyId", "status");

-- CreateIndex
CREATE INDEX "journey_stages_companyId_idx" ON "journey_stages"("companyId");

-- CreateIndex
CREATE INDEX "journey_stages_journeyId_stageNumber_idx" ON "journey_stages"("journeyId", "stageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "journey_stages_journeyId_stageNumber_key" ON "journey_stages"("journeyId", "stageNumber");

-- CreateIndex
CREATE INDEX "journey_updates_companyId_idx" ON "journey_updates"("companyId");

-- CreateIndex
CREATE INDEX "journey_updates_journeyId_idx" ON "journey_updates"("journeyId");

-- CreateIndex
CREATE INDEX "journey_updates_stageId_idx" ON "journey_updates"("stageId");

-- CreateIndex
CREATE INDEX "journey_updates_clientMessageId_idx" ON "journey_updates"("clientMessageId");

-- CreateIndex
CREATE INDEX "border_posts_companyId_idx" ON "border_posts"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "border_posts_companyId_code_key" ON "border_posts"("companyId", "code");

-- CreateIndex
CREATE INDEX "border_geofences_companyId_idx" ON "border_geofences"("companyId");

-- CreateIndex
CREATE INDEX "border_geofences_postId_idx" ON "border_geofences"("postId");

-- CreateIndex
CREATE INDEX "border_dwell_sessions_companyId_idx" ON "border_dwell_sessions"("companyId");

-- CreateIndex
CREATE INDEX "border_dwell_sessions_postId_idx" ON "border_dwell_sessions"("postId");

-- CreateIndex
CREATE INDEX "border_dwell_sessions_geofenceId_idx" ON "border_dwell_sessions"("geofenceId");

-- CreateIndex
CREATE INDEX "border_dwell_sessions_driverId_idx" ON "border_dwell_sessions"("driverId");

-- CreateIndex
CREATE INDEX "border_dwell_sessions_state_idx" ON "border_dwell_sessions"("state");

-- CreateIndex
CREATE INDEX "trips_companyId_idx" ON "trips"("companyId");

-- CreateIndex
CREATE INDEX "trips_driverId_createdAt_idx" ON "trips"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "trips_companyId_status_idx" ON "trips"("companyId", "status");

-- CreateIndex
CREATE INDEX "trip_legs_companyId_idx" ON "trip_legs"("companyId");

-- CreateIndex
CREATE INDEX "trip_legs_tripId_idx" ON "trip_legs"("tripId");

-- CreateIndex
CREATE INDEX "trip_legs_postId_idx" ON "trip_legs"("postId");

-- CreateIndex
CREATE INDEX "trip_legs_dwellSessionId_idx" ON "trip_legs"("dwellSessionId");

-- CreateIndex
CREATE INDEX "claims_companyId_status_idx" ON "claims"("companyId", "status");

-- CreateIndex
CREATE INDEX "claims_companyId_createdAt_idx" ON "claims"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "claims_waybillId_idx" ON "claims"("waybillId");

-- CreateIndex
CREATE UNIQUE INDEX "claims_number_companyId_key" ON "claims"("number", "companyId");

-- CreateIndex
CREATE INDEX "claim_events_claimId_createdAt_idx" ON "claim_events"("claimId", "createdAt");

-- CreateIndex
CREATE INDEX "claim_events_companyId_createdAt_idx" ON "claim_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "maintenance_assets_companyId_status_idx" ON "maintenance_assets"("companyId", "status");

-- CreateIndex
CREATE INDEX "maintenance_assets_companyId_assetClass_idx" ON "maintenance_assets"("companyId", "assetClass");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_assets_companyId_assetCode_key" ON "maintenance_assets"("companyId", "assetCode");

-- CreateIndex
CREATE INDEX "maintenance_meter_readings_assetId_readAt_idx" ON "maintenance_meter_readings"("assetId", "readAt");

-- CreateIndex
CREATE INDEX "maintenance_meter_readings_companyId_readAt_idx" ON "maintenance_meter_readings"("companyId", "readAt");

-- CreateIndex
CREATE INDEX "maintenance_fault_codes_companyId_active_idx" ON "maintenance_fault_codes"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_fault_codes_companyId_code_key" ON "maintenance_fault_codes"("companyId", "code");

-- CreateIndex
CREATE INDEX "maintenance_jobs_companyId_status_idx" ON "maintenance_jobs"("companyId", "status");

-- CreateIndex
CREATE INDEX "maintenance_jobs_companyId_reportedAt_idx" ON "maintenance_jobs"("companyId", "reportedAt");

-- CreateIndex
CREATE INDEX "maintenance_jobs_assetId_reportedAt_idx" ON "maintenance_jobs"("assetId", "reportedAt");

-- CreateIndex
CREATE INDEX "maintenance_jobs_companyId_warrantyExpiresAt_idx" ON "maintenance_jobs"("companyId", "warrantyExpiresAt");

-- CreateIndex
CREATE INDEX "maintenance_jobs_companyId_invoicedAt_idx" ON "maintenance_jobs"("companyId", "invoicedAt");

-- CreateIndex
CREATE INDEX "maintenance_jobs_companyId_purchaseOrderAt_idx" ON "maintenance_jobs"("companyId", "purchaseOrderAt");

-- CreateIndex
CREATE INDEX "maintenance_jobs_faultCodeId_idx" ON "maintenance_jobs"("faultCodeId");

-- CreateIndex
CREATE INDEX "maintenance_jobs_priorJobId_idx" ON "maintenance_jobs"("priorJobId");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_jobs_companyId_jobNumber_key" ON "maintenance_jobs"("companyId", "jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_jobs_companyId_idempotencyKey_key" ON "maintenance_jobs"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "maintenance_job_costs_jobId_idx" ON "maintenance_job_costs"("jobId");

-- CreateIndex
CREATE INDEX "maintenance_job_costs_companyId_kind_idx" ON "maintenance_job_costs"("companyId", "kind");

-- CreateIndex
CREATE INDEX "maintenance_job_events_jobId_createdAt_idx" ON "maintenance_job_events"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "maintenance_job_events_companyId_createdAt_idx" ON "maintenance_job_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "general_average_events_companyId_idx" ON "general_average_events"("companyId");

-- CreateIndex
CREATE INDEX "general_average_events_companyId_status_idx" ON "general_average_events"("companyId", "status");

-- CreateIndex
CREATE INDEX "general_average_contributors_eventId_idx" ON "general_average_contributors"("eventId");

-- CreateIndex
CREATE INDEX "general_average_contributors_shipmentFileId_idx" ON "general_average_contributors"("shipmentFileId");

-- CreateIndex
CREATE INDEX "general_average_contributors_companyId_idx" ON "general_average_contributors"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "general_average_contributors_eventId_shipmentFileId_key" ON "general_average_contributors"("eventId", "shipmentFileId");

-- CreateIndex
CREATE INDEX "safety_incidents_companyId_idx" ON "safety_incidents"("companyId");

-- CreateIndex
CREATE INDEX "safety_incidents_companyId_status_idx" ON "safety_incidents"("companyId", "status");

-- CreateIndex
CREATE INDEX "safety_incidents_companyId_reportedAt_idx" ON "safety_incidents"("companyId", "reportedAt");

-- CreateIndex
CREATE INDEX "trip_documents_companyId_idx" ON "trip_documents"("companyId");

-- CreateIndex
CREATE INDEX "trip_documents_companyId_tripId_idx" ON "trip_documents"("companyId", "tripId");

-- AddForeignKey
ALTER TABLE "owner_refresh_tokens" ADD CONSTRAINT "owner_refresh_tokens_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owner_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_upgrade_requests" ADD CONSTRAINT "plan_upgrade_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_duties" ADD CONSTRAINT "driver_duties_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_refresh_tokens" ADD CONSTRAINT "driver_refresh_tokens_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_files" ADD CONSTRAINT "shipment_files_masterFileId_fkey" FOREIGN KEY ("masterFileId") REFERENCES "shipment_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_containers" ADD CONSTRAINT "shipment_containers_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "shipment_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargo_lines" ADD CONSTRAINT "cargo_lines_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "shipment_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_charges" ADD CONSTRAINT "shipment_charges_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "shipment_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_documents" ADD CONSTRAINT "shipment_documents_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "shipment_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_milestones" ADD CONSTRAINT "shipment_milestones_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "shipment_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "shipment_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customs_edi_messages" ADD CONSTRAINT "customs_edi_messages_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "customs_declarations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carrier_rates" ADD CONSTRAINT "carrier_rates_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "shipment_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_invoiceId_companyId_fkey" FOREIGN KEY ("invoiceId", "companyId") REFERENCES "invoices"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_sourceCollectionId_fkey" FOREIGN KEY ("sourceCollectionId") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_railConsignmentId_fkey" FOREIGN KEY ("railConsignmentId") REFERENCES "rail_consignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_originBranchId_fkey" FOREIGN KEY ("originBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybill_inbox_items" ADD CONSTRAINT "waybill_inbox_items_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waybill_inbox_items" ADD CONSTRAINT "waybill_inbox_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifest_waybills" ADD CONSTRAINT "manifest_waybills_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manifest_waybills" ADD CONSTRAINT "manifest_waybills_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invoice_drafts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_threads" ADD CONSTRAINT "whatsapp_threads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "whatsapp_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_portal_links" ADD CONSTRAINT "booking_portal_links_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "booking_portal_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_hub_items" ADD CONSTRAINT "email_hub_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_emailHubItemId_fkey" FOREIGN KEY ("emailHubItemId") REFERENCES "email_hub_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_databases" ADD CONSTRAINT "workflow_databases_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_wallets" ADD CONSTRAINT "driver_wallets_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_transactions" ADD CONSTRAINT "cod_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "driver_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_transactions" ADD CONSTRAINT "cod_transactions_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_transactions" ADD CONSTRAINT "cod_transactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_services" ADD CONSTRAINT "vehicle_services_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_chat_messages" ADD CONSTRAINT "driver_chat_messages_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_chat_messages" ADD CONSTRAINT "driver_chat_messages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_debitNoteId_fkey" FOREIGN KEY ("debitNoteId") REFERENCES "debit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salespeople" ADD CONSTRAINT "salespeople_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "salespeople"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_connections" ADD CONSTRAINT "accounting_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_sync_logs" ADD CONSTRAINT "accounting_sync_logs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "accounting_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_sync_logs" ADD CONSTRAINT "accounting_sync_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_orders" ADD CONSTRAINT "courier_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_zones" ADD CONSTRAINT "warehouse_zones_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bin_locations" ADD CONSTRAINT "bin_locations_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "warehouse_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_binId_fkey" FOREIGN KEY ("binId") REFERENCES "bin_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fromBinId_fkey" FOREIGN KEY ("fromBinId") REFERENCES "bin_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_orders" ADD CONSTRAINT "pick_orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_order_lines" ADD CONSTRAINT "pick_order_lines_pickOrderId_fkey" FOREIGN KEY ("pickOrderId") REFERENCES "pick_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_count_lines" ADD CONSTRAINT "cycle_count_lines_cycleCountId_fkey" FOREIGN KEY ("cycleCountId") REFERENCES "cycle_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dock_slots" ADD CONSTRAINT "dock_slots_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dock_appointments" ADD CONSTRAINT "dock_appointments_dockSlotId_fkey" FOREIGN KEY ("dockSlotId") REFERENCES "dock_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_cost_entries" ADD CONSTRAINT "trip_cost_entries_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "manifests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_notes" ADD CONSTRAINT "commercial_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_alerts" ADD CONSTRAINT "safety_alerts_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "safety_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_optimizations" ADD CONSTRAINT "route_optimizations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_allocations" ADD CONSTRAINT "delivery_allocations_optimizationId_fkey" FOREIGN KEY ("optimizationId") REFERENCES "route_optimizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_flow_integrations" ADD CONSTRAINT "order_flow_integrations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sync_logs" ADD CONSTRAINT "order_sync_logs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "order_flow_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electronic_pods" ADD CONSTRAINT "electronic_pods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electronic_pods" ADD CONSTRAINT "electronic_pods_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electronic_pods" ADD CONSTRAINT "electronic_pods_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_tracking_sessions" ADD CONSTRAINT "live_tracking_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_payments" ADD CONSTRAINT "digital_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_consignments" ADD CONSTRAINT "rail_consignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wagons" ADD CONSTRAINT "wagons_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "rail_consignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_train_manifests" ADD CONSTRAINT "rail_train_manifests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_train_manifest_wagons" ADD CONSTRAINT "rail_train_manifest_wagons_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "rail_train_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_devices" ADD CONSTRAINT "rail_devices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_telemetry_points" ADD CONSTRAINT "rail_telemetry_points_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "rail_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_telemetry_alerts" ADD CONSTRAINT "rail_telemetry_alerts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "rail_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intermodal_legs" ADD CONSTRAINT "intermodal_legs_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "rail_consignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_readiness" ADD CONSTRAINT "rail_handoff_readiness_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_readiness" ADD CONSTRAINT "rail_handoff_readiness_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "rail_consignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_readiness" ADD CONSTRAINT "rail_handoff_readiness_legId_fkey" FOREIGN KEY ("legId") REFERENCES "intermodal_legs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_readiness" ADD CONSTRAINT "rail_handoff_readiness_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_evidence" ADD CONSTRAINT "rail_handoff_evidence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_evidence" ADD CONSTRAINT "rail_handoff_evidence_readinessId_fkey" FOREIGN KEY ("readinessId") REFERENCES "rail_handoff_readiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handoff_evidence" ADD CONSTRAINT "rail_handoff_evidence_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_consignment_events" ADD CONSTRAINT "rail_consignment_events_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "rail_consignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_schedule_imports" ADD CONSTRAINT "rail_schedule_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_schedule_rows" ADD CONSTRAINT "rail_schedule_rows_importId_fkey" FOREIGN KEY ("importId") REFERENCES "rail_schedule_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_escalation_rungs" ADD CONSTRAINT "rail_escalation_rungs_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handshake_reports" ADD CONSTRAINT "rail_handshake_reports_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handshake_deviations" ADD CONSTRAINT "rail_handshake_deviations_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "rail_handshake_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_handshake_deviations" ADD CONSTRAINT "rail_handshake_deviations_escalationRungId_fkey" FOREIGN KEY ("escalationRungId") REFERENCES "rail_escalation_rungs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_intelligence_stats" ADD CONSTRAINT "delivery_intelligence_stats_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_definitions" ADD CONSTRAINT "process_definitions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_definitions" ADD CONSTRAINT "process_definitions_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "process_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_versions" ADD CONSTRAINT "process_versions_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "process_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_step_definitions" ADD CONSTRAINT "process_step_definitions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "process_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_automation_rules" ADD CONSTRAINT "process_automation_rules_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "process_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_automation_rules" ADD CONSTRAINT "process_automation_rules_stepDefinitionId_fkey" FOREIGN KEY ("stepDefinitionId") REFERENCES "process_step_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_instances" ADD CONSTRAINT "process_instances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_instances" ADD CONSTRAINT "process_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "process_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_instances" ADD CONSTRAINT "process_instances_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "process_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_instances" ADD CONSTRAINT "process_instances_currentStepId_fkey" FOREIGN KEY ("currentStepId") REFERENCES "process_step_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_instances" ADD CONSTRAINT "process_instances_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_step_instances" ADD CONSTRAINT "process_step_instances_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "process_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_step_instances" ADD CONSTRAINT "process_step_instances_stepDefinitionId_fkey" FOREIGN KEY ("stepDefinitionId") REFERENCES "process_step_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_incidents" ADD CONSTRAINT "process_incidents_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "process_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_incidents" ADD CONSTRAINT "process_incidents_stepInstanceId_fkey" FOREIGN KEY ("stepInstanceId") REFERENCES "process_step_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_solutions" ADD CONSTRAINT "process_solutions_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "process_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_outcomes" ADD CONSTRAINT "process_outcomes_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "process_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_change_proposals" ADD CONSTRAINT "process_change_proposals_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "process_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_change_proposals" ADD CONSTRAINT "process_change_proposals_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "process_outcomes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_change_proposals" ADD CONSTRAINT "process_change_proposals_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "process_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_change_proposals" ADD CONSTRAINT "process_change_proposals_implementedInVersionId_fkey" FOREIGN KEY ("implementedInVersionId") REFERENCES "process_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "process_automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "process_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_audit_events" ADD CONSTRAINT "process_audit_events_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "process_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_audit_events" ADD CONSTRAINT "process_audit_events_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "process_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_audit_events" ADD CONSTRAINT "process_audit_events_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "process_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_previousRevisionId_fkey" FOREIGN KEY ("previousRevisionId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data_audit_events" ADD CONSTRAINT "master_data_audit_events_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data_audit_events" ADD CONSTRAINT "master_data_audit_events_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_corridor_nodes" ADD CONSTRAINT "rail_corridor_nodes_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_cancellation_codes" ADD CONSTRAINT "rail_cancellation_codes_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_tariff_schedules" ADD CONSTRAINT "rail_tariff_schedules_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_ancillary_services" ADD CONSTRAINT "rail_ancillary_services_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "rail_networks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_truck_appointments" ADD CONSTRAINT "terminal_truck_appointments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_truck_appointments" ADD CONSTRAINT "terminal_truck_appointments_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "rail_consignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_truck_appointments" ADD CONSTRAINT "terminal_truck_appointments_legId_fkey" FOREIGN KEY ("legId") REFERENCES "intermodal_legs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_truck_appointments" ADD CONSTRAINT "terminal_truck_appointments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_truck_window_changes" ADD CONSTRAINT "terminal_truck_window_changes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_truck_window_changes" ADD CONSTRAINT "terminal_truck_window_changes_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "terminal_truck_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_truck_window_recipients" ADD CONSTRAINT "terminal_truck_window_recipients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_truck_window_recipients" ADD CONSTRAINT "terminal_truck_window_recipients_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "terminal_truck_window_changes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_truck_window_recipients" ADD CONSTRAINT "terminal_truck_window_recipients_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "terminal_truck_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_truck_window_recipients" ADD CONSTRAINT "terminal_truck_window_recipients_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_gate_policies" ADD CONSTRAINT "terminal_gate_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_stages" ADD CONSTRAINT "journey_stages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_stages" ADD CONSTRAINT "journey_stages_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_updates" ADD CONSTRAINT "journey_updates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_updates" ADD CONSTRAINT "journey_updates_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journeys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journey_updates" ADD CONSTRAINT "journey_updates_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "journey_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "border_posts" ADD CONSTRAINT "border_posts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "border_geofences" ADD CONSTRAINT "border_geofences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "border_geofences" ADD CONSTRAINT "border_geofences_postId_fkey" FOREIGN KEY ("postId") REFERENCES "border_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "border_dwell_sessions" ADD CONSTRAINT "border_dwell_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "border_dwell_sessions" ADD CONSTRAINT "border_dwell_sessions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "border_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "border_dwell_sessions" ADD CONSTRAINT "border_dwell_sessions_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "border_geofences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "border_dwell_sessions" ADD CONSTRAINT "border_dwell_sessions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_legs" ADD CONSTRAINT "trip_legs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_legs" ADD CONSTRAINT "trip_legs_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_legs" ADD CONSTRAINT "trip_legs_postId_fkey" FOREIGN KEY ("postId") REFERENCES "border_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_legs" ADD CONSTRAINT "trip_legs_dwellSessionId_fkey" FOREIGN KEY ("dwellSessionId") REFERENCES "border_dwell_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_meter_readings" ADD CONSTRAINT "maintenance_meter_readings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "maintenance_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "maintenance_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_faultCodeId_fkey" FOREIGN KEY ("faultCodeId") REFERENCES "maintenance_fault_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_jobs" ADD CONSTRAINT "maintenance_jobs_priorJobId_fkey" FOREIGN KEY ("priorJobId") REFERENCES "maintenance_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_job_costs" ADD CONSTRAINT "maintenance_job_costs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "maintenance_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_job_events" ADD CONSTRAINT "maintenance_job_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "maintenance_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_average_events" ADD CONSTRAINT "general_average_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_average_contributors" ADD CONSTRAINT "general_average_contributors_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "general_average_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_average_contributors" ADD CONSTRAINT "general_average_contributors_shipmentFileId_fkey" FOREIGN KEY ("shipmentFileId") REFERENCES "shipment_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_average_contributors" ADD CONSTRAINT "general_average_contributors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

