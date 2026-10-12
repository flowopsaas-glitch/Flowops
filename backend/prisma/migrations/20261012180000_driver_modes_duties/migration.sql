-- Driver modes & duties — one shift, one mode, one vehicle.
-- A driver declares their profession for the shift (bakkie / bicycle / truck /
-- linehaul / train); the portal reshapes and the server scopes the work queue
-- by the active duty's mode.

-- CreateEnum
CREATE TYPE "DriverMode" AS ENUM ('BICYCLE', 'BAKKIE', 'TRUCK', 'LINEHAUL', 'TRAIN');

-- CreateEnum
CREATE TYPE "DriverDutyStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN "defaultMode" "DriverMode",
                      ADD COLUMN "allowedModes" "DriverMode"[];

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

-- CreateIndex
CREATE INDEX "driver_duties_companyId_startedAt_idx" ON "driver_duties"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "driver_duties_driverId_status_idx" ON "driver_duties"("driverId", "status");

-- AddForeignKey
ALTER TABLE "driver_duties" ADD CONSTRAINT "driver_duties_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
