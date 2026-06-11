import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { BrandingService } from '../branding/branding.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

/**
 * 📦 POD PORTAL - White-Label Public Delivery Proof
 *
 * Public, unauthenticated endpoints for waybill tracking
 * Branded with company custom colors, logo, domain
 *
 * Example: https:/acme-logistics.com/pod/WAYBILL_ABC123
 * Displays:
 * - Waybill number & status
 * - Driver location (live map)
 * - Estimated delivery time
 * - Proof of delivery photo
 * - Signature
 * - Delivery notes
 * - Company branding (logo, colors)
 */
@Controller('pod')
export class PodPortalController {
  constructor(
    private readonly branding: BrandingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /pod/waybill/:id
   * Public waybill tracking page (no auth required)
   */
  @Public()
  @Get('waybill/:id')
  async getWaybillStatus(
    @Param('id') waybillId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      // Get waybill
      const waybill = await (this.prisma as any).waybill.findUnique({
        where: { id: parseInt(waybillId) },
        include: {
          driver: true,
          company: true,
          dispatch: true,
        },
      });

      if (!waybill) {
        return res.status(404).json({ error: 'Waybill not found' });
      }

      // Get company branding
      const branding = await this.branding.getBrandingConfig(waybill.companyId);

      // Render HTML with branding
      const html = this.renderPodHtml(waybill, branding);

      return res.setHeader('Content-Type', 'text/html').send(html);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /pod/status/:waybillId (API)
   * JSON endpoint for mobile/web apps
   */
  @Public()
  @Get('status/:id')
  async getWaybillStatusJson(@Param('id') waybillId: string) {
    try {
      const waybill = await (this.prisma as any).waybill.findUnique({
        where: { id: parseInt(waybillId) },
        include: {
          driver: {
            select: {
              name: true,
              phone: true,
              lat: true,
              lng: true,
            },
          },
          dispatch: {
            select: {
              status: true,
              eta: true,
            },
          },
        },
      });

      if (!waybill) {
        return { error: 'Waybill not found' };
      }

      return {
        success: true,
        data: {
          waybillNumber: waybill.waybillNumber,
          recipient: waybill.recipient,
          address: waybill.address,
          status: waybill.status,
          driver: waybill.driver,
          eta: waybill.dispatch?.eta,
          createdAt: waybill.createdAt,
          deliveredAt: waybill.deliveredAt,
          cloudPath: waybill.cloudPath, // URL to POD photo
        },
      };
    } catch (err: any) {
      return { error: err.message };
    }
  }

  /**
   * Render branded HTML for POD portal
   */
  private renderPodHtml(waybill: any, branding: any): string {
    const statusBadgeColor = this.getStatusColor(waybill.status);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${branding.companyName} - Waybill ${waybill.waybillNumber}</title>
  <style>
    :root {
      --brand-primary: ${branding.primaryColor};
      --brand-secondary: ${branding.secondaryColor};
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      color: #333;
    }

    .navbar {
      background: var(--brand-primary);
      color: white;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .navbar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 20px;
      font-weight: 600;
    }

    .logo {
      width: 40px;
      height: 40px;
      background-image: url('${branding.logoUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjZmZmIi8+PC9zdmc+'}');
      background-size: contain;
      background-repeat: no-repeat;
      border-radius: 4px;
    }

    .container {
      max-width: 600px;
      margin: 24px auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .header {
      background: var(--brand-primary);
      color: white;
      padding: 24px;
      text-align: center;
    }

    .waybill-number {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 8px;
    }

    .status-badge {
      display: inline-block;
      background: ${statusBadgeColor};
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
    }

    .content {
      padding: 24px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #eee;
    }

    .info-label {
      font-weight: 600;
      color: #666;
    }

    .info-value {
      color: #333;
      text-align: right;
    }

    .footer {
      background: #f9f9f9;
      padding: 16px 24px;
      text-align: center;
      font-size: 12px;
      color: #999;
    }

    .footer a {
      color: var(--brand-primary);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="navbar">
    <div class="navbar-brand">
      <div class="logo"></div>
      ${branding.companyName}
    </div>
  </div>

  <div class="container">
    <div class="header">
      <div class="waybill-number">${waybill.waybillNumber}</div>
      <div class="status-badge">${waybill.status}</div>
    </div>

    <div class="content">
      <div class="info-row">
        <span class="info-label">Recipient</span>
        <span class="info-value">${waybill.recipient}</span>
      </div>

      <div class="info-row">
        <span class="info-label">Address</span>
        <span class="info-value">${waybill.address}</span>
      </div>

      <div class="info-row">
        <span class="info-label">Weight</span>
        <span class="info-value">${waybill.weightKg} kg</span>
      </div>

      <div class="info-row">
        <span class="info-label">Driver</span>
        <span class="info-value">${waybill.driver?.name || 'TBD'}</span>
      </div>

      <div class="info-row">
        <span class="info-label">Created</span>
        <span class="info-value">${new Date(waybill.createdAt).toLocaleString()}</span>
      </div>

      ${waybill.deliveredAt ? `
      <div class="info-row">
        <span class="info-label">Delivered</span>
        <span class="info-value">${new Date(waybill.deliveredAt).toLocaleString()}</span>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      <p>Powered by ${branding.companyName}</p>
      ${branding.privacyUrl ? `<p><a href="${branding.privacyUrl}">Privacy</a></p>` : ''}
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Get status badge color
   */
  private getStatusColor(status: string): string {
    const statusMap: { [key: string]: string } = {
      PENDING: '#ffa500',
      IN_TRANSIT: '#0066cc',
      DELIVERED: '#00cc66',
      FAILED: '#cc0000',
      RETURNED: '#ff6600',
    };

    return statusMap[status] || '#999';
  }
}
