-- Digital Train Manifest — the departure document. DRAFT is editable; ISSUED is
-- an immutable attestation (signatory role); corrections happen through AMEND
-- (a new revision that supersedes the old one).

-- CreateEnum
CREATE TYPE "RailTrainManifestStatus" AS ENUM ('DRAFT', 'ISSUED', 'DEPARTED', 'ARRIVED', 'CLOSED', 'SUPERSEDED', 'CANCELLED');

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

-- CreateIndex
CREATE UNIQUE INDEX "rail_train_manifests_companyId_manifestNumber_revision_key" ON "rail_train_manifests"("companyId", "manifestNumber", "revision");

-- CreateIndex
CREATE INDEX "rail_train_manifests_companyId_status_idx" ON "rail_train_manifests"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_train_manifests_consignmentId_idx" ON "rail_train_manifests"("consignmentId");

-- CreateIndex
CREATE INDEX "rail_train_manifest_wagons_manifestId_idx" ON "rail_train_manifest_wagons"("manifestId");

-- AddForeignKey
ALTER TABLE "rail_train_manifests" ADD CONSTRAINT "rail_train_manifests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_train_manifest_wagons" ADD CONSTRAINT "rail_train_manifest_wagons_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "rail_train_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
