import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Res,
  UseInterceptors, UploadedFile, HttpStatus, HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { WaybillsService } from './waybills.service';
import { LabelService } from './label.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { uploadConcurrency } from '../common/interceptors/upload-concurrency.interceptor';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../billing/require-feature.decorator';

@ApiTags('Waybills')
@ApiBearerAuth()
@RequireFeature('waybills')
@Controller()
export class WaybillsController {
  constructor(
    private readonly svc: WaybillsService,
    private readonly labels: LabelService,
  ) {}

  // ── Parcel label printing (PDF) ───────────────────────────────────
  // Staff-only: who physically prints/applies labels at the hub.

  /**
   * POST /waybills/labels — bulk label sheet for many waybills in one PDF.
   * Declared before the GET '/waybills/:id/label' so the literal path is
   * matched cleanly. Body: { ids: string[] }.
   */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('waybills/labels')
  async printLabels(
    @CurrentUser() u: any,
    @Body() body: { ids: string[] },
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.labels.generateForMany(
      body?.ids ?? [],
      u.companyId,
    );
    this.streamPdf(res, buffer, filename);
  }

  /** GET /waybills/:id/label — single 4x6" parcel label PDF. */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Get('waybills/:id/label')
  async printLabel(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.labels.generateForWaybill(
      id,
      u.companyId,
    );
    this.streamPdf(res, buffer, filename);
  }

  private streamPdf(res: Response, buffer: Buffer, filename: string) {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  // ── Waybills CRUD ─────────────────────────────────────────────────

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
    UserRole.USER,
  )
  @Get('waybills')
  findAll(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.findAll(u.companyId, q);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
    UserRole.USER, UserRole.DRIVER,
  )
  @Get('waybills/my-deliveries')
  findMyDeliveries(@CurrentUser() u: any) {
    return this.svc.findMyDeliveries(u.id, u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
    UserRole.USER,
  )
  @Get('waybills/recent')
  findRecent(@CurrentUser() u: any) {
    return this.svc.findRecent(u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
    UserRole.USER,
  )
  @Get('waybills/quality')
  deliveryQuality(@CurrentUser() u: any) {
    return this.svc.deliveryQuality(u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.AGENT,
  )
  @Post('waybills')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.create(u.companyId, body);
  }

  /**
   * POST /waybills/batch-scan
   * Used by warehouse clerks scanning multiple waybills at the hub.
   * Accepts a list of tracking numbers and a target status, updates them all.
   */
  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('waybills/batch-scan')
  batchScan(
    @CurrentUser() u: any,
    @Body() body: { trackingNumbers: string[]; targetStatus: string },
  ) {
    return this.svc.batchScan(u.companyId, body.trackingNumbers, body.targetStatus);
  }

  /**
   * POST /waybills/bulk-import
   * Accepts a CSV file and creates waybills in bulk.
   * Returns per-row results (created, failed, duplicate).
   */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('waybills/bulk-import')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadConcurrency, FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, fieldSize: 64 * 1024, parts: 6 },
  }))
  bulkImport(
    @CurrentUser() u: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.bulkImportCsv(u.companyId, file);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
    UserRole.USER,
  )
  @Get('waybills/:id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.AGENT,
  )
  @Patch('waybills/:id')
  update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.update(id, u.companyId, body);
  }

  /**
   * POST /waybills/:id/assign
   * Assign a driver to a waybill.  Creates or updates the linked Shipment
   * and advances the waybill status to COLLECTED so it leaves the dispatch
   * queue.  The Waybill model has no driverId column — the link lives on
   * Shipment — so this is the canonical assignment endpoint.
   */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('waybills/:id/assign')
  assignDriver(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { driverId: string },
  ) {
    return this.svc.assignDriver(id, u.companyId, body.driverId);
  }

  // ── Customer rating endpoints ──────────────────────────────────────

  /** POST /waybills/:id/rate-request — dispatcher sends rating invite */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('waybills/:id/rate-request')
  requestRating(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.requestRating(id, u.companyId);
  }

  /** GET /waybills/rate/:token — public, loads rating page data */
  @Public()
  @Get('waybills/rate/:token')
  getPublicRating(@Param('token') token: string) {
    return this.svc.getPublicRating(token);
  }

  /** POST /waybills/rate/:token — public, submits rating */
  @Public()
  @Post('waybills/rate/:token')
  submitRating(
    @Param('token') token: string,
    @Body() body: { rating: number; note?: string },
  ) {
    return this.svc.submitRating(token, body);
  }

  /** POST /waybills/:id/notify-eta — dispatcher triggers ETA + stops-ahead */
  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('waybills/:id/notify-eta')
  notifyCustomerEta(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { stopsAhead: number; etaMinutes?: number },
  ) {
    return this.svc.notifyCustomerEta(id, u.companyId, body);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE,
  )
  @Post('waybills/:id/deliver')
  @UseInterceptors(uploadConcurrency, FileInterceptor('photo', {
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3, fieldSize: 1_400_000, parts: 4 },
  }))
  @ApiConsumes('multipart/form-data')
  deliver(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: any,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.svc.recordDelivery(id, u.companyId, body, photo);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
    UserRole.USER,
  )
  @Get('waybills/:id/receipt')
  async getReceipt(@Param('id') id: string, @CurrentUser() u: any, @Res() res: Response) {
    const { buffer, filename, contentType } = await this.svc.getReceipt(id, u.companyId);
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `inline; filename="${filename}"`, 'Content-Length': String(buffer.length) });
    res.end(buffer);
  }

  @Roles(
    UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER,
    UserRole.DISPATCH, UserRole.WAREHOUSE, UserRole.AGENT,
    UserRole.USER,
  )
  @Get('waybills/:id/assist')
  getAssist(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getAssist(id, u.companyId);
  }

  // ── Public POD view (no auth) ────────────────────────────────────

  @Public()
  @Get('waybills/public/:id')
  publicView(@Param('id') id: string, @Query('t') token?: string) {
    return this.svc.getPublicView(id, token);
  }

  // ── Inbox (AI extraction) ────────────────────────────────────────

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Get('waybills/inbox')
  getInbox(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.getInbox(u.companyId, q);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Get('waybills/inbox/stats')
  getInboxStats(@CurrentUser() u: any) {
    return this.svc.getInboxStats(u.companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('waybills/inbox/upload')
  @UseInterceptors(uploadConcurrency, FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, fieldSize: 64 * 1024, parts: 3 },
  }))
  @ApiConsumes('multipart/form-data')
  uploadInbox(@CurrentUser() u: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.uploadInbox(u.companyId, file);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Post('waybills/inbox/:id/commit')
  commitInbox(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.commitInboxItem(id, u.companyId, body);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH)
  @Delete('waybills/inbox/:id')
  deleteInbox(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deleteInboxItem(id, u.companyId);
  }
}
