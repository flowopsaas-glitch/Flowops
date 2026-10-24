-- Truck appointment sharing + gate change governance
ALTER TABLE "companies" ADD COLUMN "terminalGateCutoffHours" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "terminal_truck_appointments" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "terminal_truck_appointments" ADD COLUMN "shareTokenIssuedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "terminal_truck_appointments_shareToken_key" ON "terminal_truck_appointments"("shareToken");
