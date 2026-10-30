-- Terminal truck window changes — the closed loop (change → notify → acknowledge → escalate).
--
-- A window change used to be an in-place UPDATE of windowStart/windowEnd plus a
-- text marker appended to `note`: the old window was gone, nothing could be
-- acknowledged, and no change→acknowledgement time could be measured. This
-- migration makes a window change a versioned EVENT with named recipients and
-- observed delivery states.
--
-- "Never two active windows" is enforced by the database, not by a service
-- convention: `activeAppointmentId` holds the appointment id while a change is
-- ACTIVE and is nulled on supersede, and Postgres does not collide nulls in a
-- unique index — so at most one ACTIVE change per appointment can exist.

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

-- AlterTable: the appointment gains a resolved driver link, a window version
-- counter, and a share-token expiry.
--
-- `driverId` is what turns "notify the assigned driver" into a real recipient
-- instead of a guess at the free-text `driverName`. `shareTokenExpiresAt` is
-- enforced for every token issued from now on; links issued before this
-- migration have it NULL and stay READABLE (a link already sitting in a
-- haulier's inbox must not break) but can no longer be used to ACKNOWLEDGE a
-- change — an unauthenticated mutation on a token with no recorded expiry is
-- precisely what the closed loop must not allow.
ALTER TABLE "terminal_truck_appointments" ADD COLUMN "driverId" TEXT;
ALTER TABLE "terminal_truck_appointments" ADD COLUMN "windowVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "terminal_truck_appointments" ADD COLUMN "shareTokenExpiresAt" TIMESTAMP(3);

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

-- CreateIndex
CREATE INDEX "terminal_truck_appointments_driverId_idx" ON "terminal_truck_appointments"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_truck_window_changes_activeAppointmentId_key" ON "terminal_truck_window_changes"("activeAppointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_truck_window_changes_companyId_idempotencyKey_key" ON "terminal_truck_window_changes"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "terminal_truck_window_changes_companyId_appointmentId_version_idx" ON "terminal_truck_window_changes"("companyId", "appointmentId", "version");

-- CreateIndex
CREATE INDEX "terminal_truck_window_changes_companyId_status_idx" ON "terminal_truck_window_changes"("companyId", "status");

-- CreateIndex
CREATE INDEX "terminal_truck_window_changes_companyId_changedAt_idx" ON "terminal_truck_window_changes"("companyId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_truck_window_recipients_changeId_recipientKey_key" ON "terminal_truck_window_recipients"("changeId", "recipientKey");

-- CreateIndex
CREATE INDEX "terminal_truck_window_recipients_companyId_ackState_idx" ON "terminal_truck_window_recipients"("companyId", "ackState");

-- CreateIndex
CREATE INDEX "terminal_truck_window_recipients_companyId_appointmentId_idx" ON "terminal_truck_window_recipients"("companyId", "appointmentId");

-- CreateIndex
CREATE INDEX "terminal_truck_window_recipients_driverId_ackState_idx" ON "terminal_truck_window_recipients"("driverId", "ackState");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_gate_policies_companyId_terminalName_key" ON "terminal_gate_policies"("companyId", "terminalName");

-- CreateIndex
CREATE INDEX "terminal_gate_policies_companyId_idx" ON "terminal_gate_policies"("companyId");

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

-- Tenant isolation for each new table, in its own creating migration (so a
-- fresh-database replay creates the table before its policy). Same shape as
-- 20261012210000_rls_tenant_isolation and 20261021120000_truck_appointments.
ALTER TABLE "terminal_truck_window_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "terminal_truck_window_changes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "terminal_truck_window_changes"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "terminal_truck_window_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "terminal_truck_window_recipients" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "terminal_truck_window_recipients"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));

ALTER TABLE "terminal_gate_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "terminal_gate_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "terminal_gate_policies"
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
