import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OkrService } from './okr.service';
import { OwnerAuthGuard } from '../common/guards/owner-auth.guard';
import { Public } from '../common/decorators/public.decorator';

/**
 * OKR routes — platform-owner only. Mirrors the OwnerController auth pattern:
 * @Public() bypasses the global tenant JwtAuthGuard, OwnerAuthGuard enforces
 * the owner JWT.
 */
@ApiTags('Owner OKRs')
@ApiBearerAuth()
@Controller('owner/okrs')
@UseGuards(OwnerAuthGuard)
@Public()
export class OkrController {
  constructor(private readonly svc: OkrService) {}

  @Get()
  list(@Query('quarter') quarter?: string) {
    return this.svc.list(quarter);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post()
  createObjective(@Body() body: any) {
    return this.svc.createObjective(body);
  }

  @Patch(':id')
  updateObjective(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateObjective(id, body);
  }

  @Delete(':id')
  deleteObjective(@Param('id') id: string) {
    return this.svc.deleteObjective(id);
  }

  // ── Key results ──────────────────────────────────────────────────────────
  @Post(':id/key-results')
  addKeyResult(@Param('id') id: string, @Body() body: any) {
    return this.svc.addKeyResult(id, body);
  }

  @Patch('key-results/:krId')
  updateKeyResult(@Param('krId') krId: string, @Body() body: any) {
    return this.svc.updateKeyResult(krId, body);
  }

  @Delete('key-results/:krId')
  deleteKeyResult(@Param('krId') krId: string) {
    return this.svc.deleteKeyResult(krId);
  }
}
