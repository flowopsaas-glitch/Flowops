import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ShipmentFileService } from './shipment-file.service';
import { ContainersService } from './containers.service';
import { ChargesService } from './charges.service';
import { ForwardingAiService } from './forwarding-ai.service';
import { CreateShipmentFileDto } from './dto/create-shipment-file.dto';
import { UpdateShipmentFileDto } from './dto/update-shipment-file.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Freight Forwarding')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER)
@Controller('forwarding')
export class ForwardingController {
  constructor(
    private readonly files: ShipmentFileService,
    private readonly containers: ContainersService,
    private readonly charges: ChargesService,
    private readonly ai: ForwardingAiService,
  ) {}

  // ── Shipment files ─────────────────────────────────────────────────────────

  @Post('files')
  @ApiOperation({ summary: 'Create a shipment file (import/export)' })
  create(@CurrentUser() u: any, @Body() dto: CreateShipmentFileDto) {
    return this.files.create(u.companyId, dto);
  }

  @Get('files')
  @ApiOperation({ summary: 'List shipment files (filter: mode, direction, status, q)' })
  list(
    @CurrentUser() u: any,
    @Query('mode') mode?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.files.list(u.companyId, { mode, direction, status, q });
  }

  @Get('files/:id')
  @ApiOperation({ summary: 'Get a shipment file with containers, cargo, charges, docs, milestones' })
  get(@CurrentUser() u: any, @Param('id') id: string) {
    return this.files.get(u.companyId, id);
  }

  @Patch('files/:id')
  @ApiOperation({ summary: 'Update a shipment file header/parties/routing/status' })
  update(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: UpdateShipmentFileDto) {
    return this.files.update(u.companyId, id, dto);
  }

  @Delete('files/:id')
  @ApiOperation({ summary: 'Cancel a shipment file (soft)' })
  cancel(@CurrentUser() u: any, @Param('id') id: string) {
    return this.files.cancel(u.companyId, id);
  }

  @Post('files/:id/milestone')
  @ApiOperation({ summary: 'Advance the file to a status + record a milestone' })
  milestone(@CurrentUser() u: any, @Param('id') id: string, @Body() body: { status: string; note?: string }) {
    return this.files.advanceMilestone(u.companyId, id, body?.status, body?.note);
  }

  // ── Containers & cargo ───────────────────────────────────────────────────────

  @Post('files/:id/containers')
  addContainer(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.containers.addContainer(u.companyId, id, dto);
  }

  @Delete('files/:id/containers/:cid')
  removeContainer(@CurrentUser() u: any, @Param('id') id: string, @Param('cid') cid: string) {
    return this.containers.removeContainer(u.companyId, id, cid);
  }

  @Post('files/:id/cargo')
  addCargo(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.containers.addCargo(u.companyId, id, dto);
  }

  @Delete('files/:id/cargo/:cid')
  removeCargo(@CurrentUser() u: any, @Param('id') id: string, @Param('cid') cid: string) {
    return this.containers.removeCargo(u.companyId, id, cid);
  }

  // ── Charges, totals & invoicing ──────────────────────────────────────────────

  @Post('files/:id/charges')
  addCharge(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: any) {
    return this.charges.addCharge(u.companyId, id, dto);
  }

  @Delete('files/:id/charges/:cid')
  removeCharge(@CurrentUser() u: any, @Param('id') id: string, @Param('cid') cid: string) {
    return this.charges.removeCharge(u.companyId, id, cid);
  }

  @Get('files/:id/totals')
  totals(@CurrentUser() u: any, @Param('id') id: string) {
    return this.charges.totals(u.companyId, id);
  }

  @Post('files/:id/invoice')
  @ApiOperation({ summary: 'Generate a draft invoice from the file sell charges' })
  invoice(@CurrentUser() u: any, @Param('id') id: string) {
    return this.charges.generateInvoice(u.companyId, id);
  }

  // ── Documents ─────────────────────────────────────────────────────────────────

  @Post('files/:id/documents')
  addDocument(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: { type: string; fileName: string; fileKey: string }) {
    return this.files.attachDocument(u.companyId, id, dto);
  }

  @Delete('files/:id/documents/:did')
  removeDocument(@CurrentUser() u: any, @Param('id') id: string, @Param('did') did: string) {
    return this.files.removeDocument(u.companyId, id, did);
  }

  // ── Last-mile bridge ─────────────────────────────────────────────────────────

  @Post('files/:id/create-delivery')
  @ApiOperation({ summary: 'Spawn a domestic delivery (collection) from a cleared file' })
  createDelivery(@CurrentUser() u: any, @Param('id') id: string) {
    return this.files.createDeliveryFromFile(u.companyId, id);
  }

  // ── AI assist ───────────────────────────────────────────────────────────────

  @Post('files/:id/ai/hs-classify')
  @ApiOperation({ summary: 'AI: suggest HS tariff codes for a goods description' })
  hsClassify(@Body() body: { description: string }) {
    return this.ai.classifyHs(body?.description);
  }

  @Post('files/:id/ai/risk')
  @ApiOperation({ summary: 'AI: (re)compute demurrage/delay risk for a file' })
  risk(@CurrentUser() u: any, @Param('id') id: string) {
    return this.ai.assessRisk(u.companyId, id);
  }

  @Post('ai/extract')
  @ApiOperation({ summary: 'AI: extract a shipment-file draft from document text' })
  extract(@Body() body: { text: string }) {
    return this.ai.extractFromText(body?.text);
  }
}
