import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 🎨 BRANDING SERVICE - White-Label customization
 *
 * Enables SaaS model with custom:
 * - Logo & company colors
 * - Custom domain
 * - Email domain
 * - Terms/Privacy URLs
 * - CSS injection for frontend
 *
 * Feature Gate: ENTERPRISE tier only
 */
@Injectable()
export class BrandingService {
  private readonly logger = new Logger('BrandingService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get branding config for company
   */
  async getBrandingConfig(companyId: number): Promise<any> {
    try {
      const company = await (this.prisma as any).company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          brandingConfig: true,
          emailDomain: true,
        },
      });

      if (!company) {
        return this.getDefaultBranding();
      }

      const branding = company.brandingConfig
        ? typeof company.brandingConfig === 'string'
          ? JSON.parse(company.brandingConfig)
          : company.brandingConfig
        : {};

      return {
        companyId: company.id,
        companyName: company.name,
        logoUrl: branding.logoUrl || null,
        primaryColor: branding.primaryColor || '#0066cc',
        secondaryColor: branding.secondaryColor || '#00cc66',
        customDomain: branding.customDomain || null,
        emailDomain: company.emailDomain || null,
        termsUrl: branding.termsUrl || null,
        privacyUrl: branding.privacyUrl || null,
      };
    } catch (err: any) {
      this.logger.error(`Failed to get branding config: ${err.message}`);
      return this.getDefaultBranding();
    }
  }

  /**
   * Update branding config for company
   */
  async updateBranding(
    companyId: number,
    branding: {
      logoUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      customDomain?: string;
      termsUrl?: string;
      privacyUrl?: string;
    },
  ): Promise<boolean> {
    try {
      // Validate colors
      if (branding.primaryColor && !this.isValidColor(branding.primaryColor)) {
        throw new Error('Invalid primary color format');
      }

      if (branding.secondaryColor && !this.isValidColor(branding.secondaryColor)) {
        throw new Error('Invalid secondary color format');
      }

      // Validate URLs
      if (branding.logoUrl && !this.isValidUrl(branding.logoUrl)) {
        throw new Error('Invalid logo URL');
      }

      if (branding.termsUrl && !this.isValidUrl(branding.termsUrl)) {
        throw new Error('Invalid terms URL');
      }

      if (branding.privacyUrl && !this.isValidUrl(branding.privacyUrl)) {
        throw new Error('Invalid privacy URL');
      }

      // Update in database
      await (this.prisma as any).company.update({
        where: { id: companyId },
        data: {
          brandingConfig: JSON.stringify(branding),
        },
      });

      this.logger.log(`✅ Branding updated for company ${companyId}`);

      return true;
    } catch (err: any) {
      this.logger.error(`Failed to update branding: ${err.message}`);
      throw err;
    }
  }

  /**
   * Generate CSS variables for frontend injection
   * Output: CSS custom properties for theme
   */
  async injectBrandingCSS(companyId: number): Promise<string> {
    try {
      const branding = await this.getBrandingConfig(companyId);

      const css = `
:root {
  --brand-primary: ${branding.primaryColor};
  --brand-secondary: ${branding.secondaryColor};
  --brand-logo-url: url('${branding.logoUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzAwNjZjYyIvPjwvc3ZnPg=='}');
}

.navbar {
  background-color: var(--brand-primary);
  color: white;
}

.button-primary {
  background-color: var(--brand-primary);
  color: white;
}

.button-secondary {
  background-color: var(--brand-secondary);
  color: white;
}

.logo {
  background-image: var(--brand-logo-url);
  background-size: contain;
  background-repeat: no-repeat;
}
`;

      return css;
    } catch (err: any) {
      this.logger.error(`Failed to inject branding CSS: ${err.message}`);
      return '';
    }
  }

  /**
   * Resolve company from custom domain
   * Used in auth middleware to identify company
   */
  async resolveCompanyFromDomain(domain: string): Promise<any | null> {
    try {
      // Remove port from domain
      const cleanDomain = domain.split(':')[0];

      // Look up company by custom domain
      const companies = await (this.prisma as any).company.findMany({
        where: {
          brandingConfig: {
            contains: cleanDomain,
          },
        },
        select: {
          id: true,
          name: true,
          brandingConfig: true,
        },
      });

      for (const company of companies) {
        const branding = JSON.parse(company.brandingConfig || '{}');
        if (branding.customDomain === cleanDomain) {
          return company;
        }
      }

      return null;
    } catch (err: any) {
      this.logger.error(`Failed to resolve company from domain: ${err.message}`);
      return null;
    }
  }

  /**
   * Get default branding (FlowOps branding)
   */
  private getDefaultBranding() {
    return {
      companyId: null,
      companyName: 'FlowOps',
      logoUrl: null,
      primaryColor: '#0066cc',
      secondaryColor: '#00cc66',
      customDomain: null,
      emailDomain: null,
      termsUrl: null,
      privacyUrl: null,
    };
  }

  /**
   * Validate hex color format
   */
  private isValidColor(color: string): boolean {
    return /^#[0-9A-F]{6}$/i.test(color) || /^rgb\(\d+,\s*\d+,\s*\d+\)$/.test(color);
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
