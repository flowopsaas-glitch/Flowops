import { PrismaClient } from '@prisma/client';
import { WaybillAiService } from '../src/ocr/waybill-ai.service';
import * as path from 'path';

async function test() {
  const prisma = new PrismaClient();
  const service = new WaybillAiService(prisma as any);
  const testFile = path.join(__dirname, '../uploads/waybills/waybill_test.jpg');
  
  console.log('🚀 Starting local OCR test...');
  
  const result = await service.processAndSave(testFile);

  if (result) {
    console.log('✅ Success! Record created in Docker DB:');
    console.table([result]);
  } else {
    console.error('❌ Test failed.');
  }

  await prisma.$disconnect();
}

test();
