import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type AnyRecord = Record<string, any>;

@Injectable()
export class DispatchService {
  private readonly dataDir = join(process.cwd(), 'data');
  private readonly jobsFile = join(this.dataDir, 'dispatch-jobs-store.json');
  private readonly collectionsFile = join(this.dataDir, 'collections-state-sync-store.json');

  constructor() {
    this.ensureFile(this.jobsFile, { jobs: [] });
    this.ensureFile(this.collectionsFile, { records: [] });
  }

  getJobs() {
    const store = this.readJson(this.jobsFile, { jobs: [] });
    const info = this.extractArrayWithKey(store, ['jobs', 'items', 'data', 'records']);
    const jobs: AnyRecord[] = info.items.map((item) => this.normalizeJob(item) as AnyRecord);

    this.saveArrayBack(this.jobsFile, store, info.key, jobs);
    this.syncCollectionsBridge(jobs);

    return jobs;
  }

  assignJob(id: string, payload: AnyRecord = {}) {
    const store = this.readJson(this.jobsFile, { jobs: [] });
    const info = this.extractArrayWithKey(store, ['jobs', 'items', 'data', 'records']);
    const jobs: AnyRecord[] = info.items.map((item) => this.normalizeJob(item) as AnyRecord);

    const target = jobs.find((job) => this.matches(job, id));
    if (!target) {
      throw new NotFoundException(`Dispatch job not found: ${id}`);
    }

    target.assignedDriverId = this.truthyText(
      payload.driverId,
      payload.id,
      payload.driver?.id,
      target.assignedDriverId,
    );

    target.assignedDriverName = this.truthyText(
      payload.driverName,
      payload.name,
      payload.driver?.name,
      target.assignedDriverName,
    );

    target.driverId = target.assignedDriverId;
    target.driverName = target.assignedDriverName;
    (target as AnyRecord)["assignedAt"] = new Date().toISOString();
    target.status = target.assignedDriverId || target.assignedDriverName ? 'ASSIGNED' : target.status;
    target.updatedAt = new Date().toISOString();

    this.saveArrayBack(this.jobsFile, store, info.key, jobs);
    this.syncCollectionsBridge(jobs);

    return target;
  }

  unassignJob(id: string) {
    const store = this.readJson(this.jobsFile, { jobs: [] });
    const info = this.extractArrayWithKey(store, ['jobs', 'items', 'data', 'records']);
    const jobs: AnyRecord[] = info.items.map((item) => this.normalizeJob(item) as AnyRecord);

    const target = jobs.find((job) => this.matches(job, id));
    if (!target) {
      throw new NotFoundException(`Dispatch job not found: ${id}`);
    }

    target.assignedDriverId = '';
    target.assignedDriverName = '';
    target.driverId = '';
    target.driverName = '';
    target.status = 'UNASSIGNED';
    target.updatedAt = new Date().toISOString();

    this.saveArrayBack(this.jobsFile, store, info.key, jobs);
    this.syncCollectionsBridge(jobs);

    return target;
  }

  private syncCollectionsBridge(sourceJobs?: AnyRecord[]) {
    const jobs =
      sourceJobs?.map((item) => this.normalizeJob(item)) ??
      this.extractArrayWithKey(this.readJson(this.jobsFile, { jobs: [] }), ['jobs', 'items', 'data', 'records']).items.map((item) =>
        this.normalizeJob(item),
      );

    const collectionsStore = this.readJson(this.collectionsFile, { records: [] });
    const collectionsInfo = this.extractArrayWithKey(collectionsStore, ['records', 'items', 'data']);
    let records: AnyRecord[] = collectionsInfo.items.map((item) => this.normalizeCollectionRecord(item) as AnyRecord);

    // clean any prior synthetic job pollution
    records = records.filter((record) => !this.isSyntheticJobPollution(record));

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

      const match =
        this.collectJobLinkKeys(job)
          .map((key) => recordsByKey.get(key))
          .find(Boolean) || null;

      if (match) {
        match.dispatchLinked = true;
        match.dispatchJobId = this.truthyText(match.dispatchJobId, job.jobId, job.id);
        match.collectionId = this.truthyText(match.collectionId, job.collectionId);
        match.reference = this.truthyText(match.reference, job.collectionReference, job.reference);
        match.assignedDriverId = this.truthyText(job.assignedDriverId, match.assignedDriverId);
        match.assignedDriverName = this.truthyText(job.assignedDriverName, match.assignedDriverName);
        match.pendingDriver = !(match.assignedDriverId || match.assignedDriverName);
        match.syncState = match.pendingDriver ? 'PARTIAL_SYNC' : 'FULLY_SYNCED';
        match.updatedAt = new Date().toISOString();
      }
    }

    records = records.map((record) => {
      const linkedJob =
        jobs.find((job) =>
          this.jobHasRealCollectionLink(job) &&
          this.collectJobLinkKeys(job).some((key) => this.collectCollectionKeys(record).includes(key)),
        ) || null;

      const driverAssigned = Boolean(
        this.truthyText(record.assignedDriverId, record.assignedDriverName, linkedJob?.assignedDriverId, linkedJob?.assignedDriverName),
      );
      const linked = Boolean(linkedJob || record.dispatchLinked || this.truthyText(record.dispatchJobId));

      return {
        ...record,
        dispatchLinked: linked,
        dispatchJobId: this.truthyText(record.dispatchJobId, linkedJob?.jobId, linkedJob?.id),
        assignedDriverId: this.truthyText(record.assignedDriverId, linkedJob?.assignedDriverId),
        assignedDriverName: this.truthyText(record.assignedDriverName, linkedJob?.assignedDriverName),
        pendingDriver: linked && !driverAssigned,
        syncState: linked && driverAssigned ? 'FULLY_SYNCED' : linked ? 'PARTIAL_SYNC' : 'BROKEN_SYNC',
        updatedAt: new Date().toISOString(),
      };
    });

    this.saveArrayBack(this.collectionsFile, collectionsStore, collectionsInfo.key, records);
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

  private normalizeJob(item: AnyRecord) {
    const id = this.truthyText(item.id, item.jobId, item.dispatchJobId);
    const collectionId = this.truthyText(item.collectionId, item.collection_id, item.linkedCollectionId);
    const reference = this.truthyText(item.reference, item.jobReference, item.jobNumber, item.waybillNo, item.waybillNumber);
    const collectionReference = this.truthyText(
      item.collectionReference,
      item.collectionRef,
      item.linkedCollectionReference,
      item.linkedCollection?.reference,
    );
    const driverId = this.truthyText(item.assignedDriverId, item.driverId, item.driver?.id);
    const driverName = this.truthyText(item.assignedDriverName, item.driverName, item.driver?.name, item.assignedDriver);

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
      status: this.truthyText(item.status, driverId || driverName ? 'ASSIGNED' : 'UNASSIGNED'),
      updatedAt: this.truthyText(item.updatedAt, new Date().toISOString()),
    };
  }

  private normalizeCollectionRecord(item: AnyRecord) {
    return {
      ...item,
      id: this.truthyText(item.id, item.collectionId, item.reference),
      collectionId: this.truthyText(item.collectionId, item.collection_id, item.id),
      reference: this.truthyText(item.reference, item.waybillNo, item.waybillNumber, item.collectionRef),
      dispatchJobId: this.truthyText(item.dispatchJobId, item.jobId),
      assignedDriverId: this.truthyText(item.assignedDriverId, item.driverId),
      assignedDriverName: this.truthyText(item.assignedDriverName, item.driverName, item.assignedDriver),
      dispatchLinked: Boolean(item.dispatchLinked),
      pendingDriver: Boolean(item.pendingDriver),
      syncState: this.truthyText(item.syncState, 'PARTIAL_SYNC'),
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

  private matches(job: AnyRecord, id: string) {
    const target = this.normalizeText(id);
    const keys = [
      this.truthyText(job.id),
      this.truthyText(job.jobId),
      this.truthyText(job.reference),
    ]
      .map((x) => this.normalizeText(x))
      .filter(Boolean);

    return keys.includes(target);
  }
}
