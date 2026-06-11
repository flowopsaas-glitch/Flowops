// File: /opt/Flowops/backend/scripts/full_audit_waybills_fixed.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const CSV_FILE = path.join(__dirname, 'full_audit_waybills_log.csv');

(async () => {
  try {
    // Fetch all waybills, ordered by createdAt
    const waybills = await prisma.waybill.findMany({
      select: {
        id: true,
        waybillNo: true,
        status: true,
        senderName: true,
        receiverName: true,
        paymentType: true,
        contractCode: true,
        filePath: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build CSV
    const header = [
      'waybillNo',
      'waybillId',
      'senderName',
      'receiverName',
      'paymentType',
      'contractCode',
      'filePath',
      'status',
      'createdAt',
    ];
    const rows = waybills.map(wb => [
      wb.waybillNo ?? '',
      wb.id,
      wb.senderName ?? '',
      wb.receiverName ?? '',
      wb.paymentType ?? '',
      wb.contractCode ?? '',
      wb.filePath ?? '',
      wb.status ?? '',
      wb.createdAt.toISOString(),
    ].join(','));

    // Write CSV
    fs.writeFileSync(CSV_FILE, [header.join(','), ...rows].join('\n'), 'utf-8');

    console.log(`🎉 Full audit completed! CSV saved at: ${CSV_FILE}`);
    console.log(`Total waybills audited: ${waybills.length}`);
  } catch (err) {
    console.error('❌ Error during full audit:', err);
  } finally {
    await prisma.$disconnect();
  }
})();