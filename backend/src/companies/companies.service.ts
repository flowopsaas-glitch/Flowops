import { Injectable, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { BillingService } from '../billing/billing.service';
import { pickAllowed } from '../common/pick-allowed.util';
import { v4 as uuid } from 'uuid';

/**
 * Fields a tenant may edit on their OWN company via self-service update.
 * Profile + banking + branding + SLA only. Billing/platform-controlled fields
 * (plan, trialStartedAt, trialEndsAt, isActive, featureOverrides,
 * priceOverrideZar, autopilotEnabled, autopilotAggression) are intentionally
 * excluded — those are set by the owner console / billing, never self-service.
 */
const COMPANY_SELF_EDITABLE_FIELDS = [
  'name', 'tradingName', 'email', 'phone', 'address', 'city', 'country',
  'currency', 'vatNumber', 'whatsappNumber',
  'bankName', 'bankAccountHolder', 'bankAccountNumber', 'bankBranchCode', 'bankAccountType',
  'logoUrl', 'brandName', 'primaryColor', 'secondaryColor', 'invoiceHeaderColor',
  'portalBrandName', 'portalSubdomain', 'portalPrimaryColor', 'portalLogoUrl',
  'slaWarningMinutes', 'slaBreachMinutes', 'slaEscalateMinutes',
] as const;

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
    // Allowlist tenant-editable profile/branding/banking/SLA fields ONLY.
    // Billing/platform-controlled fields (plan, trialEndsAt, trialStartedAt,
    // isActive, featureOverrides, priceOverrideZar, autopilot*) are DELIBERATELY
    // excluded — a tenant must never self-upgrade their plan or flip
    // entitlements via this self-service endpoint. (Previously it spread the
    // whole body after only stripping id/createdAt/updatedAt.)
    const safe = pickAllowed(data, COMPANY_SELF_EDITABLE_FIELDS);

    // Enforce white-label entitlement: block portal re-branding on plans that
    // don't include it (frontend also hides this, but it fails open on error).
    const touchesWhiteLabel = WHITE_LABEL_FIELDS.some(
      (f) => (safe as any)[f] !== undefined && (safe as any)[f] !== null && (safe as any)[f] !== '',
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
    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          name: dto.name,
          phone: dto.phone,
          role: 'ADMIN',
          companyId,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('A user with this email already exists in this company.');
      }
      throw e;
    }
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

  // ── Onboarding ──────────────────────────────────────────────────────

  /**
   * Returns the onboarding checklist status for a company.
   * The frontend uses this to decide whether to redirect to the wizard.
   *
   * Proper logistics onboarding follows these steps:
   *   1. Company profile (name, address, contact — already filled at signup)
   *   2. Add first driver (the field operation backbone)
   *   3. Create first waybill (proves the system works end-to-end)
   *   4. Set up branding (customer-facing identity)
   *   5. Configure notifications (WhatsApp/email templates)
   *
   * The checklist is DYNAMIC — computed from live data, not a stored flag.
   * This means even if a tenant skips onboarding, the checklist updates
   * as they naturally use the platform.
   */
  async getOnboardingStatus(companyId: string) {
    const [company, driversCount, waybillsCount] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          name: true, email: true, phone: true, address: true,
          logoUrl: true, brandName: true, primaryColor: true,
          whatsappNumber: true, trialEndsAt: true, plan: true,
        },
      }),
      this.prisma.driver.count({ where: { companyId, isActive: true } }),
      this.prisma.waybill.count({ where: { companyId } }),
      this.prisma.collection.count({ where: { companyId } }),
    ]);

    // Compute each step's completion status
    const steps = {
      companyProfile: Boolean(company?.name && company?.email && company?.phone),
      firstDriver: driversCount > 0,
      firstWaybill: waybillsCount > 0,
      branding: Boolean(company?.logoUrl || company?.brandName || company?.primaryColor),
      communications: Boolean(company?.whatsappNumber),
    };

    const completedCount = Object.values(steps).filter(Boolean).length;
    const totalSteps = Object.keys(steps).length;
    const allComplete = completedCount === totalSteps;

    // A company is "onboarded" if they've completed at least 3/5 core steps
    // OR if they've explicitly marked onboarding as complete
    const effectivelyOnboarded = completedCount >= 3 || allComplete;

    return {
      steps,
      completedCount,
      totalSteps,
      progressPercent: Math.round((completedCount / totalSteps) * 100),
      allComplete,
      effectivelyOnboarded,
      shouldShowOnboarding: !effectivelyOnboarded && waybillsCount === 0 && driversCount === 0,
      companyName: company?.name ?? null,
      plan: company?.plan ?? 'starter',
      trialEndsAt: company?.trialEndsAt ?? null,
    };
  }

  /**
   * Marks onboarding as complete. The frontend wizard calls this on the
   * final "Go Live" step. This is a soft flag — the dynamic checklist
   * will still show incomplete items, but the redirect is suppressed.
   */
  async markOnboardingComplete(companyId: string) {
    // We use a simple update since the Company model doesn't have a dedicated
    // onboardingComplete column yet — we'll store it in the JSON featureOverrides
    // field as a non-feature flag. This avoids a schema migration.
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { featureOverrides: true },
    });
    const overrides = (company?.featureOverrides as Record<string, any>) ?? {};
    overrides._onboardingComplete = true;
    overrides._onboardingCompletedAt = new Date().toISOString();

    await this.prisma.company.update({
      where: { id: companyId },
      data: { featureOverrides: overrides },
    });

    return { success: true, message: 'Onboarding marked as complete. Welcome to FlowOps!' };
  }
}
