import { ConflictException } from '@nestjs/common';
import { FakePrisma } from '../testing/fake-prisma';
import { ProcessControlService } from '../process-control/process-control.service';
import { ProductMasterService } from '../product-master/product-master.service';
import { GoodsReceiptProcessBridge, WMS_GOODS_RECEIPT_CODE } from './goods-receipt-process.bridge';

const COMPANY = 'company-a';
const actor = { userId: 'clerk-1', name: 'Dock Clerk', role: 'WAREHOUSE', permissions: null };

/**
 * Bridge tests against the in-memory Prisma double. They prove the wiring:
 * the standard is provisioned (as a PILOT, never auto-approved), execution is
 * idempotent, exceptions become incidents, and enforcement refuses to complete
 * a receipt with blocking exceptions.
 */
describe('GoodsReceiptProcessBridge', () => {
  let prisma: FakePrisma;
  let processControl: ProcessControlService;
  let bridge: GoodsReceiptProcessBridge;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.PROCESS_CONTROL_ENABLED = 'true';
    process.env.PROCESS_CONTROL_WMS_RECEIPT_ENABLED = 'true';
    delete process.env.PROCESS_CONTROL_WMS_RECEIPT_ENFORCE;

    prisma = new FakePrisma();
    processControl = new ProcessControlService(prisma as any);
    bridge = new GoodsReceiptProcessBridge(
      prisma as any,
      processControl,
      new ProductMasterService(prisma as any),
    );
  });

  afterEach(() => {
    delete process.env.PROCESS_CONTROL_ENABLED;
    delete process.env.PROCESS_CONTROL_WMS_RECEIPT_ENABLED;
    delete process.env.PROCESS_CONTROL_WMS_RECEIPT_ENFORCE;
  });

  const receipt = { id: 'gr-1', receiptNumber: 'GR-2026-00001', poNumber: 'PO-9', supplierName: 'Acme' };

  const cleanLines = [
    { sku: 'SKU-00001', expectedQty: 100, receivedQty: 100, damagedQty: 0, putAwayBinId: 'bin-1' },
  ];

  it('does nothing while the bridge is disabled', async () => {
    delete process.env.PROCESS_CONTROL_WMS_RECEIPT_ENABLED;
    const result = await bridge.onGoodsReceived(COMPANY, receipt, cleanLines, actor);
    expect(result.instanceId).toBeNull();
    expect(result.reconciliation.outcome).toBe('CLEAN');
    expect(prisma.all('processInstance')).toHaveLength(0);
  });

  it('provisions the standard as a pilot — never auto-approves it', async () => {
    await bridge.onReceiptCreated(COMPANY, receipt, actor);

    const definition = prisma.all('processDefinition')[0];
    const version = prisma.all('processVersion')[0];
    expect(definition.code).toBe(WMS_GOODS_RECEIPT_CODE);
    expect(version.status).toBe('PILOT');
    expect(version.isImmutable).toBe(false);
    expect(prisma.all('processStepDefinition')).toHaveLength(4);
  });

  it('starts the execution against the receipt and links it', async () => {
    await bridge.onReceiptCreated(COMPANY, receipt, actor);
    const instance = prisma.all('processInstance')[0];
    expect(instance.businessKey).toBe('GR-2026-00001');
    expect(instance.goodsReceiptId).toBe('gr-1');
    expect(instance.status).toBe('IN_PROGRESS');
  });

  it('does not start a second instance when the receipt is replayed', async () => {
    await bridge.onReceiptCreated(COMPANY, receipt, actor);
    await bridge.onReceiptCreated(COMPANY, receipt, actor);
    expect(prisma.all('processInstance')).toHaveLength(1);
  });

  describe('clean receipt', () => {
    it('walks the standard and records a first-time-right outcome', async () => {
      await bridge.onReceiptCreated(COMPANY, receipt, actor);
      const result = await bridge.onGoodsReceived(COMPANY, receipt, cleanLines, actor);

      expect(result.reconciliation.outcome).toBe('CLEAN');
      expect(result.blockDecision.blocked).toBe(false);

      const outcome = prisma.all('processOutcome')[0];
      expect(outcome).toBeDefined();
      expect(outcome.firstTimeRight).toBe(true);
      expect(outcome.status).toBe('COMPLETED');
      expect(prisma.all('processInstance')[0].status).toBe('COMPLETED');
    });

    it('captures evidence on every executed step', async () => {
      await bridge.onReceiptCreated(COMPANY, receipt, actor);
      await bridge.onGoodsReceived(COMPANY, receipt, cleanLines, actor);

      const steps = prisma.all('processStepInstance');
      expect(steps.map((s) => s.code).sort()).toEqual(
        ['INSPECT_QUANTITY', 'PUT_AWAY', 'VERIFY_SKU', 'RECORD_OUTCOME'].sort(),
      );
      for (const step of steps) {
        expect(step.status).toBe('COMPLETED');
        expect(step.evidence).toBeTruthy();
      }
    });
  });

  describe('receipt with exceptions', () => {
    const damagedLines = [
      { sku: 'SKU-00001', expectedQty: 100, receivedQty: 95, damagedQty: 3, putAwayBinId: 'bin-1' },
    ];

    it('raises incidents and still closes the run out (observe-only pilot)', async () => {
      await bridge.onReceiptCreated(COMPANY, receipt, actor);
      const result = await bridge.onGoodsReceived(COMPANY, receipt, damagedLines, actor);

      expect(result.reconciliation.outcome).toBe('EXCEPTION');
      expect(result.blockDecision.blocked).toBe(false);

      const codes = prisma.all('processIncident').map((i) => i.code).sort();
      expect(codes).toEqual(['DAMAGED_GOODS', 'QUANTITY_VARIANCE']);
      expect(prisma.all('processIncident').every((i) => !i.isBlocking)).toBe(true);
    });

    it('records the run as not first-time-right when exceptions were raised', async () => {
      await bridge.onReceiptCreated(COMPANY, receipt, actor);
      await bridge.onGoodsReceived(COMPANY, receipt, damagedLines, actor);

      const outcome = prisma.all('processOutcome')[0];
      expect(outcome.firstTimeRight).toBe(false);
      expect(outcome.status).toBe('COMPLETED_WITH_EXCEPTIONS');
    });

    it('does not raise the same incident twice across repeated submissions', async () => {
      await bridge.onReceiptCreated(COMPANY, receipt, actor);
      await bridge.onGoodsReceived(COMPANY, receipt, damagedLines, actor);
      await bridge.onGoodsReceived(COMPANY, receipt, damagedLines, actor);

      const codes = prisma.all('processIncident').map((i) => i.code).sort();
      expect(codes).toEqual(['DAMAGED_GOODS', 'QUANTITY_VARIANCE']);
    });
  });

  describe('enforcement', () => {
    beforeEach(() => {
      process.env.PROCESS_CONTROL_WMS_RECEIPT_ENFORCE = 'true';
    });

    it('blocks a receipt whose good stock has no put-away location', async () => {
      await bridge.onReceiptCreated(COMPANY, receipt, actor);
      const result = await bridge.onGoodsReceived(
        COMPANY,
        receipt,
        [{ sku: 'SKU-00001', expectedQty: 10, receivedQty: 10, damagedQty: 0, putAwayBinId: null }],
        actor,
      );

      expect(result.blockDecision.blocked).toBe(true);
      expect(result.blockDecision.reason).toContain('PUT_AWAY_MISSING');
      expect(() => bridge.assertCompletionAllowed(result.blockDecision)).toThrow(ConflictException);

      // The instance is blocked, so a human has to deal with it.
      expect(prisma.all('processInstance')[0].status).toBe('BLOCKED');
    });

    it('blocks on an unknown SKU when the tenant governs master data', async () => {
      await bridge.onReceiptCreated(COMPANY, receipt, actor);
      const result = await bridge.onGoodsReceived(
        COMPANY,
        receipt,
        [{ sku: 'WIDGET-UNKNOWN', expectedQty: 5, receivedQty: 5, damagedQty: 0, putAwayBinId: 'bin-1', knownVariant: false }],
        actor,
      );

      expect(result.blockDecision.blocked).toBe(true);
      expect(prisma.all('processIncident').some((i) => i.code === 'UNKNOWN_SKU' && i.isBlocking)).toBe(true);
    });

    it('still allows a clean receipt through', async () => {
      await bridge.onReceiptCreated(COMPANY, receipt, actor);
      const result = await bridge.onGoodsReceived(COMPANY, receipt, cleanLines, actor);
      expect(result.blockDecision.blocked).toBe(false);
      expect(() => bridge.assertCompletionAllowed(result.blockDecision)).not.toThrow();
    });
  });

  it('never blocks when the instance could not be started', async () => {
    // No definition provisioned and the bridge cannot create one for a tenant
    // whose capability is off: the receipt must still be completable.
    const result = await bridge.onGoodsReceived(COMPANY, receipt, cleanLines, actor);
    expect(result.blockDecision.blocked).toBe(false);
  });
});
