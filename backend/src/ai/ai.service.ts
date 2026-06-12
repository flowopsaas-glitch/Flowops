import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService) {}

  // ── Shipments copilot ─────────────────────────────────────────────────

  async shipmentsCoopilot(companyId: string, query: string) {
    // Stub: in production, call OpenAI / Bedrock with shipment context
    const activeShipments = await this.prisma.shipment.count({
      where: { companyId, status: 'IN_TRANSIT' },
    });
    return {
      reply: `You currently have ${activeShipments} shipments in transit. How can I help you further?`,
      context: { activeShipments },
      _note: 'Connect this to an LLM (OpenAI / AWS Bedrock) for real AI responses.',
    };
  }

  // ── AI Events ─────────────────────────────────────────────────────────

  async getEvents(companyId: string, query?: any) {
    const where: any = { companyId };
    if (query?.resolved === 'false') where.resolved = false;
    if (query?.severity) where.severity = query.severity;
    return this.prisma.aiEvent.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  async getEventStats(companyId: string) {
    const [total, unresolved, critical] = await Promise.all([
      this.prisma.aiEvent.count({ where: { companyId } }),
      this.prisma.aiEvent.count({ where: { companyId, resolved: false } }),
      this.prisma.aiEvent.count({ where: { companyId, severity: 'critical', resolved: false } }),
    ]);
    return { total, unresolved, critical };
  }

  async resolveEvent(id: string, companyId: string) {
    return this.prisma.aiEvent.update({
      where: { id },
      data: { resolved: true, resolvedAt: new Date() },
    });
  }

  async dismissEvent(id: string, companyId: string) {
    return this.prisma.aiEvent.update({ where: { id }, data: { dismissed: true } });
  }

  async seedDemoEvents(companyId: string) {
    const demos = [
      { type: 'risk', title: 'High-risk waybill detected', body: 'Waybill FO24000012 flagged for review', severity: 'warning' },
      { type: 'anomaly', title: 'Unusual delivery delay', body: 'Driver has not moved for 45 minutes', severity: 'info' },
      { type: 'recommendation', title: 'Route optimisation available', body: '3 collections can be batched to save 20km', severity: 'info' },
    ];
    return this.prisma.aiEvent.createMany({ data: demos.map(d => ({ ...d, companyId })) });
  }

  // ── AI Ops supervisor ─────────────────────────────────────────────────

  async getSupervisorOverview(companyId: string) {
    const [shipments, collections, risks, events] = await Promise.all([
      this.prisma.shipment.count({ where: { companyId, status: 'IN_TRANSIT' } }),
      this.prisma.collection.count({ where: { companyId, status: { in: ['PENDING', 'ASSIGNED'] } } }),
      this.prisma.waybill.count({ where: { companyId, riskLevel: { in: ['HIGH', 'CRITICAL'] } } }),
      this.prisma.aiEvent.count({ where: { companyId, resolved: false } }),
    ]);
    return {
      liveShipments: shipments, pendingCollections: collections,
      highRiskWaybills: risks, unresolvedAlerts: events,
      systemHealth: 'nominal',
    };
  }

  async repairRoute(dto: any) {
    // In production: call AI to suggest route repair
    return { repaired: false, suggestion: 'Route repair not implemented — connect to routing AI.' };
  }

  // ── Email hub ─────────────────────────────────────────────────────────

  async getEmailHub(companyId: string, query?: any) {
    return this.prisma.emailHubItem.findMany({
      where: { companyId }, orderBy: { createdAt: 'desc' }, take: 50,
    });
  }

  async getEmailHubStats(companyId: string) {
    const [total, unread, unresolved] = await Promise.all([
      this.prisma.emailHubItem.count({ where: { companyId } }),
      this.prisma.emailHubItem.count({ where: { companyId, read: false } }),
      this.prisma.emailHubItem.count({ where: { companyId, resolved: false } }),
    ]);
    return { total, unread, unresolved };
  }

  async createEmailHubItem(companyId: string, dto: any) {
    return this.prisma.emailHubItem.create({ data: { ...dto, companyId } });
  }

  async updateEmailHubItem(id: string, companyId: string, dto: any) {
    return this.prisma.emailHubItem.update({ where: { id }, data: dto });
  }

  async seedDemoEmails(companyId: string) {
    const demos = [
      { subject: 'Delivery inquiry', from: 'customer@example.com', to: 'ops@company.com', body: 'Where is my parcel FO24001?', category: 'inquiry' },
      { subject: 'Quote request', from: 'sales@client.com', to: 'ops@company.com', body: 'Please send a quote for 10kg Jhb to CT', category: 'quote_request' },
    ];
    return this.prisma.emailHubItem.createMany({ data: demos.map(d => ({ ...d, companyId })) });
  }

  // ── AI Audit logs ─────────────────────────────────────────────────────

  async getAuditLogs(companyId: string, query?: any) {
    return this.prisma.aiEvent.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Leads ─────────────────────────────────────────────────────────────

  async createLead(companyId: string, email: string) {
    return this.prisma.lead.create({ data: { email, companyId } });
  }

  // ── Booking portal ────────────────────────────────────────────────────

  async getPortalLinks(companyId: string) {
    return this.prisma.bookingPortalLink.findMany({ where: { companyId }, include: { _count: { select: { requests: true } } } });
  }

  async createPortalLink(companyId: string, dto: any) {
    return this.prisma.bookingPortalLink.create({ data: { ...dto, companyId } });
  }

  async getPublicPortal(token: string) {
    return this.prisma.bookingPortalLink.findFirst({
      where: { token, isActive: true },
      include: { company: { select: { name: true, portalBrandName: true, portalPrimaryColor: true, portalLogoUrl: true } } },
    });
  }

  async submitBookingRequest(token: string, dto: any) {
    const link = await this.prisma.bookingPortalLink.findFirst({ where: { token, isActive: true } });
    if (!link) throw new Error('Invalid booking link');
    return this.prisma.bookingRequest.create({ data: { ...dto, linkId: link.id } });
  }
}
