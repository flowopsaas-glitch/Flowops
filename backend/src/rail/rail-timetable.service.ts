import { createHash } from 'crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { parseRailScheduleBatches } from './rail-timetable.parser';

const INSERT_BATCH_SIZE = 1_000;

@Injectable()
export class RailTimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException(
        'Rail & Intermodal is an Enterprise feature. Upgrade your plan to import timetables.',
      );
    }
  }

  async importFile(
    companyId: string,
    actorId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    await this.assertEntitled(companyId);
    return this.persistImport(companyId, companyId, actorId, 'tenant', file);
  }

  async importSharedFile(
    actorId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    return this.persistImport(null, 'shared-transnet', actorId, 'owner', file);
  }

  private async persistImport(
    companyId: string | null,
    scopeKey: string,
    actorId: string,
    actorType: 'tenant' | 'owner',
    file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('No valid timetable file provided');
    }
    if (file.buffer.length > 25 * 1024 * 1024) {
      throw new BadRequestException('Timetable file cannot exceed 25 MB');
    }
    const originalName = typeof file.originalname === 'string' ? file.originalname : '';
    const sourceName = originalName.split(/[\\/]/).pop()?.slice(0, 255);
    if (!sourceName || !/\.(txt|tsv)$/i.test(sourceName)) {
      throw new BadRequestException('Upload a .txt or .tsv tab-separated timetable file');
    }
    const mimeType = String(file.mimetype ?? '').toLowerCase().split(';', 1)[0].trim();
    if (!['text/plain', 'text/tab-separated-values', 'text/tsv', 'application/vnd.ms-excel', 'application/octet-stream'].includes(mimeType)) {
      throw new BadRequestException('Timetable uploads must be plain text or tab-separated values');
    }

    const sourceHash = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.prisma.railScheduleImport.findFirst({
      where: { scopeKey, sourceHash },
      select: { id: true },
    });
    if (existing) throw new ConflictException('This timetable file has already been published or imported');

    let scheduleImport;
    try {
      scheduleImport = await this.prisma.withTenant(companyId, async (tx) => {
        const created = await tx.railScheduleImport.create({
          data: {
            companyId,
            scopeKey,
            sourceName,
            sourceHash,
            rowCount: 0,
            importedBy: actorId,
          },
        });
        let rowCount = 0;
        for (const batch of parseRailScheduleBatches(file.buffer, INSERT_BATCH_SIZE)) {
          rowCount += batch.length;
          await tx.railScheduleRow.createMany({
            data: batch.map((row) => ({
              ...row,
              companyId,
              importId: created.id,
            })),
          });
        }
        await tx.railScheduleImport.update({ where: { id: created.id }, data: { rowCount } });
        return { ...created, rowCount };
      }, { maxWait: 10_000, timeout: 180_000 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This timetable file has already been imported');
      }
      throw error;
    }

    await this.audit.record({
      action: actorType === 'owner' ? 'rail.timetable.shared_published' : 'rail.timetable.imported',
      actorType,
      actorId,
      targetType: 'rail_schedule_import',
      targetId: scheduleImport.id,
      targetName: sourceName,
      metadata: { companyId, scopeKey, rowCount: scheduleImport.rowCount, sourceHash },
    });
    return scheduleImport;
  }

  async listSharedImports() {
    return this.prisma.railScheduleImport.findMany({
      where: { companyId: null },
      orderBy: { importedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        sourceName: true,
        rowCount: true,
        importedBy: true,
        importedAt: true,
        companyId: true,
      },
    });
  }

  async listImports(companyId: string) {
    await this.assertEntitled(companyId);
    return this.prisma.railScheduleImport.findMany({
      where: { OR: [{ companyId }, { companyId: null }] },
      orderBy: { importedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        sourceName: true,
        rowCount: true,
        importedBy: true,
        importedAt: true,
        companyId: true,
      },
    });
  }

  async listRows(
    companyId: string,
    importId: string,
    filters: { origin?: string; train?: string; corridor?: string; q?: string; page?: string; limit?: string },
  ) {
    await this.assertEntitled(companyId);
    const scheduleImport = await this.prisma.railScheduleImport.findFirst({
      where: { id: importId, OR: [{ companyId }, { companyId: null }] },
      select: { id: true, companyId: true },
    });
    if (!scheduleImport) throw new NotFoundException('Timetable import not found');

    const page = this.parsePositiveInteger(filters.page, 1, 'page');
    const limit = this.parsePositiveInteger(filters.limit, 100, 'limit');
    if (limit > 500) throw new BadRequestException('limit cannot exceed 500');
    if (!companyId) {
      throw new ForbiddenException('A tenant company is required to access timetable rows');
    }
    const where: Prisma.RailScheduleRowWhereInput = {
      importId,
      // Tenant uploads are visible only to their owner; shared imports are
      // visible to every entitled tenant and retain companyId = null.
      companyId: scheduleImport.companyId,
    };
    if (filters.origin) where.origin = { equals: filters.origin, mode: 'insensitive' };
    if (filters.train) where.train = filters.train;
    if (filters.corridor) where.corridor = { equals: filters.corridor, mode: 'insensitive' };
    if (filters.q) {
      where.AND = [{
        OR: [
          { origin: { contains: filters.q, mode: 'insensitive' } },
          { train: { contains: filters.q, mode: 'insensitive' } },
          { corridor: { contains: filters.q, mode: 'insensitive' } },
          { station: { contains: filters.q, mode: 'insensitive' } },
          { destination: { contains: filters.q, mode: 'insensitive' } },
        ],
      }];
    }

    const [data, total] = await Promise.all([
      this.prisma.railScheduleRow.findMany({
        where,
        orderBy: { sourceRow: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.railScheduleRow.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  private parsePositiveInteger(value: string | undefined, defaultValue: number, name: string): number {
    if (value === undefined) return defaultValue;
    if (!/^[1-9]\d*$/.test(value)) {
      throw new BadRequestException(`${name} must be a positive integer`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new BadRequestException(`${name} is outside the supported range`);
    }
    return parsed;
  }
}
