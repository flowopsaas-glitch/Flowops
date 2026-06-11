// src/companies/companies.service.ts
import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Type definitions for request DTOs
export type CreateTenantDto = {
  name: string;
  email?: string;
  phone?: string;
};

export type UpdateTenantSettingsDto = {
  name?: string;
};

export type UpdateSubscriptionDto = {
  plan: string;
  status: string;
  monthlyPrice: number;
  demoEnabled?: boolean;
  demoExpiresAt?: string;
};

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger('CompaniesService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ✅ PUBLIC GETTER: Allow controllers to access prisma for custom queries
   */
  getPrisma() {
    return this.prisma;
  }

  /**
   * Get all companies for listing (requires auth in controller)
   */
  async findAll() {
    try {
      const result = await this.prisma.company.findMany({
        orderBy: { name: 'asc' as const },
        select: {
          id: true,
          name: true,
          status: true,
          plan: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        }
      });
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to fetch companies: ${error?.message}`, error?.stack);
      throw new BadRequestException('Failed to retrieve companies');
    }
  }

  /**
   * Get all companies with full subscription details for Owner Dashboard
   */
  async getAllWithSubscriptionDetails() {
    try {
      const companies = await this.prisma.company.findMany({
        orderBy: { name: 'asc' as const },
        select: {
          id: true,
          name: true,
          status: true,
          plan: true,
          isActive: true,
          monthlyPrice: true,
          baseTierPrice: true,
          perUserPrice: true,
          pricePerWhatsapp: true,
          pricePerEmail: true,
          demoEnabled: true,
          demoExpiresAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { users: true }
          }
        }
      });
      return companies;
    } catch (error: any) {
      this.logger.error(`Failed to fetch companies with subscriptions: ${error?.message}`, error?.stack);
      throw new BadRequestException('Failed to retrieve company subscription details');
    }
  }

  /**
   * Update company subscription/plan
   */
  async updateSubscription(companyId: number, dto: UpdateSubscriptionDto) {
    try {
      // Verify company exists
      const existing = await this.prisma.company.findUnique({ where: { id: companyId }});
      if (!existing) {
        throw new NotFoundException(`Company with ID ${companyId} not found`);
      }

      const updated = await this.prisma.company.update({
        where: { id: companyId },
        data: {
          plan: dto.plan as any,
          status: dto.status,
          monthlyPrice: dto.monthlyPrice,
          demoEnabled: dto.demoEnabled,
          demoExpiresAt: dto.demoExpiresAt ? new Date(dto.demoExpiresAt) : undefined,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`Updated subscription for company ${companyId}: ${dto.plan} | ZAR ${dto.monthlyPrice}`);
      return updated;
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to update subscription for company ${companyId}: ${error?.message}`, error?.stack);
      throw new BadRequestException('Failed to update subscription');
    }
  }

  /**
   * Get tenant-specific settings (for authenticated tenant users)
   */
  async getTenantSettings(companyId: number) {
    try {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { 
          id: true, 
          name: true, 
          status: true, 
          plan: true, 
          isActive: true,
          monthlyPrice: true,
          demoEnabled: true,
        },
      });
      if (!company) throw new NotFoundException("Tenant not found");
      return company;
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to fetch tenant settings: ${error?.message}`, error?.stack);
      throw new BadRequestException('Failed to retrieve tenant settings');
    }
  }

  /**
   * Update tenant settings (name only for now)
   */
  async updateTenantSettings(companyId: number, dto: UpdateTenantSettingsDto) {
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('Company name is required');
      }

      const updated = await this.prisma.company.update({
        where: { id: companyId },
        data: { 
          name: dto.name.trim(),
          updatedAt: new Date(),
        },
      });
      return updated;
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to update tenant settings: ${error?.message}`, error?.stack);
      throw new BadRequestException('Failed to update tenant settings');
    }
  }

  /**
   * Create a new tenant company
   */
  async createTenant(dto: CreateTenantDto) {
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('Company name is required');
      }

      const company = await this.prisma.company.create({ 
        data: { 
          name: dto.name.trim(),
          // Default values for new tenants
          status: 'Active',
          plan: 'STARTER',
          isActive: true,
          baseTierPrice: 0,
          perUserPrice: 0,
          pricePerWhatsapp: 0.80,
          pricePerEmail: 0.10,
        } 
      });

      this.logger.log(`Created new tenant: ${company.name} (ID: ${company.id})`);
      return company;
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Failed to create tenant: ${error?.message}`, error?.stack);
      throw new BadRequestException('Failed to create tenant company');
    }
  }

  /**
   * Get platform-wide statistics for Super Admin dashboard
   */
  async getPlatformOverview() {
    try {
      const [totalCompanies, activeCompanies, totalUsers] = await Promise.all([
        this.prisma.company.count(),
        this.prisma.company.count({ where: { isActive: true } }),
        this.prisma.user.count(),
      ]);

      return {
        totalCompanies,
        activeCompanies,
        inactiveCompanies: totalCompanies - activeCompanies,
        totalUsers,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to fetch platform overview: ${error?.message}`, error?.stack);
      throw new BadRequestException('Failed to retrieve platform statistics');
    }
  }
}
