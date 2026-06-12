import { Controller, Get, Query, Res, Req, UseGuards, Logger } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { ExportService } from './export.service';

type ExportType = 'waybills' | 'invoices' | 'clients' | 'drivers' | 'collections' | 'audit-log';

@Controller('export')
@UseGuards(JwtAuthGuard)
export class ExportController {
  private readonly logger = new Logger('ExportController');

  constructor(private readonly exportService: ExportService) {}

  /**
   * GET /api/v1/export?type=waybills|invoices|clients|drivers|collections|audit-log
   * Downloads a CSV file of the requested data type
   */
  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'COMPANY_ADMIN')
  async exportData(
    @Query('type') type: ExportType,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const companyId = Number(req.user?.companyId || 1);
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
    const effectiveCompanyId = isSuperAdmin && req.query?.companyId
      ? Number(req.query.companyId)
      : companyId;

    this.logger.log(`📊 CSV export requested: ${type} for company ${effectiveCompanyId}`);

    let csv: string;
    let filename: string;

    switch (type) {
      case 'waybills':
        csv = await this.exportService.exportWaybills(effectiveCompanyId);
        filename = `flowops-waybills-${Date.now()}.csv`;
        break;
      case 'invoices':
        csv = await this.exportService.exportInvoices(effectiveCompanyId);
        filename = `flowops-invoices-${Date.now()}.csv`;
        break;
      case 'clients':
        csv = await this.exportService.exportClients(effectiveCompanyId);
        filename = `flowops-clients-${Date.now()}.csv`;
        break;
      case 'drivers':
        csv = await this.exportService.exportDrivers(effectiveCompanyId);
        filename = `flowops-drivers-${Date.now()}.csv`;
        break;
      case 'collections':
        csv = await this.exportService.exportCollections(effectiveCompanyId);
        filename = `flowops-collections-${Date.now()}.csv`;
        break;
      case 'audit-log':
        csv = await this.exportService.exportAuditLog(effectiveCompanyId);
        filename = `flowops-audit-log-${Date.now()}.csv`;
        break;
      default:
        res.status(400).json({ message: 'Invalid export type. Use: waybills, invoices, clients, drivers, collections, audit-log' });
        return;
    }

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(csv, 'utf8'),
    });
    res.send('\uFEFF' + csv); // BOM prefix for Excel UTF-8 compatibility
  }
}
