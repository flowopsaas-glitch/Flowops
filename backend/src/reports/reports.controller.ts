import { Controller, Get, Post, Body, UseGuards, Request, Res, Query, Logger } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PdfService } from './pdf.service';
import { EmailService } from './email.service';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(
    private readonly pdfService: PdfService,
    private readonly emailService: EmailService,
  ) {}

  @Get('download')
  async downloadReport(@Request() req: any, @Res() res: Response) {
    try {
      const companyId = req.user?.companyId || req.user?.tenantId || 1;
      this.logger.log(`📊 Generating PDF report for company ${companyId}`);
      
      const pdfBuffer = await this.pdfService.generateAnalyticsReport(companyId);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=Analytics_Report_${new Date().toISOString().split('T')[0]}.pdf`,
        'Content-Length': pdfBuffer.length,
      });

      res.send(pdfBuffer);
    } catch (error) {
      this.logger.error(`PDF download failed: ${error.message}`);
      res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
    }
  }

  @Post('email')
  async emailReport(@Request() req: any, @Body('email') email: string) {
    try {
      const companyId = req.user?.companyId || req.user?.tenantId || 1;
      const recipientEmail = email || req.user?.email;
      
      this.logger.log(`📧 Sending report to ${recipientEmail} for company ${companyId}`);
      
      const pdfBuffer = await this.pdfService.generateAnalyticsReport(companyId);
      const fileName = `Analytics_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      
      const success = await this.emailService.sendReportEmail(
        recipientEmail,
        'Your FlowOps Analytics Report',
        pdfBuffer,
        fileName
      );

      return { 
        success, 
        message: success 
          ? `Report sent to ${recipientEmail}` 
          : 'Failed to send report (check SendGrid configuration)' 
      };
    } catch (error) {
      this.logger.error(`Email report failed: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  @Get('analytics')
  async getAnalytics(@Request() req: any) {
    const companyId = req.user?.companyId || req.user?.tenantId || 1;
    return { message: 'Analytics endpoint', companyId };
  }
}
