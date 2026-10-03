import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RailTariffService } from './rail-tariff.service';
import { InvoiceDraftDto, TariffRequestDto } from './dto/rail-tariff.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RAIL_READ_ROLES, RAIL_WRITE_ROLES } from './rail-roles';

/** Tariff calculation and the invoice draft. Nothing is priced without a VERIFIED loaded rate. */
@ApiTags('Rail / Tariffs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...RAIL_READ_ROLES)
@Controller('rail/tariffs')
export class RailTariffController {
  constructor(private readonly tariffs: RailTariffService) {}

  // Static routes are declared before the parameterised ones.
  @Get('status')
  @ApiOperation({ summary: 'Which corridors have a VERIFIED loaded rate (none, until the tariff tables are supplied) and the brief\'s constants' })
  status(@CurrentUser() u: AuthenticatedUser) { return this.tariffs.status(u.companyId); }

  @Get('ancillary')
  @ApiOperation({ summary: 'The 113 Annexure 40 ancillary-service lines, with their price status (no prices are published)' })
  ancillary(@CurrentUser() u: AuthenticatedUser) { return this.tariffs.listAncillary(u.companyId); }

  @Post('preview')
  @ApiOperation({ summary: 'Work out the charges for a consignment without saving anything (a refusal returns its reasons)' })
  preview(@CurrentUser() u: AuthenticatedUser, @Body() dto: TariffRequestDto) { return this.tariffs.preview(u.companyId, dto); }

  @Get('calculations')
  list(@CurrentUser() u: AuthenticatedUser, @Query('consignmentId') consignmentId?: string) { return this.tariffs.list(u.companyId, { consignmentId }); }

  @Post('calculations')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Save a priced (or incomplete) calculation; a calculation that cannot be priced at all is refused' })
  calculate(@CurrentUser() u: AuthenticatedUser, @Body() dto: TariffRequestDto) { return this.tariffs.calculate(u.companyId, dto, u); }

  @Get('calculations/:id')
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.tariffs.get(u.companyId, id); }

  @Post('calculations/:id/invoice-draft')
  @Roles(...RAIL_WRITE_ROLES)
  @ApiOperation({ summary: 'Generate an invoice draft from a fully priced calculation — idempotent: a second click returns the same draft' })
  invoiceDraft(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: InvoiceDraftDto) { return this.tariffs.generateInvoiceDraft(u.companyId, id, dto, u); }
}
