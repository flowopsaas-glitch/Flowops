-- Additive migration: the Process Book and Product Master models that
-- prisma/schema.prisma expects and the production database does not have yet.
--
-- 11 enums, 17 tables, 50 indexes, 34 foreign keys and one new column
-- (inventory_items."productVariantId"). Prisma 5.22 generated these statements from the
-- live schema:
--   prisma migrate diff --from-url <clone> --to-schema-datamodel prisma/schema.prisma --script
-- (661 lines, sha256 791b62a4d832ea74e02b0f1a535172e83f2ad913e92a620372d5ffaa1c2f6927).
-- Every statement here was emitted by that run; scripts/derive-live-baseline.mjs only
-- moved the same statements out of the pre-baseline 20260926130650_init.
--
-- Applied to the live database by `prisma migrate deploy` after the baseline above is
-- recorded with `prisma migrate resolve --applied 20260926130650_init`.
--
-- Verified additive: no DROP, no ALTER COLUMN ... TYPE, no SET NOT NULL and no data
-- statement of any kind — only CREATE and ADD COLUMN / ADD CONSTRAINT.

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

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "productVariantId" TEXT;

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

-- CreateIndex
CREATE INDEX "inventory_items_productVariantId_idx" ON "inventory_items"("productVariantId");

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

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
