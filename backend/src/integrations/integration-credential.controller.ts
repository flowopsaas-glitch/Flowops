import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { BillingService } from '../billing/billing.service';
import {
  IntegrationCredentialService,
  PROVIDERS,
  ProviderId,
} from './integration-credential.service';

const ADMIN_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER];

/**
 * Tenant self-service connection manager. Lets a company admin connect their OWN
 * WhatsApp Business number and Shopify/WooCommerce stores from the UI — replacing
 * the old per-install env-var configuration. Secrets are write-only (masked on
 * read). Each provider is gated by the plan feature it belongs to.
 */
@ApiTags('Integration Connections')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN)
@Controller('integrations/connections')
export class IntegrationCredentialController {
  constructor(
    private readonly svc: IntegrationCredentialService,
    private readonly billing: BillingService,
  ) {}

  @Get()
  @Roles(...ADMIN_ROLES)
  async list(@CurrentUser() u: any) {
    return {
      encryptionReady: this.svc.encryptionReady,
      connections: await this.svc.list(u.companyId),
    };
  }

  @Get(':provider')
  @Roles(...ADMIN_ROLES)
  async get(@CurrentUser() u: any, @Param('provider') provider: string) {
    const p = this.assertProvider(provider);
    return this.svc.getMasked(u.companyId, p);
  }

  @Put(':provider')
  @Roles(...ADMIN_ROLES)
  async upsert(
    @CurrentUser() u: any,
    @Param('provider') provider: string,
    @Body() body: Record<string, any>,
  ) {
    const p = this.assertProvider(provider);
    await this.assertFeature(u.companyId, p);
    return this.svc.upsert(u.companyId, u.id ?? null, p, body ?? {});
  }

  @Delete(':provider')
  @Roles(...ADMIN_ROLES)
  async remove(@CurrentUser() u: any, @Param('provider') provider: string) {
    const p = this.assertProvider(provider);
    return this.svc.remove(u.companyId, p);
  }

  private assertProvider(provider: string): ProviderId {
    if (!(provider in PROVIDERS)) {
      throw new ForbiddenException(`Unknown integration provider: ${provider}`);
    }
    return provider as ProviderId;
  }

  /** Gate by the plan feature the provider belongs to (whatsapp | ecommerce). */
  private async assertFeature(companyId: string, provider: ProviderId) {
    const feature = this.svc.featureFor(provider);
    if (!(await this.billing.hasFeature(companyId, feature))) {
      const label = feature === 'whatsapp' ? 'The WhatsApp Hub' : 'E-commerce store connectors';
      throw new ForbiddenException(
        `${label} is available on the Professional plan. Upgrade to connect ${provider}.`,
      );
    }
  }
}
