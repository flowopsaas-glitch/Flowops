import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { BillingService } from '../billing/billing.service';
import { v4 as uuid } from 'uuid';

/**
 * Customer-facing white-label fields. Re-branding the public booking/tracking
 * portal (custom subdomain, brand name, logo, colours — i.e. removing FlowOps
 * identity from customer touchpoints) is an Enterprise capability. Basic in-app
 * branding (logoUrl, primaryColor, brandName) stays available to every tier.
 */
const WHITE_LABEL_FIELDS = [
  'portalSubdomain',
  'portalBrandName',
  'portalLogoUrl',
  'portalPrimaryColor',
] as const;

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private billing: BillingService,
  ) {}

  // ── Current tenant company ──────────────────────────────────────────

  async getMyCompany(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  async updateMyCompany(companyId: string, data: any) {
    // Strip write-protected fields
    const { id, createdAt, updatedAt, ...safe } = data;

    // Enforce white-label entitlement: block portal re-branding on plans that
    // don't include it (frontend also hides this, but it fails open on error).
    const touchesWhiteLabel = WHITE_LABEL_FIELDS.some(
      (f) => safe[f] !== undefined && safe[f] !== null && safe[f] !== '',
    );
    if (touchesWhiteLabel && !(await this.billing.hasFeature(companyId, 'whiteLabel'))) {
      throw new ForbiddenException(
        'White-label branding (custom portal domain & branding) is available on the Enterprise plan. Upgrade to unlock it.',
      );
    }

    return this.prisma.company.update({ where: { id: companyId }, data: safe });
  }

  async uploadLogo(companyId: string, file: Express.Multer.File) {
    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const key = `logos/${companyId}/${uuid()}.${ext}`;
    await this.storage.upload(key, file.buffer, file.mimetype);
    const logoUrl = this.storage.publicFileUrl(key);
    await this.prisma.company.update({ where: { id: companyId }, data: { logoUrl } });
    return { logoUrl };
  }

  async updateSla(
    companyId: string,
    dto: { slaWarningMinutes?: number; slaBreachMinutes?: number; slaEscalateMinutes?: number },
  ) {
    return this.prisma.company.update({ where: { id: companyId }, data: dto });
  }

  async addAdmin(companyId: string, dto: any) {
    // Create user with ADMIN role in this company
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(dto.password || uuid(), 12);
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        role: 'ADMIN',
        companyId,
      },
    });
  }

  // ── Owner-level: all companies ──────────────────────────────────────

  async findAll(query: { page?: number; limit?: number; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.company.count({ where }),
    ]);

    return { data: companies, total, page, limit };
  }

  async findOne(id: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id } });
  }

  async create(data: any) {
    // Set 14-day trial for new companies (starters)
    const trialStart = new Date();
    const trialEnd   = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);
    return this.prisma.company.create({
      data: {
        ...data,
        trialStartedAt: trialStart,
        trialEndsAt: data.plan === 'professional' || data.plan === 'enterprise' ? null : trialEnd,
      },
    });
  }

  async update(id: string, data: any) {
    const { id: _id, ...safe } = data;
    return this.prisma.company.update({ where: { id }, data: safe });
  }

  async platformOverview() {
    const [totalCompanies, activeCompanies, totalUsers, totalWaybills] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { isActive: true } }),
      this.prisma.user.count(),
      this.prisma.waybill.count(),
    ]);
    return { totalCompanies, activeCompanies, totalUsers, totalWaybills };
  }

  // ── Collections-state-sync (used by frontend collections panel) ───

  async getCollectionsSync(companyId: string) {
    const [total, pending, inProgress, collected] = await Promise.all([
      this.prisma.collection.count({ where: { companyId } }),
      this.prisma.collection.count({ where: { companyId, status: 'PENDING' } }),
      this.prisma.collection.count({ where: { companyId, status: 'IN_PROGRESS' } }),
      this.prisma.collection.count({ where: { companyId, status: 'COLLECTED' } }),
    ]);
    return { total, pending, inProgress, collected, syncedAt: new Date() };
  }
}
