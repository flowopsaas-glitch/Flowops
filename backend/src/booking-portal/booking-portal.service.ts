import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class BookingPortalService {
  constructor(private prisma: PrismaService) {}
  async createPortalLink(companyId: any, dto: any) { return { url: '' }; }
  async getPortalLinksForCompany(companyId: any) { return []; }
  async listCompanyBookingRequests(companyId: any) { return []; }
  async listClientBookingRequests(companyId: any, clientId: any) { return []; }
  async getPortalByToken(token: string) { return { valid: true }; }
  async createPublicBookingRequest(token: string, dto: any) { return { success: true }; }
}
