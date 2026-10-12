-- Dispute resolution on ePODs — the money gate.
-- CLEARED -> the POD becomes VERIFIED and billing flows; UPHELD -> the POD stays
-- DISPUTED and the waybill stays on billing hold until it is settled or credited.
--
-- Also completes the ePOD relations that were previously bare scalar FKs:
-- electronic_pods.waybillId -> waybills.id, electronic_pods.driverId -> drivers.id.

-- AlterTable
ALTER TABLE "electronic_pods" ADD COLUMN "disputeResolution" TEXT,
                              ADD COLUMN "disputeResolvedBy" TEXT,
                              ADD COLUMN "disputeResolvedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "electronic_pods" ADD CONSTRAINT "electronic_pods_waybillId_fkey"
  FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electronic_pods" ADD CONSTRAINT "electronic_pods_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
