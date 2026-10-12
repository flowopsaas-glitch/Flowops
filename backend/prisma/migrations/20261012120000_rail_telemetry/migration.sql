-- Telemetry foundations (Phase 3): device registry (hashed ingest tokens),
-- time-series positions, and rule-based health alerts raised on ingest.

-- CreateEnum
CREATE TYPE "RailDeviceKind" AS ENUM ('WAGON_TRACKER', 'LOCO_TELEMATICS', 'WAYBILL_SCANNER', 'PORT_SCANNER');

-- CreateEnum
CREATE TYPE "RailDeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'FAULTY');

-- CreateEnum
CREATE TYPE "RailTelemetryAlertKind" AS ENUM ('SPEED_EXCEEDED', 'BATTERY_LOW', 'DEVICE_SILENT', 'TEMPERATURE');

-- CreateEnum
CREATE TYPE "RailAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

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

-- CreateIndex
CREATE UNIQUE INDEX "rail_devices_tokenHash_key" ON "rail_devices"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "rail_devices_companyId_deviceCode_key" ON "rail_devices"("companyId", "deviceCode");

-- CreateIndex
CREATE INDEX "rail_devices_companyId_status_idx" ON "rail_devices"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_telemetry_points_deviceId_recordedAt_idx" ON "rail_telemetry_points"("deviceId", "recordedAt");

-- CreateIndex
CREATE INDEX "rail_telemetry_points_companyId_recordedAt_idx" ON "rail_telemetry_points"("companyId", "recordedAt");

-- CreateIndex
CREATE INDEX "rail_telemetry_alerts_companyId_status_idx" ON "rail_telemetry_alerts"("companyId", "status");

-- CreateIndex
CREATE INDEX "rail_telemetry_alerts_deviceId_raisedAt_idx" ON "rail_telemetry_alerts"("deviceId", "raisedAt");

-- AddForeignKey
ALTER TABLE "rail_devices" ADD CONSTRAINT "rail_devices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_telemetry_points" ADD CONSTRAINT "rail_telemetry_points_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "rail_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_telemetry_alerts" ADD CONSTRAINT "rail_telemetry_alerts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "rail_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
