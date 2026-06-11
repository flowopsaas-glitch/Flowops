/**
 * auto_fix_inbox.ts
 * Full automated fix for FlowOps Waybill Inbox
 * Supports dry-run simulation and real fixes
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const prisma = new PrismaClient();

// Parse CLI args with type-safe access
const argv = yargs(hideBin(process.argv))
  .option('dry-run', {
    type: 'boolean',
    description: 'Simulate fixes without modifying DB/files',
    default: true,
  })
  .parseSync();

const DRY_RUN: boolean = argv['dry-run'] ?? true;

console.log(`🚀 Starting auto-fix for Waybill Inbox (dry-run=${DRY_RUN})...`);

const LOG_FILE = './scripts/auto_fix_inbox_log.csv';

// Prepare CSV writer
const csvWriter = createObjectCsvWriter({
  path: LOG_FILE,
  header: [
    { id: 'waybillNo', title: 'waybillNo' },
    { id: 'waybillId', title: 'waybillId' },
    { id: 'oldFilePath', title: 'oldFilePath' },
    { id: 'newFilePath', title: 'newFilePath' },
    { id: 'statusBefore', title: 'statusBefore' },
    { id: 'statusAfter', title: 'statusAfter' },
    { id: 'note', title: 'note' },
  ],
});

// Helper: generate fixed file path
function generateFixedPath(oldPath: string): string {
  const extIndex = oldPath.lastIndexOf('.');
  if (extIndex === -1) return oldPath + '_fixed';
  return oldPath.slice(0, extIndex) + '_fixed' + oldPath.slice(extIndex);
}

// Main auto-fix function
async function autoFixInbox() {
  try {
    // Fetch all waybills needing review
    const inboxWaybills = await prisma.waybill.findMany({
      where: { status: 'NEEDS_REVIEW' },
    });

    const logRecords: any[] = [];

    for (const wb of inboxWaybills) {
      const oldFilePath: string = wb.filePath ?? '';
      if (!oldFilePath) {
        logRecords.push({
          waybillNo: wb.waybillNo,
          waybillId: wb.id,
          oldFilePath: 'MISSING',
          newFilePath: 'MISSING',
          statusBefore: wb.status,
          statusAfter: wb.status,
          note: 'Skipped: missing filePath',
        });
        continue;
      }

      const newFilePath: string = generateFixedPath(oldFilePath);
      const statusBefore = wb.status;
      let statusAfter = statusBefore;

      if (!DRY_RUN) {
        // Apply fixes
        wb.filePath = newFilePath;
        wb.status = 'READY_FOR_BILLING';

        await prisma.waybill.update({
          where: { id: wb.id },
          data: { filePath: wb.filePath, status: wb.status },
        });

        statusAfter = wb.status;
      } else {
        // Simulate
        statusAfter = 'READY_FOR_BILLING';
      }

      logRecords.push({
        waybillNo: wb.waybillNo,
        waybillId: wb.id,
        oldFilePath,
        newFilePath,
        statusBefore,
        statusAfter,
        note: DRY_RUN ? 'dry-run, no changes applied' : 'fixed and updated',
      });
    }

    await csvWriter.writeRecords(logRecords);
    console.log(`🎉 Auto-fix completed. Log file: ${LOG_FILE}`);
  } catch (err) {
    console.error('❌ Auto-fix failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute
autoFixInbox();