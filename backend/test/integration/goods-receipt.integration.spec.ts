/**
 * Goods receipt → Process Book, end to end, against a real PostgreSQL.
 *
 * This is the vertical slice the charter describes, driven through the real WMS
 * service and the real bridge: book a receipt, capture what actually arrived,
 * and prove what the standard did about it.
 *
 * Covered here (the §9.3 list in the implementation charter):
 *   • a clean receipt walks the standard to completion and records an outcome
 *   • a short shipment is recorded as an exception, not silently accepted
 *   • damaged stock is recorded as an exception (all-damaged is critical)
 *   • a receipt with no put-away is never closed out
 *   • a known SKU is linked to its governed variant
 *   • an unknown SKU stays a controlled exception
 *   • the receipt and its process instance stay linked, one to one
 */

import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { ProcessControlService } from '../../src/process-control/process-control.service';
import { ProductMasterService } from '../../src/product-master/product-master.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { GoodsReceiptProcessBridge } from '../../src/warehouse-management/goods-receipt-process.bridge';
import { WarehouseManagementService } from '../../src/warehouse-management/warehouse-management.service';
import { seedTenant, truncateAll } from './support/db';
import { createIntegrationDatabase, type IntegrationDatabase } from './support/prisma-client';

jest.setTimeout(90_000);

describe('Goods receipt → Process Book (PostgreSQL)', () => {
  let db: IntegrationDatabase;
  let prisma: PrismaClient;
  let processControl: ProcessControlService;
  let productMaster: ProductMasterService;
  let bridge: GoodsReceiptProcessBridge;
  let wms: WarehouseManagementService;

  let companyId: string;
  let warehouseId: string;
  let binId: string;

  const warehouseActor = { userId: 'user-wh', name: 'Dock Clerk', role: 'WAREHOUSE' };
  const adminActor = { userId: 'user-admin', name: 'Tenant Admin', role: 'ADMIN' };

  beforeAll(async () => {
    db = await createIntegrationDatabase();
    prisma = db.prisma;
    processControl = new ProcessControlService(prisma as unknown as PrismaService);
    productMaster = new ProductMasterService(prisma as unknown as PrismaService);
    bridge = new GoodsReceiptProcessBridge(
      prisma as unknown as PrismaService,
      processControl,
      productMaster,
    );
    wms = new WarehouseManagementService(
      prisma as unknown as PrismaService,
      new ConfigService({}),
      bridge,
    );
    // eslint-disable-next-line no-console
    console.log(`[integration] goods receipt engine: ${db.engine}`);
  });

  afterAll(async () => {
    await db?.shutdown();
  });

  beforeEach(async () => {
    process.env.PROCESS_CONTROL_ENABLED = 'true';
    process.env.PROCESS_CONTROL_WMS_RECEIPT_ENABLED = 'true';
    process.env.PRODUCT_MASTER_ENABLED = 'true';
    // Pilot mode: the bridge observes and records, it never stops the dock.
    delete process.env.PROCESS_CONTROL_WMS_RECEIPT_ENFORCE;
    delete process.env.PROCESS_CONTROL_PRODUCTION_ALLOWED;
    process.env.NODE_ENV = 'test';

    await truncateAll(prisma);
    ({ companyId } = await seedTenant(prisma, 'Warehouse Tenant'));

    const warehouse = await wms.createWarehouse(companyId, {
      name: 'Main DC',
      code: 'DC-1',
    });
    warehouseId = warehouse.id;
    const zone = await wms.createZone(warehouseId, companyId, {
      name: 'Receiving',
      code: 'RECV',
    });
    const bin = await wms.createBin(zone.id, companyId, { code: 'RECV-A1' });
    binId = bin.id;
  });

  afterEach(() => {
    delete process.env.PROCESS_CONTROL_ENABLED;
    delete process.env.PROCESS_CONTROL_WMS_RECEIPT_ENABLED;
    delete process.env.PRODUCT_MASTER_ENABLED;
  });

  /** A governed SKU: approve a product, then a variant (which allocates the SKU). */
  async function governedSku(code = 'PROD-1'): Promise<string> {
    const product = await productMaster.createProduct(companyId, adminActor, {
      code,
      name: 'Vaccine pack',
    });
    await productMaster.submitProduct(companyId, adminActor, product.id);
    await productMaster.approveProduct(companyId, adminActor, product.id, true);
    const variant = await productMaster.createVariant(companyId, adminActor, product.id, {
      code: `${code}-V1`,
      name: 'Single pack',
      attributes: { packSize: 1 },
    });
    const approved = await productMaster.approveVariant(companyId, adminActor, variant.id, true);
    return approved.sku as string;
  }

  async function bookReceipt(lines: Array<{ sku: string; expectedQty: number }>) {
    return wms.createGoodsReceipt(companyId, warehouseId, {
      poNumber: 'PO-1001',
      supplierName: 'Acme Supplies',
      lines,
    });
  }

  async function instanceFor(goodsReceiptId: string) {
    return prisma.processInstance.findFirst({
      where: { companyId, goodsReceiptId },
      include: { currentStep: true },
    });
  }

  describe('a clean receipt', () => {
    it('walks the standard to completion and records a first-time-right outcome', async () => {
      const sku = await governedSku();
      const receipt = await bookReceipt([{ sku, expectedQty: 10 }]);

      // Booking the receipt starts the standard (pilot) and links the two.
      const started = await instanceFor(receipt.id);
      expect(started).not.toBeNull();
      expect(started!.businessKey).toBe(receipt.receiptNumber);
      expect(started!.currentStep!.code).toBe('VERIFY_SKU');
      expect(started!.status).toBe('IN_PROGRESS');

      await wms.receiveGoods(receipt.id, companyId, {
        lines: [{ sku, receivedQty: 10, putAwayBinId: binId }],
        receivedBy: warehouseActor.userId,
      });

      const finished = await instanceFor(receipt.id);
      expect(finished!.status).toBe('COMPLETED');
      expect(finished!.currentStepId).toBeNull();

      const outcome = await prisma.processOutcome.findFirstOrThrow({
        where: { instanceId: finished!.id },
      });
      expect(outcome.firstTimeRight).toBe(true);
      expect(outcome.status).toBe('COMPLETED');
      expect(outcome.completedSteps).toBe(4);
      expect(outcome.incidentCount).toBe(0);

      expect(
        await prisma.processIncident.count({ where: { instanceId: finished!.id } }),
      ).toBe(0);
    });

    it('links a known SKU to its governed product variant', async () => {
      const sku = await governedSku('PROD-LINK');
      const variant = await prisma.productVariant.findFirstOrThrow({
        where: { companyId, sku },
      });
      const receipt = await bookReceipt([{ sku, expectedQty: 4 }]);

      await wms.receiveGoods(receipt.id, companyId, {
        lines: [{ sku, receivedQty: 4, putAwayBinId: binId }],
      });

      const item = await prisma.inventoryItem.findFirstOrThrow({
        where: { companyId, sku, binId },
      });
      expect(item.quantityOnHand).toBe(4);
      expect(item.productVariantId).toBe(variant.id);
    });
  });

  describe('exceptions', () => {
    it('records a short shipment as an exception and does not call it right first time', async () => {
      const sku = await governedSku('PROD-SHORT');
      const receipt = await bookReceipt([{ sku, expectedQty: 10 }]);

      await wms.receiveGoods(receipt.id, companyId, {
        lines: [{ sku, receivedQty: 8, putAwayBinId: binId }],
      });

      const instance = await instanceFor(receipt.id);
      const incident = await prisma.processIncident.findFirstOrThrow({
        where: { instanceId: instance!.id, code: 'QUANTITY_VARIANCE' },
      });

      // Severity is the policy's call: a variance is MAJOR, so receiving can
      // continue (quarantine-and-report, not stop-the-dock). What must hold is
      // that the exception is durable and the run is not counted as clean.
      expect(incident.isBlocking).toBe(false);
      expect(incident.severity).toBe('MAJOR');

      const outcome = await prisma.processOutcome.findFirst({
        where: { instanceId: instance!.id },
      });
      expect(outcome).not.toBeNull();
      expect(outcome!.firstTimeRight).toBe(false);
      expect(outcome!.status).toBe('COMPLETED_WITH_EXCEPTIONS');
      expect(outcome!.incidentCount).toBeGreaterThanOrEqual(1);
    });

    it('records damaged stock as an exception', async () => {
      const sku = await governedSku('PROD-DAMAGE');
      const receipt = await bookReceipt([{ sku, expectedQty: 10 }]);

      await wms.receiveGoods(receipt.id, companyId, {
        lines: [{ sku, receivedQty: 10, damagedQty: 3, putAwayBinId: binId }],
      });

      const instance = await instanceFor(receipt.id);
      const incident = await prisma.processIncident.findFirstOrThrow({
        where: { instanceId: instance!.id, code: 'DAMAGED_GOODS' },
      });
      expect(incident.severity).toBe('MAJOR');

      const outcome = await prisma.processOutcome.findFirstOrThrow({
        where: { instanceId: instance!.id },
      });
      expect(outcome.firstTimeRight).toBe(false);
    });

    it('blocks the receipt when every received unit is damaged', async () => {
      const sku = await governedSku('PROD-ALL-DAMAGE');
      const receipt = await bookReceipt([{ sku, expectedQty: 5 }]);

      await wms.receiveGoods(receipt.id, companyId, {
        lines: [{ sku, receivedQty: 5, damagedQty: 5, putAwayBinId: binId }],
      });

      const instance = await instanceFor(receipt.id);
      const incident = await prisma.processIncident.findFirstOrThrow({
        where: { instanceId: instance!.id, code: 'DAMAGED_GOODS' },
      });
      expect(incident.severity).toBe('CRITICAL');
      expect(incident.isBlocking).toBe(true);

      const blocked = await prisma.processInstance.findUniqueOrThrow({ where: { id: instance!.id } });
      expect(blocked.status).toBe('BLOCKED');
      expect(await prisma.processOutcome.count({ where: { instanceId: instance!.id } })).toBe(0);
    });

    it('never closes out a receipt whose good stock was not put away', async () => {
      const sku = await governedSku('PROD-NOPUTAWAY');
      const receipt = await bookReceipt([{ sku, expectedQty: 6 }]);

      await wms.receiveGoods(receipt.id, companyId, {
        // No putAwayBinId: the units are received but have no home.
        lines: [{ sku, receivedQty: 6 }],
      });

      const instance = await instanceFor(receipt.id);
      const incident = await prisma.processIncident.findFirstOrThrow({
        where: { instanceId: instance!.id, code: 'PUT_AWAY_MISSING' },
      });
      expect(incident.isBlocking).toBe(true);

      const blocked = await prisma.processInstance.findUniqueOrThrow({ where: { id: instance!.id } });
      expect(blocked.status).toBe('BLOCKED');
      // The process is not closed out, and no inventory was booked to a bin.
      expect(await prisma.processOutcome.count({ where: { instanceId: instance!.id } })).toBe(0);
      expect(await prisma.inventoryItem.count({ where: { companyId } })).toBe(0);

      const line = await prisma.goodsReceiptLine.findFirstOrThrow({
        where: { goodsReceipt: { id: receipt.id } },
      });
      expect(line.putAwayComplete).toBe(false);
    });

    it('keeps an unknown SKU a controlled exception instead of booking it silently', async () => {
      // The tenant governs SKUs (one approved variant exists) but this code is
      // not one of them.
      await governedSku('PROD-KNOWN');
      const receipt = await bookReceipt([{ sku: 'NOT-IN-MASTER', expectedQty: 3 }]);

      await wms.receiveGoods(receipt.id, companyId, {
        lines: [{ sku: 'NOT-IN-MASTER', receivedQty: 3, putAwayBinId: binId }],
      });

      const instance = await instanceFor(receipt.id);
      const incident = await prisma.processIncident.findFirstOrThrow({
        where: { instanceId: instance!.id, code: 'UNKNOWN_SKU' },
      });
      expect(incident.isBlocking).toBe(true);

      const blocked = await prisma.processInstance.findUniqueOrThrow({ where: { id: instance!.id } });
      expect(blocked.status).toBe('BLOCKED');

      // It is still a controlled exception: the stock movement is recorded, but
      // nothing is linked to master data that does not exist.
      const item = await prisma.inventoryItem.findFirstOrThrow({
        where: { companyId, sku: 'NOT-IN-MASTER' },
      });
      expect(item.productVariantId).toBeNull();
    });
  });

  describe('linkage', () => {
    it('keeps one process instance per receipt, joined by goodsReceiptId', async () => {
      const sku = await governedSku('PROD-LINKAGE');
      const receipt = await bookReceipt([{ sku, expectedQty: 2 }]);

      await wms.receiveGoods(receipt.id, companyId, {
        lines: [{ sku, receivedQty: 2, putAwayBinId: binId }],
      });

      const instances = await prisma.processInstance.findMany({
        where: { companyId, goodsReceiptId: receipt.id },
      });
      expect(instances).toHaveLength(1);
      expect(instances[0].businessKey).toBe(receipt.receiptNumber);

      const receiptRow = await prisma.goodsReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: { processInstance: true },
      });
      expect(receiptRow.processInstance?.id).toBe(instances[0].id);

      // Replaying the receipt event does not create a second instance.
      await wms.receiveGoods(receipt.id, companyId, {
        lines: [{ sku, receivedQty: 2, putAwayBinId: binId }],
      });
      expect(
        await prisma.processInstance.count({ where: { companyId, goodsReceiptId: receipt.id } }),
      ).toBe(1);
    });

    it('is inert when the WMS receipt bridge is switched off', async () => {
      delete process.env.PROCESS_CONTROL_WMS_RECEIPT_ENABLED;
      const sku = await governedSku('PROD-OFF');
      const receipt = await bookReceipt([{ sku, expectedQty: 1 }]);

      await wms.receiveGoods(receipt.id, companyId, {
        lines: [{ sku, receivedQty: 1, putAwayBinId: binId }],
      });

      expect(await prisma.processInstance.count({ where: { companyId } })).toBe(0);
      expect(await prisma.processIncident.count({ where: { companyId } })).toBe(0);
      // The warehouse still did its job.
      expect(await prisma.inventoryItem.count({ where: { companyId } })).toBe(1);
    });
  });
});
