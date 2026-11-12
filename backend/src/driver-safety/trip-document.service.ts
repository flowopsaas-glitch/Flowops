import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTripDocumentDto,
  DOCUMENT_TYPES,
  ORIGIN_STATUSES,
} from './dto/incident-document.dto';

/**
 * Trip document packs — HS codes, certificates of origin, duty estimates and
 * actuals, declaration references. The paperwork a cross-border trip is judged
 * on at a border post.
 *
 * DUTY_ESTIMATE and DUTY_ACTUAL are separate rows rather than two columns, for
 * the same reason trip-leg.service refuses to blend them: the estimate has to
 * survive the actual so the variance stays auditable.
 */

@Injectable()
export class TripDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, tripId?: string) {
    return this.prisma.withTenant(companyId, async (tx) => {
      const rows = await tx.tripDocument.findMany({
        where: { companyId, ...(tripId ? { tripId } : {}) },
        orderBy: [{ createdAt: 'desc' }],
        take: 300,
      });

      // The trip reference and the capturing user's name are resolved here
      // rather than through relations: a document is evidence and must not be
      // cascaded away when a trip is archived.
      const tripIds = [...new Set(rows.map((r) => r.tripId))];
      const userIds = [...new Set(rows.map((r) => r.capturedBy).filter(Boolean))] as string[];

      const trips = tripIds.length
        ? await tx.trip.findMany({
            where: { id: { in: tripIds } },
            select: { id: true, reference: true },
          })
        : [];
      const users = userIds.length
        ? await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : [];

      const reference = new Map(trips.map((t: any) => [t.id, t.reference ?? null]));
      const userName = new Map(users.map((u) => [u.id, u.name]));

      return rows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        tripId: r.tripId,
        tripReference: reference.get(r.tripId) ?? null,
        documentType: r.documentType,
        documentRef: r.documentRef,
        hsCode: r.hsCode,
        originStatus: r.originStatus,
        dutyEstimated: r.dutyEstimated,
        dutyActual: r.dutyActual,
        declarationRef: r.declarationRef,
        capturedBy: r.capturedBy,
        capturedByName: r.capturedBy ? (userName.get(r.capturedBy) ?? null) : null,
        capturedAt: r.capturedAt ? new Date(r.capturedAt).toISOString() : null,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
      }));
    });
  }

  async create(companyId: string, dto: CreateTripDocumentDto, user: any) {
    if (dto.hsCode != null && !/^\d{4,10}$/.test(dto.hsCode)) {
      throw new BadRequestException('hsCode must be 4-10 digits');
    }
    if (dto.originStatus && !(ORIGIN_STATUSES as readonly string[]).includes(dto.originStatus)) {
      throw new BadRequestException(`Unknown originStatus "${dto.originStatus}"`);
    }
    if (!(DOCUMENT_TYPES as readonly string[]).includes(dto.documentType)) {
      throw new BadRequestException(`Unknown documentType "${dto.documentType}"`);
    }

    return this.prisma.withTenant(companyId, async (tx) => {
      // The trip has to belong to this tenant, or a caller could hang documents
      // off another company's trip and read them back through this endpoint.
      const trip = await tx.trip.findFirst({ where: { id: dto.tripId, companyId }, select: { id: true } });
      if (!trip) throw new NotFoundException('Trip not found in this tenant');

      return tx.tripDocument.create({
        data: {
          companyId,
          tripId: dto.tripId,
          documentType: dto.documentType,
          documentRef: dto.documentRef ?? null,
          hsCode: dto.hsCode ?? null,
          originStatus: dto.originStatus ?? null,
          dutyEstimated: dto.dutyEstimated ?? null,
          dutyActual: dto.dutyActual ?? null,
          declarationRef: dto.declarationRef ?? null,
          capturedBy: user?.id ?? null,
          capturedAt: new Date(),
        },
      });
    });
  }
}
