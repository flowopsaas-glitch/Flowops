import { Injectable } from "@nestjs/common";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

type OwnerStore = {
  email: string;
  password: string;
};

type CreateTenantAdminBody = {
  email: string;
  password: string;
  role?: string;
};

type UpdateSubscriptionBody = {
  subscriptionPlan?: string;
  isActive?: boolean;
  monthlyPrice?: number | null;
  setupFee?: number | null;
  priceNotes?: string | null;
  enabledFeatures?: string[];
};

@Injectable()
export class OwnerService {

  private normalizeEmail(value: any): string {
    return String(value ?? "").trim().toLowerCase();
  }

  private async ensureUserLinkedToCompany(email: string, companyId: number) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail || !Number.isFinite(Number(companyId))) return null;

    const company = await (this.prisma as any).company.findUnique({
      where: { id: Number(companyId) },
      select: { id: true, name: true },
    });

    if (!company) {
      throw new Error(`Company ${companyId} not found while linking tenant admin.`);
    }

    const user = await (this.prisma as any).user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
      },
    });

    if (!user) {
      throw new Error(`User ${normalizedEmail} not found after tenant admin creation.`);
    }

    if (user.companyId !== Number(companyId)) {
      await (this.prisma as any).user.update({
        where: { id: user.id },
        data: { companyId: Number(companyId) },
      });
    }

    return {
      ok: true,
      userId: user.id,
      email: normalizedEmail,
      companyId: Number(companyId),
      companyName: company.name,
    };
  }


  private readonly dataDir = join(process.cwd(), "data");
  private readonly ownerFile = join(this.dataDir, "owner-superadmin-store.json");

  constructor(private readonly prisma: PrismaService) {}

  private ensureDataDir() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private readJson<T>(file: string, fallback: T): T {
    this.ensureDataDir();

    if (!existsSync(file)) {
      return fallback;
    }

    try {
      const raw = readFileSync(file, "utf-8").trim();
      if (!raw) {
        return fallback;
      }
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private writeJson(file: string, value: any) {
    this.ensureDataDir();
    writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
  }

  private getOwnerStore(): OwnerStore {
    return this.readJson<OwnerStore>(this.ownerFile, {
      email: "flowopsaas@gmail.com",
      password: "2026FlowOps!",
    });
  }

  private saveOwnerStore(value: OwnerStore) {
    this.writeJson(this.ownerFile, value);
  }


  private appendAudit(action: string, meta: Record<string, any> = {}) {
    const store = this.readJson<any>(this.ownerFile, {
      owner: {
        id: "flowops-owner",
        email: "flowopsaas@gmail.com",
        password: "2026FlowOps!",
        name: "FlowOps Owner",
      },
      audit: [],
    });

    const audit = Array.isArray(store?.audit) ? store.audit : [];

    audit.unshift({
      id: `audit-${Date.now()}`,
      action,
      meta,
      createdAt: new Date().toISOString(),
    });

    store.audit = audit.slice(0, 200);
    this.writeJson(this.ownerFile, store);
  }

  private getPlanPreset(planRaw: string) {
    const plan = String(planRaw || "STARTER").trim().toUpperCase();

    if (plan === "ENTERPRISE") {
      return {
        plan: "ENTERPRISE",
        monthlyPrice: 4999,
        setupFee: 2500,
        enabledFeatures: [
          "dashboard",
          "waybills",
          "collections",
          "dispatch",
          "pod",
          "billing",
          "invoice-drafts",
          "email",
          "whatsapp",
          "settings",
          "clients",
          "drivers",
          "reports",
          "ai-supervisor",
          "hardware-devices",
        ],
      };
    }

    if (plan === "PRO") {
      return {
        plan: "PRO",
        monthlyPrice: 2499,
        setupFee: 1200,
        enabledFeatures: [
          "dashboard",
          "waybills",
          "collections",
          "dispatch",
          "billing",
          "invoice-drafts",
          "email",
          "whatsapp",
          "settings",
          "clients",
          "drivers",
          "reports",
          "ai-supervisor",
        ],
      };
    }

    if (plan === "GROWTH") {
      return {
        plan: "GROWTH",
        monthlyPrice: 1299,
        setupFee: 750,
        enabledFeatures: [
          "dashboard",
          "waybills",
          "collections",
          "dispatch",
          "billing",
          "invoice-drafts",
          "email",
          "settings",
          "clients",
          "drivers",
        ],
      };
    }

    if (plan === "DEMO") {
      return {
        plan: "DEMO",
        monthlyPrice: 0,
        setupFee: 0,
        enabledFeatures: ["dashboard", "waybills", "collections", "DEMO_MODE"],
      };
    }

    return {
      plan: "STARTER",
      monthlyPrice: 699,
      setupFee: 350,
      enabledFeatures: [
        "dashboard",
        "waybills",
        "collections",
        "invoice-drafts",
        "settings",
        "clients",
      ],
    };
  }

  private buildPricingRisk(company: any) {
    const plan = String(company?.subscriptionPlan || "STARTER").toUpperCase();
    const monthlyPrice = company?.monthlyPrice ?? null;
    const userCount = Number(company?.userCount ?? company?._count?.users ?? 0);

    let risk = "LOW";
    const notes: string[] = [];

    if (monthlyPrice === null) {
      risk = "HIGH";
      notes.push("No monthly price has been set.");
    }

    if (plan === "STARTER" && userCount >= 4) {
      risk = "MEDIUM";
      notes.push("Starter tenant is growing and may be underpriced.");
    }



    if (plan === "PRO" && monthlyPrice !== null && Number(monthlyPrice) < 1800) {
      risk = "HIGH";
      notes.push("PRO tenant monthly price looks under market target.");
    }

    if (plan === "ENTERPRISE" && monthlyPrice !== null && Number(monthlyPrice) < 3500) {
      risk = "HIGH";
      notes.push("Enterprise tenant monthly price may be too low.");
    }

    if (!notes.length) {
      notes.push("Pricing profile looks acceptable.");
    }

    return {
      risk,
      notes,
    };
  }


  async getCompanies() {
    const companies = await (this.prisma as any).company.findMany({
      orderBy: { id: "asc" },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
    });

    return companies.map((company: any) => ({
      id: company.id,
      companyId: company.id,
      companyName: company.name || `Tenant ${company.id}`,
      email:
        company.users?.find((u: any) =>
          String(u.role || "").toUpperCase() === "COMPANY_ADMIN"
        )?.email ||
        company.email ||
        "",
      userCount: company._count?.users || 0,
      isActive: company.isActive ?? true,
      subscriptionPlan: company.subscriptionPlan || "STARTER",
      monthlyPrice: company.monthlyPrice ?? null,
      setupFee: company.setupFee ?? null,
      priceNotes: company.priceNotes ?? null,
      enabledFeatures: Array.isArray(company.enabledFeatures) ? company.enabledFeatures : [],
    }));
  }

  async getUsersByCompany(companyId: number) {
    return (this.prisma as any).user.findMany({
      where: { companyId: Number(companyId) },
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
        createdAt: true,
      },
    });
  }

  async resetTenantUserPassword(userId: number, password: string) {
    const safeUserId = Number(userId);
    const safePassword = String(password || "").trim();

    if (!safePassword || safePassword.length < 6) {
      return {
        ok: false,
        message: "Password must be at least 6 characters.",
      };
    }

    const existing = await (this.prisma as any).user.findUnique({
      where: { id: safeUserId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!existing) {
      return {
        ok: false,
        message: "User not found",
      };
    }

    const hashedPassword = await bcrypt.hash(safePassword, 10);

    await (this.prisma as any).user.update({
      where: { id: safeUserId },
      data: {
        password: hashedPassword,
      },
    });

    return {
      ok: true,
      message: "Tenant user password updated",
      userId: existing.id,
      email: existing.email || "",
    };
  }

  async createTenantAdmin(companyId: number, body: CreateTenantAdminBody) {
    const safeCompanyId = Number(companyId);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "").trim();
    const roleRaw = String(body?.role || "COMPANY_ADMIN").trim().toUpperCase();
    const role = roleRaw === "ADMIN" ? "ADMIN" : "COMPANY_ADMIN";

    if (!Number.isFinite(safeCompanyId) || safeCompanyId <= 0) {
      
    await this.ensureUserLinkedToCompany(email, companyId);

    return { ok: false, message: "Invalid company id." };
    }

    if (!email) {
      return { ok: false, message: "Admin email is required." };
    }

    if (!password || password.length < 6) {
      return { ok: false, message: "Password must be at least 6 characters." };
    }

    const company = await (this.prisma as any).company.findUnique({
      where: { id: safeCompanyId },
      select: { id: true, name: true },
    });

    if (!company) {
      return { ok: false, message: "Company not found." };
    }

    const existing = await (this.prisma as any).user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (existing) {
      return { ok: false, message: "A user with this email already exists." };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const created = await (this.prisma as any).user.create({
      data: {
        email,
        password: hashedPassword,
        role: role as any,
        companyId: safeCompanyId,
      },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
        createdAt: true,
      },
    });

    this.appendAudit("OWNER_CREATE_TENANT_ADMIN", {
      companyId: safeCompanyId,
      email,
      role,
    });

    return {
      ok: true,
      message: "Tenant admin created.",
      user: created,
    };
  }

  async updateCompanySubscription(companyId: number, body: UpdateSubscriptionBody) {
    const safeCompanyId = Number(companyId);

    if (!Number.isFinite(safeCompanyId) || safeCompanyId <= 0) {
      return { ok: false, message: "Invalid company id." };
    }

    const existing = await (this.prisma as any).company.findUnique({
      where: { id: safeCompanyId },
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        isActive: true,
        enabledFeatures: true,
      } as any,
    });

    if (!existing) {
      return { ok: false, message: "Company not found." };
    }

    const data: any = {};

    if (body.subscriptionPlan !== undefined) {
      data.subscriptionPlan = String(body.subscriptionPlan || "").trim().toUpperCase() || existing.subscriptionPlan;
    }

    if (body.isActive !== undefined) {
      data.isActive = !!body.isActive;
    }

    if (body.monthlyPrice !== undefined) {
      data.monthlyPrice = body.monthlyPrice === null || body.monthlyPrice === undefined ? null : Number(body.monthlyPrice);
    }

    if (body.setupFee !== undefined) {
      data.setupFee = body.setupFee === null || body.setupFee === undefined ? null : Number(body.setupFee);
    }

    if (body.priceNotes !== undefined) {
      data.priceNotes = String(body.priceNotes || "").trim() || null;
    }

    if (body.enabledFeatures !== undefined && Array.isArray(body.enabledFeatures)) {
      data.enabledFeatures = body.enabledFeatures.map((item) => String(item).trim()).filter(Boolean);
    }

    const updated = await (this.prisma as any).company.update({
      where: { id: safeCompanyId },
      data,
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        isActive: true,
        enabledFeatures: true,
      } as any,
    });

    this.appendAudit("OWNER_UPDATE_SUBSCRIPTION", {
      companyId: safeCompanyId,
      subscriptionPlan: updated.subscriptionPlan,
      isActive: updated.isActive,
      monthlyPrice: updated.monthlyPrice ?? null,
      setupFee: updated.setupFee ?? null,
    });

    return {
      ok: true,
      message: "Subscription updated.",
      company: updated,
      ai: this.buildSubscriptionAiSummary(updated),
      pricingRisk: this.buildPricingRisk(updated),
    };
  }

  async getCompanyAiSummary(companyId: number) {
    const safeCompanyId = Number(companyId);

    const company = await (this.prisma as any).company.findUnique({
      where: { id: safeCompanyId },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        _count: {
          select: {
            users: true,
            drivers: true,
            collections: true,
            invoicesAsBuyer: true,
          } as any,
        },
      },
    });

    if (!company) {
      return {
        ok: false,
        message: "Company not found.",
      };
    }

    return {
      ok: true,
      companyId: company.id,
      companyName: company.name,
      ai: this.buildSubscriptionAiSummary({
        ...company,
        userCount: company._count?.users || 0,
      }),
      metrics: {
        users: company._count?.users || 0,
        drivers: company._count?.drivers || 0,
        collections: company._count?.collections || 0,
        invoices: company._count?.invoicesAsBuyer || 0,
      },
    };
  }

  private buildSubscriptionAiSummary(company: any) {
    const plan = String(company?.subscriptionPlan || "STARTER").toUpperCase();
    const isActive = !!company?.isActive;
    const monthlyPrice = company?.monthlyPrice ?? null;
    const setupFee = company?.setupFee ?? null;
    const enabledFeatures = Array.isArray(company?.enabledFeatures) ? company.enabledFeatures : [];
    const userCount = Number(company?.userCount ?? company?._count?.users ?? 0);

    const alerts: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    if (!isActive) {
      alerts.push("Tenant is inactive. Review suspension, overdue billing, or demo status.");
      score -= 30;
    }

    if (plan === "STARTER" && userCount > 3) {
      alerts.push("Starter plan has growing user count. Upsell review recommended.");
      score -= 10;
      suggestions.push("Consider upgrading this tenant to PRO for scaling room.");
    }

    if (monthlyPrice === null || Number.isNaN(Number(monthlyPrice))) {
      alerts.push("Monthly price is not set.");
      score -= 20;
      suggestions.push("Set a monthly subscription price for clean billing control.");
    }

    if (setupFee === null || Number.isNaN(Number(setupFee))) {
      suggestions.push("Add a setup fee if onboarding/configuration work is billable.");
    }

    if (!enabledFeatures.length) {
      alerts.push("No enabled feature flags found.");
      score -= 10;
      suggestions.push("Review feature visibility and plan entitlements.");
    }

    if (plan === "PRO" && enabledFeatures.length < 4) {
      suggestions.push("PRO plan has limited enabled features. Review packaging consistency.");
    }

    if (!alerts.length) {
      alerts.push("Tenant subscription health looks stable.");
    }

    if (!suggestions.length) {
      suggestions.push("No urgent action needed. Monitor tenant growth and billing alignment.");
    }

    return {
      score: Math.max(0, score),
      status:
        score >= 85 ? "HEALTHY" :
        score >= 65 ? "WATCH" :
        "ACTION_NEEDED",
      alerts,
      suggestions,
      snapshot: {
        plan,
        isActive,
        monthlyPrice,
        setupFee,
        enabledFeaturesCount: enabledFeatures.length,
        userCount,
      },
    };
  }

  
  async toggleUserActive(userId: number, isActive: boolean) {
    return {
      ok: false,
      message: "User suspend/activate is not supported yet because the User model has no isActive field.",
      userId: Number(userId),
      requestedState: !!isActive,
    };
  }

  async deleteUser(userId: number) {
    const existing = await (this.prisma as any).user.findUnique({
      where: { id: Number(userId) },
      select: { id: true, email: true, companyId: true },
    });

    await (this.prisma as any).user.delete({
      where: { id: Number(userId) },
    });

    this.appendAudit("OWNER_DELETE_USER", {
      userId: Number(userId),
      email: existing?.email || "",
      companyId: existing?.companyId || null,
    });

    return { ok: true, message: "User deleted" };
  }

  async toggleDemoMode(companyId: number, enabled: boolean) {
    const features = enabled ? ["DEMO_MODE"] : [];

    await (this.prisma as any).company.update({
      where: { id: Number(companyId) },
      data: { enabledFeatures: features },
    });

    this.appendAudit("OWNER_TOGGLE_DEMO_MODE", {
      companyId: Number(companyId),
      enabled: !!enabled,
    });

    return { ok: true, message: enabled ? "Demo enabled" : "Demo disabled" };
  }

  getRecommendedPlan(company: any) {
    const users = company?.userCount || 0;

    if (users <= 2) return "STARTER";
    if (users <= 5) return "GROWTH";
    if (users <= 15) return "PRO";
    return "ENTERPRISE";
  }


  async applyPlanPreset(companyId: number, planRaw: string) {
    const safeCompanyId = Number(companyId);
    const preset = this.getPlanPreset(planRaw);

    const updated = await (this.prisma as any).company.update({
      where: { id: safeCompanyId },
      data: {
        subscriptionPlan: preset.plan,
        enabledFeatures: preset.enabledFeatures,
        isActive: true,
      } as any,
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        isActive: true,
        enabledFeatures: true,
      } as any,
    });

    this.appendAudit("OWNER_APPLY_PLAN_PRESET", {
      companyId: safeCompanyId,
      companyName: updated.name,
      plan: preset.plan,
      monthlyPrice: preset.monthlyPrice,
      setupFee: preset.setupFee,
    });

    return {
      ok: true,
      message: "Plan preset applied.",
      company: updated,
      preset,
      ai: this.buildSubscriptionAiSummary(updated),
      pricingRisk: this.buildPricingRisk(updated),
    };
  }

  async getAutoFillSuggestion(companyId: number) {
    const company = await (this.prisma as any).company.findUnique({
      where: { id: Number(companyId) },
      include: {
        _count: { select: { users: true, drivers: true, collections: true, invoicesAsBuyer: true } } as any,
      },
    });

    if (!company) {
      return { ok: false, message: "Company not found." };
    }

    const recommendedPlan = this.getRecommendedPlan({
      userCount: (company as any)?._count?.users || 0,
    });

    const preset = this.getPlanPreset(recommendedPlan);

    return {
      ok: true,
      recommendedPlan,
      preset,
      pricingRisk: this.buildPricingRisk({
        ...company,
        userCount: (company as any)?._count?.users || 0,
      }),
      reason: "Auto-filled from tenant size, user growth, and pricing guardrails.",
    };
  }

  async getTenantHealthOverview() {
    const companies = await (this.prisma as any).company.findMany({
      orderBy: { id: "asc" },
      include: {
        _count: {
          select: {
            users: true,
            drivers: true,
            collections: true,
            invoicesAsBuyer: true,
          } as any,
        },
      },
    });

    const rows = companies.map((company: any) => {
      const ai = this.buildSubscriptionAiSummary({
        ...company,
        userCount: (company as any)?._count?.users || 0,
      });

      return {
        companyId: company.id,
        companyName: company.name,
        plan: company.subscriptionPlan || "STARTER",
        isActive: company.isActive ?? true,
        aiStatus: ai.status,
        aiScore: ai.score,
        users: company?._count?.users || 0,
        drivers: company?._count?.drivers || 0,
        collections: company?._count?.collections || 0,
        invoices: company?._count?.invoicesAsBuyer || 0,
        pricingRisk: this.buildPricingRisk({
          ...company,
          userCount: (company as any)?._count?.users || 0,
        }),
      };
    });

    return {
      ok: true,
      totalTenants: rows.length,
      actionNeeded: rows.filter((r: any) => r.aiStatus === "ACTION_NEEDED").length,
      watchList: rows.filter((r: any) => r.aiStatus === "WATCH").length,
      rows,
    };
  }

  getAuditTimeline() {
    const store = this.readJson<any>(this.ownerFile, { audit: [] });
    return {
      ok: true,
      items: Array.isArray(store?.audit) ? store.audit : [],
    };
  }

  async getPlanRecommendation(companyId: number) {
    const company = await (this.prisma as any).company.findUnique({
      where: { id: Number(companyId) },
      include: { _count: { select: { users: true } } },
    });

    const recommended = this.getRecommendedPlan({
      userCount: (company as any)?._count?.users || 0,
    });

    return {
      ok: true,
      recommendedPlan: recommended,
      reason: "Based on tenant user growth and scaling pattern.",
    };
  }

  changeOwnerPassword(password: string) {

    const owner = this.getOwnerStore();
    owner.password = String(password || "").trim() || owner.password;
    this.saveOwnerStore(owner);

    return {
      ok: true,
      message: "Owner password updated",
      email: owner.email,
    };
  }
}
