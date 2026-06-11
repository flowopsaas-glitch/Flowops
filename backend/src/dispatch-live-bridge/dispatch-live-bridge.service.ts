import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DispatchLiveBridgeService {
  private readonly logger = new Logger(DispatchLiveBridgeService.name);
  private readonly jobsStorePath = path.join(process.cwd(), 'data', 'dispatch-jobs-store.json');

  constructor(private prisma: PrismaService) {}

  private ensureJobsStore() {
    const dir = path.dirname(this.jobsStorePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.jobsStorePath)) {
      const seeded = Array.from({ length: 20 }).map((_, index) => ({
        id: `JOB-${index + 1}`,
        reference: `JOB-${index + 1}`,
        customer: [
          'Nexus Trading', 'Apex Solutions', 'Delta Corp', 'Interlink NV',
          'Global Logistics HW', 'Bright Path', 'Cargo West', 'Metro Wholesale',
          'Northline Supply', 'Urban Freight',
        ][index % 10],
        area: index % 3 === 0 ? 'Johannesburg' : index % 3 === 1 ? 'Pretoria' : 'Operations Zone',
        zone: index % 3 === 0 ? 'Johannesburg' : index % 3 === 1 ? 'Pretoria' : 'Operations Zone',
        status: 'PENDING',
        priority: index % 7 === 0 ? 'HIGH' : 'NORMAL',
        assignedDriverId: null,
        assignedDriverName: null,
      }));

      fs.writeFileSync(this.jobsStorePath, JSON.stringify(seeded, null, 2), 'utf-8');
    }
  }

  async getJobs() {
    this.ensureJobsStore();

    // 1. Get Legacy JSON Jobs
    let legacyJobs = [];
    try {
      const raw = fs.readFileSync(this.jobsStorePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Only return jobs that need drivers
        legacyJobs = parsed.filter(j => j.status === 'PENDING' || j.status === 'UNASSIGNED');
      }
    } catch (e) {
      this.logger.error('Failed to read JSON jobs', e);
    }

// 2. 🚀 UPGRADE: Get AI Waybills from Prisma
    let aiWaybills = [];
    try {
      const waybills = await (this.prisma as any).waybill.findMany({
        where: { 
          status: 'REGISTERED', // Only grab the ones ready for dispatch
          billingBatchId: null 
        },
        include: { company: true }
      });

      aiWaybills = waybills.map((w: any) => ({
        id: w.id.toString(),
        reference: w.waybillNumber || `AWB-${w.id}`,
        customer: w.company?.name || w.sender || 'Standard Client',
        area: w.recipient || 'Operations Zone',
        status: 'PENDING',
        priority: 'HIGH', // AI jobs get priority!
        isWaybill: true
      }));
    } catch (e) {
      this.logger.error('Prisma fetch failed, ensuring database is connected.', e);
    }

    // 3. Blend them together!
    return [...aiWaybills, ...legacyJobs];
  }

  async assignJob(id: string, body: any) {
    this.logger.log(`Assigning Job ${id} to Driver ${body.driverId}`);

    // Check if it's an AI Waybill (Database ID instead of 'JOB-XXX')
    if (!id.startsWith('JOB-')) {
      try {
        const waybill = await (this.prisma as any).waybill.findUnique({ where: { id: Number(id) } });
        if (waybill) {
          return await (this.prisma as any).waybill.update({
            where: { id: Number(id) },
            data: { status: 'DISPATCHED' } 
          });
        }
      } catch (e) {
        this.logger.error('Prisma update failed', e);
      }
    }

    // Legacy Fallback: Update the JSON file
    try {
      const raw = fs.readFileSync(this.jobsStorePath, 'utf-8');
      const jobs = JSON.parse(raw);
      const jobIndex = jobs.findIndex((j: any) => j.id === id);
      
      if (jobIndex > -1) {
        jobs[jobIndex].status = 'ASSIGNED';
        jobs[jobIndex].assignedDriverId = body.driverId;
        fs.writeFileSync(this.jobsStorePath, JSON.stringify(jobs, null, 2), 'utf-8');
        return jobs[jobIndex];
      }
    } catch (e) {
      this.logger.error('JSON update failed', e);
    }

    return { success: false, message: 'Job not found' };
  }

  async unassignJob(id: string) {
    if (!id.startsWith('JOB-')) {
      try {
        const waybill = await (this.prisma as any).waybill.findUnique({ where: { id: Number(id) } });
        if (waybill) {
          return await (this.prisma as any).waybill.update({
            where: { id: Number(id) },
            data: { status: 'REGISTERED' } 
          });
        }
      } catch (e) {}
    }

    try {
      const raw = fs.readFileSync(this.jobsStorePath, 'utf-8');
      const jobs = JSON.parse(raw);
      const jobIndex = jobs.findIndex((j: any) => j.id === id);
      
      if (jobIndex > -1) {
        jobs[jobIndex].status = 'UNASSIGNED';
        jobs[jobIndex].assignedDriverId = null;
        fs.writeFileSync(this.jobsStorePath, JSON.stringify(jobs, null, 2), 'utf-8');
        return jobs[jobIndex];
      }
    } catch (e) {}

    return { success: false };
  }
}
