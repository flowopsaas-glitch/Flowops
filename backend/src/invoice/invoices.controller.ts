// src/invoice/invoices.controller.ts - MINIMAL VERSION
import { 
  Controller, 
  Get, 
  Post, 
  Param, 
  Res, 
  UseGuards, 
  Request,
  Logger,
  BadRequestException,
  NotFoundException,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  private readonly logger = new Logger('InvoicesController');
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  async getAll(@Request() req: any) {
    const companyId = req.user?.companyId;
    if (req.user?.role === 'SUPER_ADMIN') {
      return this.invoicesService.findAll();
    }
    return this.invoicesService.findByCompany(companyId);
  }

  @Get('supervisor')
  @Roles('SUPER_ADMIN')
  async getSupervisorView() {
    return this.invoicesService.getSupervisorDashboard();
  }

  @Get(':id')
  async getById(@Param('id') id: string) { // ✅ string ID
    const invoice = await this.invoicesService.findOne(id);
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    return invoice;
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    try {
      const pdfBuffer = await this.invoicesService.generateInvoicePdf(id);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="FlowOps-INV-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.end(pdfBuffer);
    } catch (error: any) {
      this.logger.error(`PDF generation failed: ${error?.message}`);
      throw new BadRequestException('Failed to generate PDF');
    }
  }

  @Post(':id/pay')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async markPaid(@Param('id') id: string) { // ✅ string ID
    return this.invoicesService.markAsPaid(id);
  }

  @Get('metrics')
  async getMetrics(@Request() req: any) {
    const companyId = req.user?.companyId;
    if (req.user?.role === 'SUPER_ADMIN') {
      return this.invoicesService.getPlatformMetrics();
    }
    return this.invoicesService.getCompanyMetrics(companyId);
  }
}
