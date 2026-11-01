-- Journey: end-to-end journey truth + communication (WP2 slice).
-- Additive only: creates new tables, no changes to existing tables.

CREATE TYPE "JourneyStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');
CREATE TYPE "JourneyStageType" AS ENUM ('PICKUP', 'BORDER', 'TRANSIT', 'DELIVERY', 'OTHER');
CREATE TYPE "JourneyStageStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');
CREATE TYPE "JourneyUpdateType" AS ENUM ('DELAY', 'VEHICLE_ISSUE', 'ROAD_OBSTRUCTION', 'SAFETY_CONCERN', 'STATUS_CHANGE');
CREATE TYPE "JourneyUpdateStatus" AS ENUM ('PENDING', 'RECEIVED', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "journeys" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "driverId" TEXT,
  "reference" TEXT NOT NULL,
  "status" "JourneyStatus" NOT NULL DEFAULT 'PLANNED',
  "origin" TEXT,
  "destination" TEXT,
  "plannedStart" TIMESTAMP(3),
  "plannedEnd" TIMESTAMP(3),
  "actualStart" TIMESTAMP(3),
  "actualEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "journeys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Journey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "Journey_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL
);

CREATE INDEX "Journey_companyId_status_idx" ON "journeys"("companyId", "status");
CREATE INDEX "Journey_driverId_createdAt_idx" ON "journeys"("driverId", "createdAt");
CREATE INDEX "Journey_companyId_createdAt_idx" ON "journeys"("companyId", "createdAt");

CREATE TABLE "journey_stages" (
  "id" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "stageNumber" INTEGER NOT NULL,
  "type" "JourneyStageType" NOT NULL,
  "locationName" TEXT,
  "locationRef" TEXT,
  "plannedAt" TIMESTAMP(3),
  "actualAt" TIMESTAMP(3),
  "status" "JourneyStageStatus" NOT NULL DEFAULT 'PLANNED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "journey_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JourneyStage_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journeys"("id") ON DELETE CASCADE,
  CONSTRAINT "JourneyStage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "JourneyStage_journeyId_stageNumber_key" UNIQUE ("journeyId", "stageNumber")
);

CREATE INDEX "JourneyStage_journeyId_stageNumber_idx" ON "journey_stages"("journeyId", "stageNumber");
CREATE INDEX "JourneyStage_companyId_status_idx" ON "journey_stages"("companyId", "status");

CREATE TABLE "journey_updates" (
  "id" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "stageId" TEXT,
  "driverId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" "JourneyUpdateType" NOT NULL,
  "message" TEXT NOT NULL,
  "clientMessageId" TEXT,
  "deviceOccurredAt" TIMESTAMP(3),
  "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "JourneyUpdateStatus" NOT NULL DEFAULT 'PENDING',
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedBy" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "journey_updates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JourneyUpdate_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journeys"("id") ON DELETE CASCADE,
  CONSTRAINT "JourneyUpdate_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "journey_stages"("id") ON DELETE SET NULL,
  CONSTRAINT "JourneyUpdate_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE,
  CONSTRAINT "JourneyUpdate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "JourneyUpdate_companyId_driverId_clientMessageId_key" UNIQUE ("companyId", "driverId", "clientMessageId")
);

CREATE INDEX "JourneyUpdate_journeyId_createdAt_idx" ON "journey_updates"("journeyId", "createdAt");
CREATE INDEX "JourneyUpdate_stageId_createdAt_idx" ON "journey_updates"("stageId", "createdAt");
CREATE INDEX "JourneyUpdate_companyId_status_idx" ON "journey_updates"("companyId", "status");
CREATE INDEX "JourneyUpdate_driverId_createdAt_idx" ON "journey_updates"("driverId", "createdAt");
