import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmailHubItemDto } from './dto/create-email-hub-item.dto';
import { UpdateEmailHubItemDto } from './dto/update-email-hub-item.dto';
import { EmailHubQueryDto } from './dto/email-hub-query.dto';
import { AiEventsService } from '../ai/ai-events/ai-events.service';

@Injectable()
export class EmailHubService {
  private readonly logger = new Logger(EmailHubService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEventsService: AiEventsService,
  ) {}

  // Commercial Fix: Statistics are now scoped to the user's company
  async stats(companyId: number) {
    const [total, unread, needsOpsAction, critical] = await Promise.all([
      this.prisma.emailHubItem.count({ where: { companyId } }),
      this.prisma.emailHubItem.count({ where: { isRead: false, companyId } }),
      this.prisma.emailHubItem.count({ where: { needsOpsAction: true, companyId } }),
      this.prisma.emailHubItem.count({ where: { priority: 'CRITICAL', companyId } }),
    ]);
    // Return both new + legacy field names for compatibility
    return { total, unread, needsOpsAction, critical, pending: unread, anomalies: critical };
  }

  // Multi-tenant List
  async list(companyId: number, query: EmailHubQueryDto) {
    const search = query.search?.trim();
    return this.prisma.emailHubItem.findMany({
      where: {
        companyId, // Strict isolation
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(search ? {
          OR: [
            { subject: { contains: search, mode: 'insensitive' } },
            { body: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: { id: 'desc' },
      include: { aiEvents: true, collection: true },
    });
  }

  async findOne(id: number, companyId: number) {
    const item = await this.prisma.emailHubItem.findFirst({ 
      where: { id, companyId }, 
      include: { aiEvents: true } 
    });
    if (!item) throw new NotFoundException(`Item #${id} not found in your company`);
    return item;
  }

  async create(dto: CreateEmailHubItemDto, companyId: number) {
    const item = await this.prisma.emailHubItem.create({
      data: { 
        ...dto, 
        companyId, 
        status: dto.status ?? 'NEW' 
      },
    });
    await this.createAIEventFromEmailHubItem(item);
    return item;
  }

  async update(id: number, dto: UpdateEmailHubItemDto, companyId: number) {
    // Ensure the item belongs to the user before updating
    await this.findOne(id, companyId);
    return this.prisma.emailHubItem.update({ where: { id }, data: dto });
  }

  async markRead(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.emailHubItem.update({ where: { id }, data: { isRead: true } });
  }

  async resolve(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.emailHubItem.update({ 
      where: { id }, 
      data: { status: 'RESOLVED', needsOpsAction: false } 
    });
  }

  async processPendingEmails(companyId: number) {
    const pending = await this.prisma.emailHubItem.findMany({ 
      where: { isRead: false, type: 'COLLECTION_REQUEST', companyId } 
    });

    for (const email of pending) {
      await this.prisma.emailHubItem.update({
        where: { id: email.id },
        data: { isRead: true, status: 'RESOLVED', needsOpsAction: false }
      });
    }
    return { success: true, count: pending.length };
  }

  async syncExistingToAIEvents(companyId: number) {
    const items = await this.prisma.emailHubItem.findMany({ 
        where: { companyId, aiEvents: { none: {} } } 
    });
    for (const item of items) { await this.createAIEventFromEmailHubItem(item); }
    return { processed: items.length };
  }

  private async createAIEventFromEmailHubItem(item: any) {
    if (!item.subject?.toLowerCase().includes('urgent')) return null;
    return this.aiEventsService.create({
      source: 'EMAIL_HUB',
      type: 'DATA_MISMATCH',
      severity: 'HIGH',
      title: item.subject,
      summary: item.body?.slice(0, 100),
      companyId: item.companyId,
      emailHubItemId: item.id,
    });
  }

  async seedDemo(companyId: number) {
    return this.create({
      subject: 'Urgent: Delivery JD-991',
      senderName: 'System Demo',
      senderEmail: 'notifications@flowops.co.za',
      body: 'Pickup at 123 Logistics Drive, 14 pallets.',
      companyId,
      type: 'COLLECTION_REQUEST'
    }, companyId);
  }
}
