-- Terminal truck appointments (road side of road<->rail handoff).
CREATE TYPE "TruckAppointmentStatus" AS ENUM ('BOOKED', 'ARRIVED', 'LOADING', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

CREATE TABLE "terminal_truck_appointments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "consignmentId" TEXT,
    "legId" TEXT,
    "terminalName" TEXT NOT NULL,
    "haulierName" TEXT NOT NULL,
    "vehicleReg" TEXT NOT NULL,
    "driverName" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'DELIVERY',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "arrivedAt" TIMESTAMP(3),
    "loadingAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "TruckAppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "bookedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "terminal_truck_appointments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "terminal_truck_appointments_companyId_windowStart_idx" ON "terminal_truck_appointments"("companyId", "windowStart");
CREATE INDEX "terminal_truck_appointments_companyId_status_idx" ON "terminal_truck_appointments"("companyId", "status");
CREATE INDEX "terminal_truck_appointments_consignmentId_idx" ON "terminal_truck_appointments"("consignmentId");

ALTER TABLE "terminal_truck_appointments" ADD CONSTRAINT "terminal_truck_appointments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "terminal_truck_appointments" ADD CONSTRAINT "terminal_truck_appointments_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "rail_consignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "terminal_truck_appointments" ADD CONSTRAINT "terminal_truck_appointments_legId_fkey" FOREIGN KEY ("legId") REFERENCES "intermodal_legs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
