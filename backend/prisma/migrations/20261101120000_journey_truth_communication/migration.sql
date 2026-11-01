-- Journey: end-to-end journey truth + communication (WP2 slice).
-- Additive only: creates new tables, no changes to existing tables.

CREATE TABLE "journeys" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "driverId" TEXT,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "origin" TEXT,
  "destination" TEXT,
  "plannedStart" TIMESTAMP(3),
  "plannedEnd" TIMESTAMP(3),
  "actualStart" TIMESTAMP(3),
  "actualEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "journeys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journeys_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "journeys_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL
);

CREATE INDEX "journeys_companyId_status_idx" ON "journeys"("companyId", "status");
CREATE INDEX "journeys_driverId_createdAt_idx" ON "journeys"("driverId", "createdAt");
CREATE INDEX "journeys_companyId_createdAt_idx" ON "journeys"("companyId", "createdAt");

CREATE TABLE "journey_stages" (
  "id" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "stageNumber" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "locationName" TEXT,
  "locationRef" TEXT,
  "plannedAt" TIMESTAMP(3),
  "actualAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "journey_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journey_stages_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journeys"("id") ON DELETE CASCADE,
  CONSTRAINT "journey_stages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "journey_stages_journeyId_stageNumber_key" UNIQUE ("journeyId", "stageNumber")
);

CREATE INDEX "journey_stages_journeyId_stageNumber_idx" ON "journey_stages"("journeyId", "stageNumber");
CREATE INDEX "journey_stages_companyId_status_idx" ON "journey_stages"("companyId", "status");

CREATE TABLE "journey_updates" (
  "id" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "stageId" TEXT,
  "driverId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "clientMessageId" TEXT,
  "deviceOccurredAt" TIMESTAMP(3),
  "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedBy" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "journey_updates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journey_updates_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "journeys"("id") ON DELETE CASCADE,
  CONSTRAINT "journey_updates_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "journey_stages"("id") ON DELETE SET NULL,
  CONSTRAINT "journey_updates_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE,
  CONSTRAINT "journey_updates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "journey_updates_companyId_driverId_clientMessageId_key" UNIQUE ("companyId", "driverId", "clientMessageId")
);

CREATE INDEX "journey_updates_journeyId_createdAt_idx" ON "journey_updates"("journeyId", "createdAt");
CREATE INDEX "journey_updates_stageId_createdAt_idx" ON "journey_updates"("stageId", "createdAt");
CREATE INDEX "journey_updates_companyId_status_idx" ON "journey_updates"("companyId", "status");
CREATE INDEX "journey_updates_driverId_createdAt_idx" ON "journey_updates"("driverId", "createdAt");
