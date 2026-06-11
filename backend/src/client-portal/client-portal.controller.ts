import { Controller, Post, Get, Body, Headers, Param, UnauthorizedException } from '@nestjs/common';
import { ClientPortalService } from './client-portal.service';

@Controller('client-portal')
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.clientPortalService.login(body.email, body.password);
  }

  @Get('shipments')
  async getShipments(@Headers('authorization') authHeader: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('No token provided');

    const payload = await this.clientPortalService.verifyToken(token);
    return this.clientPortalService.getClientShipments(payload.clientId, payload.companyId);
  }

  @Get('invoices')
  async getInvoices(@Headers('authorization') authHeader: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('No token provided');

    const payload = await this.clientPortalService.verifyToken(token);
    return this.clientPortalService.getClientInvoices(payload.clientId, payload.companyId);
  }

  @Get('track/:waybillNumber')
  async trackWaybill(@Param('waybillNumber') waybillNumber: string) {
    return this.clientPortalService.trackWaybill(waybillNumber);
  }
}
