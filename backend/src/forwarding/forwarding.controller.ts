import {
  Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res, UseGuards,
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
import { CustomsEdiCredentialService } from './customs-edi/customs-edi-credential.service';
import { DemurrageService } from './demurrage.service';
import { VesselTrackingService } from './vessel-tracking.service';
import { AirCargoIntelligenceService } from './air-cargo-intelligence.service';
import { SadcCorridorService } from './sadc-corridor.service';
import { ConsolidationService } from './consolidation.service';
import { ForwardingOverviewService } from './forwarding-overview.service';
import { CreateShipmentFileDto } from './dto/create-shipment-file.dto';
import { UpdateShipmentFileDto } from './dto/update-shipment-file.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
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
    private readonly ediCredentials: CustomsEdiCredentialService,
    private readonly demurrage: DemurrageService,
    private readonly vessel: VesselTrackingService,
    private readonly airCargo: AirCargoIntelligenceService,
    private readonly sadcCorridor: SadcCorridorService,
    private readonly consolidation: ConsolidationService,
    private readonly overviewSvc: ForwardingOverviewService,
  ) {}

  // ── Command-centre overview ─────────────────────────────────────────────────

  @Get('overview')
  @ApiOperation({ summary: 'Clearing & Forwarding command centre: cross-file KPIs, arrivals, customs queue, exceptions' })
  overview(@CurrentUser() u: AuthenticatedUser) {
    return this.overviewSvc.overview(u.companyId);
  }

  // ── Shipment files ─────────────────────────────────────────────────────────

  @Post('files')
  @ApiOperation({ summary: 'Create a shipment file (import/export)' })
  create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CreateShipmentFileDto) {
    return this.files.create(u.companyId, dto);
  }

  @Get('files')
  @ApiOperation({ summary: 'List shipment files (filter: mode, direction, status, q)' })
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query('mode') mode?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.files.list(u.companyId, { mode, direction, status, q });
  }

  @Get('files/:id')
  @ApiOperation({ summary: 'Get a shipment file with containers, cargo, charges, docs, milestones' })
  get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.files.get(u.companyId, id);
  }

  @Patch('files/:id')
  @ApiOperation({ summary: 'Update a shipment file header/parties/routing/status' })
  update(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateShipmentFileDto) {
    return this.files.update(u.companyId, id, dto);
  }

  @Delete('files/:id')
  @ApiOperation({ summary: 'Cancel a shipment file (soft)' })
  cancel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.files.cancel(u.companyId, id);
  }

  @Post('files/:id/milestone')
  @ApiOperation({ summary: 'Advance the file to a status + record a milestone' })
  milestone(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: { status: string; note?: string }) {
    return this.files.advanceMilestone(u.companyId, id, body?.status, body?.note);
  }

  // ── Containers & cargo ───────────────────────────────────────────────────────

  @Post('files/:id/containers')
  addContainer(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: any) {
    return this.containers.addContainer(u.companyId, id, dto);
  }

  @Delete('files/:id/containers/:cid')
  removeContainer(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('cid') cid: string) {
    return this.containers.removeContainer(u.companyId, id, cid);
  }

  @Post('files/:id/cargo')
  addCargo(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: any) {
    return this.containers.addCargo(u.companyId, id, dto);
  }

  @Delete('files/:id/cargo/:cid')
  removeCargo(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('cid') cid: string) {
    return this.containers.removeCargo(u.companyId, id, cid);
  }

  @Patch('files/:id/cargo/:cid')
  updateCargo(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('cid') cid: string, @Body() dto: any) {
    return this.containers.updateCargo(u.companyId, id, cid, dto);
  }

  // ── Customs (Phase 2) ────────────────────────────────────────────────────────

  @Get('files/:id/customs-estimate')
  @ApiOperation({ summary: 'SA duty + VAT (ATV) estimate for the file' })
  customsEstimate(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
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
  getDeclaration(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.declarations.getForFile(u.companyId, id);
  }

  @Post('files/:id/declaration')
  @ApiOperation({ summary: 'Build/refresh the SAD declaration (CUSDEC payload) from the file' })
  buildDeclaration(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.declarations.buildForFile(u.companyId, id);
  }

  @Post('declarations/:did/submit')
  @ApiOperation({ summary: 'Submit declaration (workflow stub — no live SARS EDI gateway)' })
  submitDeclaration(@CurrentUser() u: AuthenticatedUser, @Param('did') did: string) {
    return this.declarations.submit(u.companyId, did);
  }

  @Patch('declarations/:did/status')
  @ApiOperation({ summary: 'Record a SARS response / status (RELEASED | QUERY | REJECTED)' })
  declarationStatus(@CurrentUser() u: AuthenticatedUser, @Param('did') did: string, @Body() body: { status: string; mrn?: string; note?: string }) {
    return this.declarations.setStatus(u.companyId, did, body?.status, body?.mrn, body?.note);
  }

  @Get('declarations/:did/messages')
  @ApiOperation({ summary: 'CUSDEC/CUSRES message log for a declaration (timeline)' })
  declarationMessages(@CurrentUser() u: AuthenticatedUser, @Param('did') did: string) {
    return this.declarations.getMessages(u.companyId, did);
  }

  // ── SARS EDI transmission credentials (per-tenant, BYO) ─────────────────────────

  @Get('customs/edi/credential')
  @ApiOperation({ summary: 'Get this tenant\'s SARS transmission config (secrets masked)' })
  getEdiCredential(@CurrentUser() u: AuthenticatedUser) {
    return this.ediCredentials.getMasked(u.companyId);
  }

  @Put('customs/edi/credential')
  @ApiOperation({ summary: 'Configure the SARS transmission path (DIRECT_EDI | SERVICE_PROVIDER | CLEARING_AGENT_HANDOFF)' })
  upsertEdiCredential(@CurrentUser() u: AuthenticatedUser, @Body() dto: any) {
    return this.ediCredentials.upsert(u.companyId, u.id, dto);
  }

  @Post('customs/edi/verify')
  @ApiOperation({ summary: 'Test the configured SARS transmission connection (non-mutating)' })
  verifyEdi(@CurrentUser() u: AuthenticatedUser) {
    return this.ediCredentials.verify(u.companyId, u.id);
  }

  // ── Demurrage / detention (Phase 3) ─────────────────────────────────────────────

  @Patch('files/:id/containers/:cid/demurrage')
  @ApiOperation({ summary: 'Set demurrage/detention terms on a container' })
  setDemurrage(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('cid') cid: string, @Body() dto: any) {
    return this.demurrage.setTerms(u.companyId, id, cid, dto);
  }

  @Get('files/:id/demurrage')
  @ApiOperation({ summary: 'Compute accruing demurrage/detention for the file' })
  getDemurrage(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.demurrage.calcForFile(u.companyId, id);
  }

  // ── Vessel Tracking + Port Intelligence ───────────────────────────────────────

  @Get('files/:id/vessel-tracking')
  @ApiOperation({ summary: 'Live vessel tracking + predicted ETA + port congestion' })
  trackVessel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.vessel.trackVessel(u.companyId, id);
  }

  @Get('ports/congestion')
  @ApiOperation({ summary: 'Port congestion levels for all major African + Asian ports' })
  portCongestion() {
    return this.vessel.getAllPortCongestion();
  }

  // ── Consolidation / co-load (Phase 3) ───────────────────────────────────────────

  @Post('files/:id/mark-master')
  @ApiOperation({ summary: 'Promote a file to a consolidation master' })
  markMaster(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.consolidation.markAsMaster(u.companyId, id);
  }

  @Get('files/:id/consolidation')
  @ApiOperation({ summary: 'Master view: house files + aggregated summary' })
  getConsolidation(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.consolidation.getConsolidation(u.companyId, id);
  }

  @Get('files/:id/attachable-houses')
  @ApiOperation({ summary: 'Files that can be attached as houses to this master' })
  attachableHouses(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.consolidation.attachableHouses(u.companyId, id);
  }

  @Post('files/:id/houses')
  @ApiOperation({ summary: 'Attach a house file to this master' })
  attachHouse(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() body: { houseId: string }) {
    return this.consolidation.attachHouse(u.companyId, id, body?.houseId);
  }

  @Delete('files/:id/houses/:houseId')
  @ApiOperation({ summary: 'Detach a house file from this master' })
  detachHouse(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('houseId') houseId: string) {
    return this.consolidation.detachHouse(u.companyId, id, houseId);
  }

  // ── Document PDFs (Phase 2) ────────────────────────────────────────────────────

  @Get('files/:id/documents/:type.pdf')
  @ApiOperation({ summary: 'Generate a PDF: commercial-invoice | packing-list | bill-of-lading | sad500 | cmr | certificate-of-origin | dangerous-goods | transit-bond | zim-form47' })
  async documentPdf(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('type') type: string,
    @Res() res: Response,
  ) {
    const allowed = [
      'commercial-invoice', 'packing-list', 'bill-of-lading', 'sad500',
      'cmr', 'certificate-of-origin', 'dangerous-goods', 'transit-bond',
      'zim-form47', 'kenya-c17', 'nigeria-sgd', 'ghana-boe',
      'ethiopia-erca', 'tanzania-tancis', 'drc-dgda', 'egypt-nafeza',
      'mozambique-jue', 'botswana-burs', 'uganda-ura', 'rwanda-rra',
      'ivory-coast-dgd', 'senegal-gainde', 'cameroon-sydonia',
      'comesa-cd', 'ecowas-sgd', 'eac-cd', 'sadc-cd',
    ];
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
  addCharge(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: any) {
    return this.charges.addCharge(u.companyId, id, dto);
  }

  @Delete('files/:id/charges/:cid')
  removeCharge(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('cid') cid: string) {
    return this.charges.removeCharge(u.companyId, id, cid);
  }

  @Get('files/:id/totals')
  totals(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.charges.totals(u.companyId, id);
  }

  @Post('files/:id/invoice')
  @ApiOperation({ summary: 'Generate a draft invoice from the file sell charges' })
  invoice(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.charges.generateInvoice(u.companyId, id);
  }

  // ── Documents ─────────────────────────────────────────────────────────────────

  @Post('files/:id/documents')
  addDocument(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: { type: string; fileName: string; fileKey: string }) {
    return this.files.attachDocument(u.companyId, id, dto);
  }

  @Delete('files/:id/documents/:did')
  removeDocument(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Param('did') did: string) {
    return this.files.removeDocument(u.companyId, id, did);
  }

  // ── Last-mile bridge ─────────────────────────────────────────────────────────

  @Post('files/:id/create-delivery')
  @ApiOperation({ summary: 'Spawn a domestic delivery (collection) from a cleared file' })
  createDelivery(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
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
  risk(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.ai.assessRisk(u.companyId, id);
  }

  @Post('ai/extract')
  @ApiOperation({ summary: 'AI: extract a shipment-file draft from document text' })
  extract(@Body() body: { text: string }) {
    return this.ai.extractFromText(body?.text);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // AIR CARGO INTELLIGENCE — Flight Tracking, Airport Congestion, Cost AI,
  // AWB Generation, Customs Pre-Clearance, ULD Tracking
  // ══════════════════════════════════════════════════════════════════════════════

  @Get('files/:id/flight-tracking')
  @ApiOperation({ summary: 'Live flight tracking + predicted ETA + airport congestion for air shipments' })
  trackFlight(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.airCargo.trackFlight(u.companyId, id);
  }

  @Get('airports/congestion')
  @ApiOperation({ summary: 'Airport congestion levels for all African + Asian cargo hubs' })
  airportCongestion() {
    return this.airCargo.getAllAirportCongestion();
  }

  @Get('airports/congestion/:iataCode')
  @ApiOperation({ summary: 'Airport congestion for a specific airport (IATA code or city name)' })
  airportCongestionByCode(@Param('iataCode') iataCode: string) {
    return this.airCargo.getAirportCongestion(iataCode);
  }

  @Post('files/:id/air-vs-ocean')
  @ApiOperation({ summary: 'AI: Air vs Ocean cost/time comparison with recommendation' })
  airVsOcean(
    @Param('id') id: string,
    @Body() body: { origin: string; destination: string; weightKg: number; volumeCbm: number },
  ) {
    return this.airCargo.compareAirVsOcean(body.origin, body.destination, body.weightKg, body.volumeCbm);
  }

  @Get('files/:id/awb-data')
  @ApiOperation({ summary: 'Generate AWB data (IATA Res 600a/672 compliant) for PDF rendering' })
  awbData(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.airCargo.generateAwbData(u.companyId, id);
  }

  @Get('files/:id/customs-pre-clearance')
  @ApiOperation({ summary: 'Customs pre-clearance status + alerts (WCO PLACI framework)' })
  customsPreClearance(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.airCargo.getCustomsPreClearance(u.companyId, id);
  }

  @Get('files/:id/uld-tracking')
  @ApiOperation({ summary: 'ULD (Unit Load Device) tracking for air shipment containers' })
  uldTracking(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.airCargo.getUldTracking(u.companyId, id);
  }

  @Post('uld/validate')
  @ApiOperation({ summary: 'Validate a ULD code format per IATA ULD Technical Manual' })
  validateUld(@Body() body: { code: string }) {
    return this.airCargo.validateUldCode(body.code);
  }

  @Get('uld/specs')
  @ApiOperation({ summary: 'ULD type specifications (dimensions, max weight, tare)' })
  uldSpecs(@Query('type') type?: string) {
    return this.airCargo.getUldSpecs(type);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SADC CORRIDOR INTELLIGENCE — Border posts, corridors, Walvis Bay comparison
  // ══════════════════════════════════════════════════════════════════════════════

  @Get('sadc/border-posts')
  @ApiOperation({ summary: 'All SADC border posts with congestion levels and wait times' })
  sadcBorderPosts() {
    return this.sadcCorridor.getAllBorderPosts();
  }

  @Get('sadc/border-posts/:code')
  @ApiOperation({ summary: 'Specific border post details (wait times, required docs)' })
  sadcBorderPost(@Param('code') code: string) {
    return this.sadcCorridor.getBorderPost(code);
  }

  @Get('sadc/corridors')
  @ApiOperation({ summary: 'All SADC trade corridors with transit times and costs' })
  sadcCorridors() {
    return this.sadcCorridor.getAllCorridors();
  }

  @Get('sadc/corridors/:code')
  @ApiOperation({ summary: 'Specific corridor details' })
  sadcCorridorByCode(@Param('code') code: string) {
    return this.sadcCorridor.getCorridor(code);
  }

  @Get('sadc/corridors/:code/documents')
  @ApiOperation({ summary: 'Required documents for a specific corridor (per country + per border)' })
  sadcCorridorDocs(@Param('code') code: string) {
    return this.sadcCorridor.getRequiredDocuments(code);
  }

  @Get('sadc/compare')
  @ApiOperation({ summary: 'Compare corridors for a destination — find the fastest/cheapest route' })
  sadcCompare(@Query('origin') origin: string, @Query('destination') destination: string) {
    return this.sadcCorridor.compareCorridors(origin, destination);
  }

  @Get('sadc/walvis-vs-durban')
  @ApiOperation({ summary: 'Walvis Bay SADC Gateway vs Durban — cost, time, risk comparison' })
  walvisVsDurban(@Query('destination') destination: string) {
    return this.sadcCorridor.walvisBayVsDurban(destination);
  }
}
