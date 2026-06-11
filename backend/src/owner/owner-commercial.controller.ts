import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OwnerCommercialService } from './owner-commercial.service';
import {
  OwnerTenantCommercialNoteBody,
  OwnerTenantInvoiceBody,
  OwnerTenantQuoteBody,
  OwnerTenantStatusBody,
  OwnerTenantSubscriptionOverrideBody,
} from './owner-commercial.types';
import { OwnerGuard } from './owner.guard';

@Controller('owner')
@UseGuards(OwnerGuard)
export class OwnerCommercialController {
  constructor(
    private readonly ownerCommercialService: OwnerCommercialService,
  ) {}

  @Get('tenants/:tenantId/commercial')
  async getTenantCommercialState(
    @Param('tenantId') tenantId: string,
  ) {
    return this.ownerCommercialService.getTenantCommercialState(tenantId);
  }

  @Post('tenants/:tenantId/status')
  async setTenantStatus(
    @Param('tenantId') tenantId: string,
    @Body() body: OwnerTenantStatusBody,
    @Req() req: any,
  ) {
    return this.ownerCommercialService.setTenantStatus(
      tenantId,
      body,
      {
        email: req?.user?.email,
        role: req?.user?.role,
      },
    );
  }

  @Post('tenants/:tenantId/subscription-override')
  async setSubscriptionOverride(
    @Param('tenantId') tenantId: string,
    @Body() body: OwnerTenantSubscriptionOverrideBody,
    @Req() req: any,
  ) {
    return this.ownerCommercialService.setSubscriptionOverride(
      tenantId,
      body,
      {
        email: req?.user?.email,
        role: req?.user?.role,
      },
    );
  }

  @Post('tenants/:tenantId/quotes')
  async createTenantQuote(
    @Param('tenantId') tenantId: string,
    @Body() body: OwnerTenantQuoteBody,
    @Req() req: any,
  ) {
    return this.ownerCommercialService.createTenantQuote(
      tenantId,
      body,
      {
        email: req?.user?.email,
        role: req?.user?.role,
      },
    );
  }

  @Post('tenants/:tenantId/invoices')
  async createTenantInvoice(
    @Param('tenantId') tenantId: string,
    @Body() body: OwnerTenantInvoiceBody,
    @Req() req: any,
  ) {
    return this.ownerCommercialService.createTenantInvoice(
      tenantId,
      body,
      {
        email: req?.user?.email,
        role: req?.user?.role,
      },
    );
  }

  @Post('tenants/:tenantId/commercial-notes')
  async addCommercialNote(
    @Param('tenantId') tenantId: string,
    @Body() body: OwnerTenantCommercialNoteBody,
    @Req() req: any,
  ) {
    return this.ownerCommercialService.addCommercialNote(
      tenantId,
      body,
      {
        email: req?.user?.email,
        role: req?.user?.role,
      },
    );
  }
}
