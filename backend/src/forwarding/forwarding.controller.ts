import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ShipmentFileService } from './shipment-file.service';
import { ContainersService } from './containers.service';
import { ChargesService } from './charges.service';
import { ForwardingAiService } from './forwarding-ai.service';
import { CustomsService } from './customs.service';
import { ForwardingPdfService } from './forwarding-pdf.service';
import { CustomsDeclarationService } from './customs-declaration.service';
import { DemurrageService } from './demurrage.service';
import { ConsolidationService } from './consolidation.service';
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
    private readonly customs: CustomsService,
    private readonly pdf: ForwardingPdfService,
    private readonly declarations: CustomsDeclarationService,
    private readonly demurrage: DemurrageService,
    private readonly consolidation: ConsolidationService,
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

  @Patch('files/:id/cargo/:cid')
  updateCargo(@CurrentUser() u: any, @Param('id') id: string, @Param('cid') cid: string, @Body() dto: any) {
    return this.containers.updateCargo(u.companyId, id, cid, dto);
  }

  // ── Customs (Phase 2) ────────────────────────────────────────────────────────

  @Get('files/:id/customs-estimate')
  @ApiOperation({ summary: 'SA duty + VAT (ATV) estimate for the file' })
  customsEstimate(@CurrentUser() u: any, @Param('id') id: string) {
    return this.customs.estimate(u.companyId, id);
  }

  @Post('files/:id/ai/duty-suggest')
  @ApiOperation({ summary: 'AI: suggest SA ad valorem duty rate for an HS code' })
  dutySuggest(@Body() body: { hsCode?: string; description?: string }) {
    return this.customs.suggestDutyRate(body?.hsCode, body?.description);
  }

  // ── SAD declaration workflow (Phase 3) ─────────────────────────────────────────

  @Get('files/:id/declaration')
  @ApiOperation({ summary: 'Get the latest SAD declaration for a file' })
  getDeclaration(@CurrentUser() u: any, @Param('id') id: string) {
    return this.declarations.getForFile(u.companyId, id);
  }

  @Post('files/:id/declaration')
  @ApiOperation({ summary: 'Build/refresh the SAD declaration (CUSDEC payload) from the file' })
  buildDeclaration(@CurrentUser() u: any, @Param('id') id: string) {
    return this.declarations.buildForFile(u.companyId, id);
  }

  @Post('declarations/:did/submit')
  @ApiOperation({ summary: 'Submit declaration (workflow stub — no live SARS EDI gateway)' })
  submitDeclaration(@CurrentUser() u: any, @Param('did') did: string) {
    return this.declarations.submit(u.companyId, did);
  }

  @Patch('declarations/:did/status')
  @ApiOperation({ summary: 'Record a SARS response / status (RELEASED | QUERY | REJECTED)' })
  declarationStatus(@CurrentUser() u: any, @Param('did') did: string, @Body() body: { status: string; mrn?: string; note?: string }) {
    return this.declarations.setStatus(u.companyId, did, body?.status, body?.mrn, body?.note);
  }

  // ── Demurrage / detention (Phase 3) ─────────────────────────────────────────────

  @Patch('files/:id/containers/:cid/demurrage')
  @ApiOperation({ summary: 'Set demurrage/detention terms on a container' })
  setDemurrage(@CurrentUser() u: any, @Param('id') id: string, @Param('cid') cid: string, @Body() dto: any) {
    return this.demurrage.setTerms(u.companyId, id, cid, dto);
  }

  @Get('files/:id/demurrage')
  @ApiOperation({ summary: 'Compute accruing demurrage/detention for the file' })
  getDemurrage(@CurrentUser() u: any, @Param('id') id: string) {
    return this.demurrage.calcForFile(u.companyId, id);
  }

  // ── Consolidation / co-load (Phase 3) ───────────────────────────────────────────

  @Post('files/:id/mark-master')
  @ApiOperation({ summary: 'Promote a file to a consolidation master' })
  markMaster(@CurrentUser() u: any, @Param('id') id: string) {
    return this.consolidation.markAsMaster(u.companyId, id);
  }

  @Get('files/:id/consolidation')
  @ApiOperation({ summary: 'Master view: house files + aggregated summary' })
  getConsolidation(@CurrentUser() u: any, @Param('id') id: string) {
    return this.consolidation.getConsolidation(u.companyId, id);
  }

  @Get('files/:id/attachable-houses')
  @ApiOperation({ summary: 'Files that can be attached as houses to this master' })
  attachableHouses(@CurrentUser() u: any, @Param('id') id: string) {
    return this.consolidation.attachableHouses(u.companyId, id);
  }

  @Post('files/:id/houses')
  @ApiOperation({ summary: 'Attach a house file to this master' })
  attachHouse(@CurrentUser() u: any, @Param('id') id: string, @Body() body: { houseId: string }) {
    return this.consolidation.attachHouse(u.companyId, id, body?.houseId);
  }

  @Delete('files/:id/houses/:houseId')
  @ApiOperation({ summary: 'Detach a house file from this master' })
  detachHouse(@CurrentUser() u: any, @Param('id') id: string, @Param('houseId') houseId: string) {
    return this.consolidation.detachHouse(u.companyId, id, houseId);
  }

  // ── Document PDFs (Phase 2) ────────────────────────────────────────────────────

  @Get('files/:id/documents/:type.pdf')
  @ApiOperation({ summary: 'Generate a PDF: commercial-invoice | packing-list | bill-of-lading | sad500' })
  async documentPdf(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Param('type') type: string,
    @Res() res: Response,
  ) {
    const allowed = ['commercial-invoice', 'packing-list', 'bill-of-lading', 'sad500'];
    if (!allowed.includes(type)) {
      res.status(400).json({ message: `Unknown document type. Use: ${allowed.join(', ')}` });
      return;
    }
    const { buffer, filename } = await this.pdf.generate(u.companyId, id, type as any);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
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
