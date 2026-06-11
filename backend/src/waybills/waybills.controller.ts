// src/waybills/waybills.controller.ts
import { Controller, Get, Post, Patch, Delete, Param, ParseIntPipe, Body, UseGuards, Req, UseInterceptors, UploadedFile, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WaybillsService } from './waybills.service';

@Controller('waybills')
@UseGuards(JwtAuthGuard)
export class WaybillsController {
  private readonly logger = new Logger(WaybillsController.name);
  
  constructor(private readonly service: WaybillsService) {}

  @Get('inbox')
  async getInbox(@Req() req: any) {
    return this.service.getInbox(req.user?.companyId);
  }

  @Get()
  async getAll(@Req() req: any) {
    return this.service.findAll(req.user?.companyId);
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user?.companyId);
  }

  @Post('inbox/upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: any, @Req() req: any) {
    if (!file) return { error: 'No file' };
    try {
      return await this.service.createInboxItem(req.user?.companyId, {
        filename: file.filename,
        path: file.path,
        originalName: file.originalname,
      });
    } catch (err: any) {
      this.logger.error('Upload failed', err);
      return { error: err.message || 'Upload failed' };
    }
  }

  @Post('inbox/:id/commit')
  async commit(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    try {
      return await this.service.commitInboxItem(id, req.user?.companyId, dto);
    } catch (err: any) {
      this.logger.error('Commit failed', err);
      return { error: err.message || 'Commit failed' };
    }
  }

  @Delete('inbox/:id')
  async reject(@Param('id') id: string, @Req() req: any) {
    try {
      await this.service.deleteInboxItem(id, req.user?.companyId);
      return { success: true };
    } catch (err: any) {
      this.logger.error('Reject failed', err);
      return { error: err.message || 'Reject failed' };
    }
  }

  @Get('branch/:branchId/inbound')
  async getBranchInbound(@Param('branchId', ParseIntPipe) branchId: number, @Req() req: any) {
    return this.service.findInboundForBranch(branchId, req.user?.companyId);
  }

  @Patch('branch/:branchId/receive-bulk')
  async bulkReceive(@Param('branchId', ParseIntPipe) branchId: number, @Body('waybillIds') waybillIds: number[], @Req() req: any) {
    return this.service.receiveAtBranch(waybillIds, branchId, req.user?.companyId);
  }

  @Post(':id/complete')
  @UseInterceptors(FileInterceptor('signature'))
  async completeJob(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: any, @Req() req: any) {
    return this.service.completeWaybill(id, req.user?.companyId, file);
  }
}
