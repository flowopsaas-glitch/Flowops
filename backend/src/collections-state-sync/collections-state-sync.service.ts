import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type AnyRecord = Record<string, any>;

@Injectable()
export class CollectionsStateSyncService {
  private readonly dataDir = join(process.cwd(), 'data');
  private readonly collectionsFile = join(this.dataDir, 'collections-state-sync-store.json');
  private readonly dispatchJobsFile = join(this.dataDir, 'dispatch-jobs-store.json');

  constructor() {
    this.ensureFile(this.collectionsFile, { records: [] });
    this.ensureFile(this.dispatchJobsFile, { jobs: [] });
  }

  getRecords() {
    const result = this.syncBridge();
    return result.records;
  }

  getDashboard() {
    const result = this.syncBridge();
    return result.dashboard;
  }

  getWorkflow(id: string) {
    const result = this.syncBridge();
    const record = this.findCollectionOrThrow(id, result.records);
    const dispatchJob = this.findMatchingDispatchJob(record, this.loadDispatchJobs());

    return {
      ok: true,
      workflow: this.buildWorkflow(record, dispatchJob),
    };
  }

  repair() {
    return this.syncBridge();
  }

  bulkSync() {
    const result = this.syncBridge();
    return {
      ok: true,
      action: 'bulk-sync',
      message: 'Bulk sync completed.',
      dashboard: result.dashboard,
      recordsProcessed: result.records.length,
    };
  }

  syncOne(id: string) {
    const result = this.syncBridge();
    const records: AnyRecord[] = result.records.map((item: AnyRecord) => ({ ...item }));
    const record = this.findCollectionOrThrow(id, records);

    const jobs: AnyRecord[] = this.loadDispatchJobs();
    const matchedJob = this.findMatchingDispatchJob(record, jobs);

    if (matchedJob) {
      this.mergeJobIntoRecord(record, matchedJob);
    }

    const finalized = this.finalizeCollectionRecord(record, matchedJob);
    const idx = records.findIndex((r: AnyRecord) => this.matchesCollection(r, id));
    if (idx >= 0) {
      records[idx] = finalized;
    }

    this.saveCollections(records);
    const dashboard = this.buildDashboard(records);

    return {
      ok: true,
      action: 'sync',
      id,
      message: `Collection ${id} synced.`,
      workflow: this.buildWorkflow(finalized, matchedJob),
      dashboard,
    };
  }

  autoAssign(id: string) {
    const result = this.syncBridge();
    const records: AnyRecord[] = result.records.map((item: AnyRecord) => ({ ...item }));
    const jobs: AnyRecord[] = this.loadDispatchJobs();

    const record = this.findCollectionOrThrow(id, records);
    const matchedJob = this.findMatchingDispatchJob(record, jobs);

    const driver = this.selectBestDriver(record, records);

    record.assignedDriverId = this.truthyText(driver.id);
    record.assignedDriverName = this.truthyText(driver.name);
    record.pendingDriver = false;
    record.dispatchLinked = true;
    record.dispatchStatus = 'ASSIGNED';
    record.status = this.truthyText(record.status, 'ASSIGNED') === 'PENDING' ? 'ASSIGNED' : this.truthyText(record.status, 'ASSIGNED');
    record.syncState = 'FULLY_SYNCED';
    record.updatedAt = new Date().toISOString();

    if (matchedJob) {
      matchedJob.assignedDriverId = this.truthyText(driver.id);
      matchedJob.assignedDriverName = this.truthyText(driver.name);
      matchedJob.driverId = this.truthyText(driver.id);
      matchedJob.driverName = this.truthyText(driver.name);
      matchedJob.status = 'ASSIGNED';
      matchedJob.updatedAt = new Date().toISOString();
      (matchedJob as AnyRecord).assignedAt = new Date().toISOString();
    }

    this.saveCollections(records);
    this.saveDispatchJobs(jobs);

    const finalBridge = this.syncBridge();
    const finalRecord = this.findCollectionOrThrow(id, finalBridge.records);
    const finalJob = this.findMatchingDispatchJob(finalRecord, this.loadDispatchJobs());

    return {
      ok: true,
      action: 'auto-assign',
      id,
      assignedDriver: driver,
      message: `Driver ${driver.name} assigned to ${id}.`,
      workflow: this.buildWorkflow(finalRecord, finalJob),
      dashboard: finalBridge.dashboard,
    };
  }

  release(id: string) {
    const result = this.syncBridge();
    const records: AnyRecord[] = result.records.map((item: AnyRecord) => ({ ...item }));
    const jobs: AnyRecord[] = this.loadDispatchJobs();

    const record = this.findCollectionOrThrow(id, records);
    const matchedJob = this.findMatchingDispatchJob(record, jobs);

    record.assignedDriverId = '';
    record.assignedDriverName = '';
    record.pendingDriver = true;
    record.dispatchStatus = 'PENDING';
    record.syncState = 'PARTIAL_SYNC';
    record.updatedAt = new Date().toISOString();

    if (matchedJob) {
      matchedJob.assignedDriverId = '';
      matchedJob.assignedDriverName = '';
      matchedJob.driverId = '';
      matchedJob.driverName = '';
      matchedJob.status = 'PENDING';
      matchedJob.updatedAt = new Date().toISOString();
      (matchedJob as AnyRecord).assignedAt = '';
    }

    this.saveCollections(records);
    this.saveDispatchJobs(jobs);

    const finalBridge = this.syncBridge();
    const finalRecord = this.findCollectionOrThrow(id, finalBridge.records);
    const finalJob = this.findMatchingDispatchJob(finalRecord, this.loadDispatchJobs());

    return {
      ok: true,
      action: 'release',
      id,
      message: `Driver released from ${id}.`,
      workflow: this.buildWorkflow(finalRecord, finalJob),
      dashboard: finalBridge.dashboard,
    };
  }

  syncBridge() {
    const collectionsStore = this.readJson(this.collectionsFile, { records: [] });
    const dispatchStore = this.readJson(this.dispatchJobsFile, { jobs: [] });

    const collectionsInfo = this.extractArrayWithKey(collectionsStore, ['records', 'items', 'data']);
    const dispatchInfo = this.extractArrayWithKey(dispatchStore, ['jobs', 'items', 'data', 'records']);

    let records: AnyRecord[] = collectionsInfo.items.map((item) => this.normalizeCollectionRecord(item) as AnyRecord);

    records = records.filter((record: AnyRecord) => !this.isSyntheticJobPollution(record));

    const jobs: AnyRecord[] = dispatchInfo.items.map((item) => this.normalizeDispatchJob(item) as AnyRecord);

    const recordsByKey = new Map<string, AnyRecord>();
    for (const record of records) {
      for (const key of this.collectCollectionKeys(record)) {
        recordsByKey.set(key, record);
      }
    }

    for (const job of jobs) {
      if (!this.jobHasRealCollectionLink(job)) {
        continue;
      }

      const match = this.findMatchingCollectionRecord(job, recordsByKey);
      if (match) {
        this.mergeJobIntoRecord(match, job);
      }
    }

    records = records.map((record: AnyRecord): AnyRecord => {
      const matchedJob = this.findMatchingDispatchJob(record, jobs);
      return this.finalizeCollectionRecord(record, matchedJob) as AnyRecord;
    });

    const dashboard = this.buildDashboard(records);

    this.saveArrayBack(this.collectionsFile, collectionsStore, collectionsInfo.key, records);

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      records,
      dashboard,
    };
  }

  private findCollectionOrThrow(id: string, records: AnyRecord[]) {
    const record = records.find((r: AnyRecord) => this.matchesCollection(r, id));
    if (!record) {
      throw new NotFoundException(`Collection workflow not found: ${id}`);
    }
    return record;
  }

  private matchesCollection(record: AnyRecord, id: string) {
    const target = this.normalizeText(id);
    const keys = [
      this.truthyText(record.id),
      this.truthyText(record.collectionId),
      this.truthyText(record.reference),
      this.truthyText(record.dispatchJobId),
    ]
      .map((x) => this.normalizeText(x))
      .filter(Boolean);

    return keys.includes(target);
  }

  private loadDispatchJobs(): AnyRecord[] {
    const store = this.readJson(this.dispatchJobsFile, { jobs: [] });
    const info = this.extractArrayWithKey(store, ['jobs', 'items', 'data', 'records']);
    return info.items.map((item) => this.normalizeDispatchJob(item) as AnyRecord);
  }

  private saveCollections(records: AnyRecord[]) {
    const store = this.readJson(this.collectionsFile, { records: [] });
    const info = this.extractArrayWithKey(store, ['records', 'items', 'data']);
    this.saveArrayBack(this.collectionsFile, store, info.key, records);
  }

  private saveDispatchJobs(jobs: AnyRecord[]) {
    const store = this.readJson(this.dispatchJobsFile, { jobs: [] });
    const info = this.extractArrayWithKey(store, ['jobs', 'items', 'data', 'records']);
    this.saveArrayBack(this.dispatchJobsFile, store, info.key, jobs);
  }

  private buildWorkflow(record: AnyRecord, dispatchJob: AnyRecord | null) {
    return {
      id: this.truthyText(record.collectionId, record.id, record.reference),
      collectionId: this.truthyText(record.collectionId, record.id),
      reference: this.truthyText(record.reference, record.collectionId),
      customerName: this.truthyText(record.customerName),
      destination: this.truthyText(record.destination, record.area, record.zone, 'Unknown'),
      area: this.truthyText(record.area, record.zone),
      zone: this.truthyText(record.zone, record.area),
      priority: this.truthyText(record.priority, 'NORMAL'),
      status: this.truthyText(record.status, 'PENDING'),
      syncState: this.truthyText(record.syncState, 'PARTIAL_SYNC'),
      dispatchLinked: Boolean(record.dispatchLinked),
      shipmentLinked: Boolean(record.shipmentLinked),
      podLinked: Boolean(record.podLinked),
      invoiceLinked: Boolean(record.invoiceLinked),
      billingMismatch: Boolean(record.billingMismatch),
      delayRisk: Boolean(record.delayRisk),
      overloadRisk: Boolean(record.overloadRisk),
      pendingDriver: Boolean(record.pendingDriver),
      assignedDriverId: this.truthyText(record.assignedDriverId),
      assignedDriverName: this.truthyText(record.assignedDriverName),
      driverTruth: this.truthyText(record.assignedDriverName, record.assignedDriverId) ? 'Assigned' : 'Unassigned',
      dispatchStatus: this.truthyText(record.dispatchStatus, dispatchJob?.status, 'PENDING'),
      shipmentStatus: Boolean(record.shipmentLinked) ? 'Pending Collection' : 'Not Linked',
      podStatus: Boolean(record.podLinked) ? 'Awaiting Collection' : 'Not Linked',
      invoiceStatus: Boolean(record.invoiceLinked) ? 'Draft' : 'Missing',
      aiPriority: this.resolveAiPriority(record),
      activeFlags: this.getActiveFlags(record),
      updatedAt: this.truthyText(record.updatedAt, new Date().toISOString()),
      dispatchJob: dispatchJob
        ? {
            id: this.truthyText(dispatchJob.id, dispatchJob.jobId),
            reference: this.truthyText(dispatchJob.reference),
            status: this.truthyText(dispatchJob.status),
            assignedDriverId: this.truthyText(dispatchJob.assignedDriverId),
            assignedDriverName: this.truthyText(dispatchJob.assignedDriverName),
            updatedAt: this.truthyText(dispatchJob.updatedAt),
          }
        : null,
    };
  }

  private resolveAiPriority(record: AnyRecord) {
    if (Boolean(record.billingMismatch) || Boolean(record.delayRisk)) return 'HIGH';
    if (Boolean(record.overloadRisk) || Boolean(record.pendingDriver)) return 'MEDIUM';
    return 'NORMAL';
  }

  private getActiveFlags(record: AnyRecord) {
    const flags: string[] = [];
    if (Boolean(record.billingMismatch)) flags.push('BILLING_MISMATCH');
    if (Boolean(record.delayRisk)) flags.push('DELAY_RISK');
    if (Boolean(record.overloadRisk)) flags.push('OVERLOAD_RISK');
    if (Boolean(record.pendingDriver)) flags.push('NEEDS_DRIVER');
    return flags;
  }

  private selectBestDriver(record: AnyRecord, records: AnyRecord[]) {
    const driverPool = [
      { id: 'DRV-1', name: 'Kadi Dev', area: 'Johannesburg' },
      { id: 'DRV-2', name: 'Demo Driver 1', area: 'Pretoria' },
      { id: 'DRV-3', name: 'Demo Driver 2', area: 'Operations Zone' },
    ];

    const recordArea = this.truthyText(record.area, record.zone, record.destination);

    const driverLoads = driverPool.map((driver) => {
      const load = records.filter(
        (r: AnyRecord) =>
          this.truthyText(r.assignedDriverId) === driver.id ||
          this.truthyText(r.assignedDriverName) === driver.name,
      ).length;

      const areaMatch =
        this.normalizeText(driver.area) === this.normalizeText(recordArea) ? 1 : 0;

      return {
        ...driver,
        load,
        areaMatch,
      };
    });

    driverLoads.sort((a, b) => {
      if (b.areaMatch !== a.areaMatch) return b.areaMatch - a.areaMatch;
      return a.load - b.load;
    });

    return {
      id: driverLoads[0]?.id || 'DRV-2',
      name: driverLoads[0]?.name || 'Demo Driver 1',
    };
  }

  private isSyntheticJobPollution(record: AnyRecord) {
    const id = this.truthyText(record.id);
    const reference = this.truthyText(record.reference);
    const collectionId = this.truthyText(record.collectionId);
    const source = this.truthyText(record.source);

    const looksLikeJobOnly =
      (id.startsWith('JOB-') || reference.startsWith('JOB-')) &&
      !collectionId.startsWith('COL-');

    return looksLikeJobOnly && source === 'dispatch-bridge-created';
  }

  private jobHasRealCollectionLink(job: AnyRecord) {
    const collectionId = this.truthyText(
      job.collectionId,
      job.linkedCollectionId,
      job.linkedCollection?.id,
    );

    const linkedRef = this.truthyText(
      job.collectionReference,
      job.collectionRef,
      job.linkedCollectionReference,
      job.linkedCollection?.reference,
    );

    const ownReference = this.truthyText(job.reference, job.jobReference);

    return (
      collectionId.startsWith('COL-') ||
      linkedRef.startsWith('COL-') ||
      ownReference.startsWith('COL-')
    );
  }

  private findMatchingCollectionRecord(job: AnyRecord, recordsByKey: Map<string, AnyRecord>) {
    for (const key of this.collectJobLinkKeys(job)) {
      const match = recordsByKey.get(key);
      if (match) return match;
    }
    return null;
  }

  private findMatchingDispatchJob(record: AnyRecord, jobs: AnyRecord[]) {
    const recordKeys = new Set(this.collectCollectionKeys(record));
    return (
      jobs.find((job: AnyRecord) =>
        this.jobHasRealCollectionLink(job) &&
        this.collectJobLinkKeys(job).some((key) => recordKeys.has(key)),
      ) || null
    );
  }

  private mergeJobIntoRecord(record: AnyRecord, job: AnyRecord) {
    record.dispatchLinked = true;
    record.dispatchJobId = this.truthyText(record.dispatchJobId, job.jobId, job.id);
    record.collectionId = this.truthyText(record.collectionId, job.collectionId);
    record.reference = this.truthyText(record.reference, job.collectionReference, job.reference);
    record.assignedDriverId = this.truthyText(job.assignedDriverId, record.assignedDriverId);
    record.assignedDriverName = this.truthyText(job.assignedDriverName, record.assignedDriverName);
    record.updatedAt = new Date().toISOString();
    record.dispatchStatus = this.truthyText(job.status, record.dispatchStatus);
  }

  private finalizeCollectionRecord(record: AnyRecord, job: AnyRecord | null) {
    const driverAssigned = Boolean(
      this.truthyText(
        record.assignedDriverId,
        record.assignedDriverName,
        job?.assignedDriverId,
        job?.assignedDriverName,
      ),
    );

    const linked = Boolean(job || record.dispatchLinked || this.truthyText(record.dispatchJobId));

    let syncState = 'BROKEN_SYNC';
    if (linked && driverAssigned) syncState = 'FULLY_SYNCED';
    else if (linked || this.truthyText(record.collectionId, record.reference, record.id)) syncState = 'PARTIAL_SYNC';

    return {
      ...record,
      dispatchLinked: linked,
      dispatchJobId: this.truthyText(record.dispatchJobId, job?.jobId, job?.id),
      assignedDriverId: this.truthyText(record.assignedDriverId, job?.assignedDriverId),
      assignedDriverName: this.truthyText(record.assignedDriverName, job?.assignedDriverName),
      pendingDriver: linked && !driverAssigned,
      syncState,
      updatedAt: new Date().toISOString(),
    };
  }

  private buildDashboard(records: AnyRecord[]) {
    const total = records.length;
    const fullySynced = records.filter((r) => this.truthyText(r.syncState) === 'FULLY_SYNCED').length;
    const partialSync = records.filter((r) => this.truthyText(r.syncState) === 'PARTIAL_SYNC').length;
    const brokenSync = records.filter((r) => this.truthyText(r.syncState) === 'BROKEN_SYNC').length;
    const pendingDriver = records.filter((r) => Boolean(r.pendingDriver)).length;
    const delayRisk = records.filter((r) => Boolean(r.delayRisk)).length;
    const overloadRisk = records.filter((r) => Boolean(r.overloadRisk)).length;
    const billingMismatch = records.filter((r) => Boolean(r.billingMismatch)).length;
    const dispatchLinked = records.filter((r) => Boolean(r.dispatchLinked)).length;

    return {
      collections: total,
      fullySynced,
      partialSync,
      brokenSync,
      pendingDriver,
      delayRisk,
      overloadRisk,
      billingMismatch,
      dispatchLinked,
      alerts: pendingDriver + brokenSync + delayRisk + overloadRisk + billingMismatch,
      records: total,
      drivers: records.filter((r) => this.truthyText(r.assignedDriverId, r.assignedDriverName)).length,
      systemLive: true,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  private normalizeCollectionRecord(item: AnyRecord) {
    const collectionId = this.truthyText(
      item.collectionId,
      item.collection_id,
      item.id,
      item.collection?.id,
    );

    const reference = this.truthyText(
      item.reference,
      item.collectionRef,
      item.collectionReference,
      item.waybillNumber,
      item.waybillNo,
      item.waybill,
    );

    const driverId = this.truthyText(
      item.assignedDriverId,
      item.driverId,
      item.driver_id,
      item.assignedDriver?.id,
    );

    const driverName = this.truthyText(
      item.assignedDriverName,
      item.driverName,
      item.assignedDriver,
      item.assignedDriver?.name,
      item.driver,
    );

    return {
      ...item,
      id: this.truthyText(item.id, collectionId, reference),
      collectionId,
      reference,
      customerName: this.truthyText(item.customerName, item.clientName, item.companyName),
      destination: this.truthyText(item.destination, item.destinationCity, item.deliveryAddress),
      dispatchJobId: this.truthyText(item.dispatchJobId, item.jobId, collectionId, reference),
      dispatchLinked: Boolean(item.dispatchLinked),
      syncState: this.truthyText(item.syncState, 'PARTIAL_SYNC'),
      assignedDriverId: driverId,
      assignedDriverName: driverName,
      pendingDriver: Boolean(item.pendingDriver),
      overloadRisk: Boolean(item.overloadRisk),
      delayRisk: Boolean(item.delayRisk),
      billingMismatch: Boolean(item.billingMismatch),
      updatedAt: this.truthyText(item.updatedAt, new Date().toISOString()),
    };
  }

  private normalizeDispatchJob(item: AnyRecord) {
    const id = this.truthyText(item.id, item.jobId, item.dispatchJobId);
    const collectionId = this.truthyText(
      item.collectionId,
      item.collection_id,
      item.linkedCollectionId,
      item.linkedCollection?.id,
    );

    const reference = this.truthyText(
      item.reference,
      item.jobReference,
      item.jobNumber,
      item.waybillNo,
      item.waybillNumber,
      item.waybill,
    );

    const collectionReference = this.truthyText(
      item.collectionReference,
      item.collectionRef,
      item.linkedCollectionReference,
      item.linkedCollection?.reference,
    );

    const driverId = this.truthyText(
      item.assignedDriverId,
      item.driverId,
      item.driver_id,
      item.assignedDriver?.id,
    );

    const driverName = this.truthyText(
      item.assignedDriverName,
      item.driverName,
      item.assignedDriver?.name,
      item.assignedDriver,
      item.driver,
    );

    return {
      ...item,
      id: id || reference,
      jobId: id || reference,
      collectionId,
      reference,
      collectionReference,
      assignedDriverId: driverId,
      assignedDriverName: driverName,
      driverId,
      driverName,
      status: this.truthyText(item.status, driverId || driverName ? 'ASSIGNED' : 'PENDING'),
      updatedAt: this.truthyText(item.updatedAt, new Date().toISOString()),
    };
  }

  private collectCollectionKeys(item: AnyRecord) {
    const keys = [
      this.truthyText(item.collectionId),
      this.truthyText(item.reference),
      this.truthyText(item.collectionRef),
      this.truthyText(item.collectionReference),
      this.truthyText(item.id),
      this.truthyText(item.dispatchJobId),
    ]
      .map((x) => this.normalizeText(x))
      .filter(Boolean);

    return Array.from(new Set(keys));
  }

  private collectJobLinkKeys(item: AnyRecord) {
    const keys = [
      this.truthyText(item.collectionId),
      this.truthyText(item.collectionReference),
      this.truthyText(item.collectionRef),
      this.truthyText(item.linkedCollectionId),
      this.truthyText(item.linkedCollectionReference),
      this.truthyText(item.reference).startsWith('COL-') ? this.truthyText(item.reference) : '',
    ]
      .map((x) => this.normalizeText(x))
      .filter(Boolean);

    return Array.from(new Set(keys));
  }

  private ensureFile(filePath: string, seed: any) {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    if (!existsSync(filePath)) {
      writeFileSync(filePath, JSON.stringify(seed, null, 2), 'utf-8');
    }
  }

  private readJson(filePath: string, fallback: any) {
    try {
      const raw = readFileSync(filePath, 'utf-8').trim();
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  private writeJson(filePath: string, value: any) {
    writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
  }

  private extractArrayWithKey(store: any, preferredKeys: string[]) {
    if (Array.isArray(store)) {
      return { key: null as string | null, items: store as any[] };
    }

    for (const key of preferredKeys) {
      if (Array.isArray(store?.[key])) {
        return { key, items: store[key] as any[] };
      }
    }

    return { key: preferredKeys[0] ?? 'items', items: [] as any[] };
  }

  private saveArrayBack(filePath: string, originalStore: any, key: string | null, items: any[]) {
    if (Array.isArray(originalStore)) {
      this.writeJson(filePath, items);
      return;
    }

    const nextStore = originalStore && typeof originalStore === 'object' ? { ...originalStore } : {};
    nextStore[key || 'items'] = items;
    this.writeJson(filePath, nextStore);
  }

  private normalizeText(value: any) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private pick(...values: any[]) {
    for (const value of values) {
      if (value === 0) return value;
      if (value === false) return value;
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return undefined;
  }

  private truthyText(...values: any[]) {
    const value = this.pick(...values);
    return value === undefined ? '' : String(value).trim();
  }
}
