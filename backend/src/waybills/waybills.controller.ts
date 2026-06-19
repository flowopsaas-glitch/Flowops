import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseInterceptors, UploadedFile, HttpStatus, HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { WaybillsService } from './waybills.service';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Waybills')
@ApiBearerAuth()
@Controller()
export class WaybillsController {
  constructor(private readonly svc: WaybillsService) {}

  // ── Waybills CRUD ─────────────────────────────────────────────────

  @Get('waybills')
  findAll(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.findAll(u.companyId, q);
  }

  @Get('waybills/recent')
  findRecent(@CurrentUser() u: any) {
    return this.svc.findRecent(u.companyId);
  }

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
  @Post('waybills/batch-scan')
  batchScan(
    @CurrentUser() u: any,
    @Body() body: { trackingNumbers: string[]; targetStatus: string },
  ) {
    return this.svc.batchScan(u.companyId, body.trackingNumbers, body.targetStatus);
  }

  @Get('waybills/:id')
  findOne(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.findOne(id, u.companyId);
  }

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
  @Post('waybills/:id/assign')
  assignDriver(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { driverId: string },
  ) {
    return this.svc.assignDriver(id, u.companyId, body.driverId);
  }

  @Post('waybills/:id/deliver')
  @UseInterceptors(FileInterceptor('photo'))
  @ApiConsumes('multipart/form-data')
  deliver(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: any,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.svc.recordDelivery(id, u.companyId, body, photo);
  }

  @Get('waybills/:id/receipt')
  getReceipt(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getReceipt(id, u.companyId);
  }

  @Get('waybills/:id/assist')
  getAssist(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getAssist(id, u.companyId);
  }

  // ── Public POD view (no auth) ────────────────────────────────────

  @Public()
  @Get('waybills/public/:id')
  publicView(@Param('id') id: string) {
    return this.svc.getPublicView(id);
  }

  // ── Inbox (AI extraction) ────────────────────────────────────────

  @Get('waybills/inbox')
  getInbox(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.getInbox(u.companyId, q);
  }

  @Get('waybills/inbox/stats')
  getInboxStats(@CurrentUser() u: any) {
    return this.svc.getInboxStats(u.companyId);
  }

  @Post('waybills/inbox/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  uploadInbox(@CurrentUser() u: any, @UploadedFile() file: Express.Multer.File) {
    return this.svc.uploadInbox(u.companyId, file);
  }

  @Post('waybills/inbox/:id/commit')
  commitInbox(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.svc.commitInboxItem(id, u.companyId, body);
  }

  @Delete('waybills/inbox/:id')
  deleteInbox(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deleteInboxItem(id, u.companyId);
  }
}
