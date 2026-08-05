// Lightweight offline cache for the driver's jobs so the dashboard still shows
// the last-known list when the device drops connectivity in the field.
import Dexie, { type Table } from 'dexie';

export type Job = Record<string, any> & { id: string };

class DriverDB extends Dexie {
  jobs!: Table<Job, string>;
  constructor() {
    super('flowops-driver');
    this.version(1).stores({ jobs: 'id, status, type' });
  }
}

const db = new DriverDB();

export async function cacheJobs(jobs: Job[]): Promise<void> {
  try {
    await db.transaction('rw', db.jobs, async () => {
      await db.jobs.clear();
      if (jobs.length) await db.jobs.bulkPut(jobs);
    });
  } catch {
    /* cache is best-effort */
  }
}

export async function getCachedJobs(): Promise<Job[]> {
  try {
    return await db.jobs.toArray();
  } catch {
    return [];
  }
}
