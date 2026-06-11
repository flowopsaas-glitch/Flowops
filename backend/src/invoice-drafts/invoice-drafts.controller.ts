// src/invoice-drafts/invoice-drafts.controller.ts - MINIMAL VERSION
import { 
  Controller, 
  Get, 
  Post, 
  Patch, 
  Delete,
  Param, 
  Body, 
  UseGuards, 
  Request,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { InvoiceDraftsService } from './invoice-drafts.service';

@Controller('invoice-drafts')
@UseGuards(JwtAuthGuard)
export class InvoiceDraftsController {
  private readonly logger = new Logger('InvoiceDraftsController');
  constructor(private readonly service: InvoiceDraftsService) {}

  @Get()
  async getAll(@Request() req: any) {
    const companyId = req.user?.companyId;
    if (req.user?.role === 'SUPER_ADMIN') return this.service.findAll();
    return this.service.findByCompany(companyId);
  }

  @Get(':id')
  async getById(@Param('id') id: string) { // ✅ string ID
    const draft = await this.service.findOne(id);
    if (!draft) throw new NotFoundException(`Draft ${id} not found`);
    return draft;
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: any) {
    if (!dto.companyId) throw new BadRequestException('companyId required');
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { success: true };
  }

  @Post(':id/send')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async send(@Param('id') id: string) {
    return this.service.sendDraft(id);
  }
}
