import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PRODUCTION FIX (2026-10-07):
 * Rail Timetable Service — Tenant-Scoped
 * 
 * CRITICAL CHANGES:
 * 1. Every query is explicitly tenant-scoped with companyId in WHERE
 * 2. No path overwrites or nulls out companyId
 * 3. Import/parse returns rows tagged with companyId
 * 4. List/get operations only return this tenant's rows
 */

@Injectable()
export class RailTimetableService {
  private readonly logger = new Logger('RAIL_TIMETABLE');

  constructor(private prisma: PrismaService) {}

  /**
   * Import and parse timetable CSV.
   * Returns only rows for this tenant; never leaks across tenants.
   */
  async importTimetable(
    companyId: string,
    csvContent: string,
    metadata?: Record<string, any>,
  ): Promise<{ imported: number; rows: any[] }> {
    // Parse CSV
    const rows = this.parseCsv(csvContent);

    // Tag each row with companyId and insert
    const results = [];
    for (const row of rows) {
      try {
        const created = await this.prisma.railTimetable.create({
          data: {
            companyId, // CRITICAL: Never left null or overwritten
            scheduleDate: new Date(row.scheduleDate),
            corridor: row.corridor,
            departureTime: row.departureTime,
            arrivalTime: row.arrivalTime,
            trainNumber: row.trainNumber || null,
            operator: row.operator || null,
            capacity: row.capacity ? parseInt(row.capacity, 10) : null,
            notes: row.notes || null,
            source: 'IMPORT',
            metadata: metadata || {},
          },
        });
        results.push(created);
      } catch (err: any) {
        this.logger.warn(`Failed to import timetable row for ${companyId}: ${err?.message}`);
      }
    }

    return { imported: results.length, rows: results };
  }

  /**
   * List timetables for this tenant only.
   * CRITICAL: Always filtered by companyId.
   */
  async list(
    companyId: string,
    filters?: { corridor?: string; from?: Date; to?: Date },
  ): Promise<any[]> {
    const where: any = {
      companyId, // CRITICAL SCOPING: Tenant isolation
    };

    if (filters?.corridor) where.corridor = filters.corridor;
    if (filters?.from || filters?.to) {
      where.scheduleDate = {};
      if (filters.from) where.scheduleDate.gte = filters.from;
      if (filters.to) where.scheduleDate.lte = filters.to;
    }

    return this.prisma.railTimetable.findMany({
      where,
      orderBy: { scheduleDate: 'asc' },
      take: 1000,
    });
  }

  /**
   * Get a single timetable entry (guard against cross-tenant access).
   */
  async get(companyId: string, id: string): Promise<any> {
    const entry = await this.prisma.railTimetable.findUnique({
      where: { id },
    });

    if (!entry) {
      throw new Error('Timetable entry not found');
    }

    // CRITICAL: Reject if company doesn't match
    if (entry.companyId !== companyId) {
      throw new ForbiddenException(
        'You do not have access to this timetable entry (company mismatch)',
      );
    }

    return entry;
  }

  private parseCsv(content: string): any[] {
    const lines = content.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || null;
      });
      rows.push(row);
    }

    return rows;
  }
}
