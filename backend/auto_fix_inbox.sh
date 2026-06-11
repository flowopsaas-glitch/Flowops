#!/bin/bash
# =========================================================
# FlowOps Inbox Auto-Fixer Script (Linux Mint / PS-safe)
# =========================================================
# This script processes waybills in the inbox that are
# marked NEEDS_REVIEW and applies local fixes, then
# moves them to READY_FOR_BILLING.
# =========================================================

# Load environment variables if not already loaded
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Node script embedded
node - << 'EOF'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function processInbox() {
    try {
        console.log("Fetching NEEDS_REVIEW waybills...");
        const waybills = await prisma.waybill.findMany({
            where: { status: 'NEEDS_REVIEW' },
            include: { extractedDraft: true },
        });

        if (waybills.length === 0) {
            console.log("No waybills require review. Exiting.");
            return;
        }

        for (const wb of waybills) {
            console.log(`\nProcessing Waybill ID: ${wb.id}`);

            let draftUpdated = false;

            // Apply minimal local fixes
            if (!wb.extractedDraft) {
                console.log("No extracted draft found, creating a new minimal draft...");
                await prisma.waybillDraft.create({
                    data: {
                        companyId: wb.companyId,
                        waybillNo: `WB-${Date.now()}`,
                        paymentType: 'PREPAID',
                        serviceLevel: 'Next Day',
                        extractedFromInboxId: wb.id,
                        notes: wb.notes || 'Auto-created draft with minimal local fixes.',
                    }
                });
                draftUpdated = true;
            } else {
                // Fix missing fields
                const draftData = {};
                if (!wb.extractedDraft.paymentType) {
                    draftData.paymentType = 'PREPAID';
                    draftUpdated = true;
                }
                if (!wb.extractedDraft.serviceLevel) {
                    draftData.serviceLevel = 'Next Day';
                    draftUpdated = true;
                }
                if (!wb.extractedDraft.contractCode) {
                    draftData.contractCode = null;
                    draftUpdated = true;
                }
                if (draftUpdated) {
                    await prisma.waybillDraft.update({
                        where: { id: wb.extractedDraft.id },
                        data: draftData,
                    });
                    console.log("Applied local draft fixes.");
                }
            }

            // Preserve notes
            const notesUpdate = wb.notes ? wb.notes : '';
            await prisma.waybill.update({
                where: { id: wb.id },
                data: {
                    status: 'READY_FOR_BILLING',
                    notes: notesUpdate + "\n[Auto-fix applied: ready for billing]",
                }
            });
            console.log(`Waybill ID ${wb.id} is now READY_FOR_BILLING`);
        }

        console.log("\n✅ All NEEDS_REVIEW waybills processed.");
        process.exit(0);

    } catch (err) {
        console.error("Error processing inbox:", err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

processInbox();
EOF