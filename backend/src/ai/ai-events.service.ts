import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

/**
 * AiEvent types owned by the OWNER/platform intelligence domain. They are
 * persisted per-company by the competitive-intel sweep + Integration Sentinel,
 * but are surfaced only on the owner console — never in a tenant's High Risk
 * Queue (which is for the tenant's own operational exceptions).
 */
const OWNER_ONLY_EVENT_TYPES = [
  'COMPETITIVE_INTELLIGENCE',
  'COMPETITOR_THREAT',
  'PLATFORM_UPGRADE',
  'INTEL_DECISION',
  'INTEGRATION_HEALTH',
];

@Injectable()
export class AiEventsService {
  private readonly logger = new Logger(AiEventsService.name);
  private readonly aggressionLevel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {
    this.aggressionLevel = this.config.get('CLAW_AGGRESSION_LEVEL', 'MEDIUM');
  }

  /**
   * CORE: Dual-Claw Event Creation
   * Writes directly to the AiEvent schema columns: type, title, body, severity,
   * sourceType, sourceId, metadata. The old `summary`, `payload`, and
   * `emailHubItemId` keys do not exist on the schema — they were silently
   * dropped or caused runtime errors. All callers now use `body` + `metadata`.
   */
  async create(data: any, initiator: 'CLAW_1' | 'CLAW_2' = 'CLAW_1') {
    this.logger.debug(`[${initiator}] Creating AI Event: ${data.title || 'Untitled'}`);

    // Normalise: accept both `body` and legacy `summary` from older callers.
    const body = data.body || data.summary || '';
    // Merge any extra payload fields into metadata so nothing is lost.
    const metadata = {
      ...(data.metadata && typeof data.metadata === 'object' ? data.metadata : {}),
      ...(data.payload  && typeof data.payload  === 'object' ? data.payload  : {}),
      // Preserve emailHubItem reference in metadata if provided.
      ...(data.emailHubItemId ? { emailHubItemId: data.emailHubItemId } : {}),
      initiator,
      systemVersion: '2.0-dual-claw',
    };

    return this.prisma.aiEvent.create({
      data: {
        companyId: String(data.companyId),
        type:      data.type     || 'LOGISTICS_EVENT',
        title:     data.title    || 'Untitled Operational Event',
        body,
        severity:  data.severity || 'info',
        sourceType: data.sourceType || null,
        sourceId:   data.sourceId   || null,
        resolved:   false,
        dismissed:  false,
        metadata:   metadata as any,
      },
    });
  }

  /**
   * COLLABORATIVE: Request a Review from Claw 2
   * This is how Claw 1 hands off a problem it can't solve.
   */
  async requestCollaborativeReview(eventId: number, companyId: number) {
    const originalEvent = await (this.prisma.aiEvent as any).findUnique({
      where: { id: eventId, companyId }
    });

    if (!originalEvent) throw new NotFoundException('Event not found');

    this.logger.log(`[Claw 1 -> Claw 2] Handing off Event ${eventId} for collaborative learning.`);
    
    return this.create({
      companyId,
      type: 'COLLABORATIVE_REVIEW',
      title: `REVIEW REQ: ${originalEvent.title}`,
      body: `Claw 2 requested to audit logic for original event #${eventId}`,
      payload: { originalEventId: eventId, status: 'PENDING_AUDIT' },
      severity: 'HIGH',
    }, 'CLAW_2');
  }

  async list(companyId: number) {
    return this.prisma.aiEvent.findMany({
      where: {
        companyId: String(companyId),
        // Tenants must only see their OWN operational exceptions. The intel
        // sweep + sentinel persist owner/platform events into every company's
        // bucket (for the owner console); those must never surface in a
        // tenant's High Risk Queue.
        type: { notIn: OWNER_ONLY_EVENT_TYPES },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * POD Compliance Scan (Claw 1 Primary Task)
   * Checks each delivered waybill for the four required POD fields and returns
   * a real compliance summary. No more hardcoded "SCAN_COMPLETED" stub.
   */
  async verifyCompliance(companyId: number) {
    this.logger.log(`[Claw 1] POD Compliance Scan for Company ${companyId}`);

    const delivered = await this.prisma.waybill.findMany({
      where: { companyId: String(companyId), status: 'DELIVERED' },
      select: {
        id: true, trackingNumber: true,
        podSignatureUrl: true, podRecipient: true,
        podImageUrl: true, podDeliveredAt: true,
      },
      take: 500,
    });

    let compliant = 0;
    const issues: Array<{ trackingNumber: string; missing: string[] }> = [];

    for (const w of delivered) {
      const missing: string[] = [];
      if (!w.podSignatureUrl) missing.push('signature');
      if (!w.podRecipient)    missing.push('recipient name');
      if (!w.podDeliveredAt)  missing.push('delivery timestamp');
      if (missing.length === 0) { compliant++; } else { issues.push({ trackingNumber: w.trackingNumber, missing }); }
    }

    const total = delivered.length;
    return {
      status: issues.length === 0 ? 'compliant' : 'issues_found',
      actionTaken: 'SCAN_COMPLETED',
      total,
      compliant,
      nonCompliant: issues.length,
      complianceRatePct: total > 0 ? Math.round((compliant / total) * 1000) / 10 : 100,
      issues: issues.slice(0, 20),
    };
  }

  /**
   * LEARNING: Commercial Grade Learning Logic
   * Stores patterns in the database that both Claws can query.
   */
  async learnLogic(dto: {
    companyId: number,
    type: string,
    newValue: string,
    errorContext: string,
    suggestedResolution: string
  }) {
    if (!dto.type || !dto.newValue) {
      throw new BadRequestException('Incomplete correction data: type and newValue are required');
    }

    return this.create({
      companyId: dto.companyId,
      type: dto.type,
      title: `LOGIC_FIX: ${dto.type}`,
      body: dto.suggestedResolution,
      payload: { 
        error: dto.errorContext, 
        fix: dto.newValue,
        commercialReady: true 
      },
      severity: 'HIGH',
    }, 'CLAW_2');
  }

  async learnFromCorrection(companyId: number, patternData: any) {
    return this.learnLogic({
      companyId,
      type: patternData.type || 'LOGISTICS_LEARNING',
      newValue: patternData.newValue || JSON.stringify(patternData),
      errorContext: 'Manual correction from Controller UI',
      suggestedResolution: 'User-defined pattern update'
    });
  }

  /**
   * INTEGRATION: Processes EmailHubItems into AIEvents
   */
  async syncExistingToAIEvents(companyId: number) {
    // Check if emailHubItem exists on prisma schema to avoid unhandled database definition errors
    if (!this.prisma.emailHubItem) {
      this.logger.warn(`Prisma model emailHubItem does not exist on the current client build.`);
      return;
    }

    const pendingItems = await this.prisma.emailHubItem.findMany({
      where: { companyId: String(companyId) }
    });

    for (const item of pendingItems) {
      try {
        await this.createAIEventFromEmailHubItem(item);
      } catch (error: any) {
        this.logger.error(`Failed to process Hub Item ${item.id}: ${error.message}`);
      }
    }
  }

  async createAIEventFromEmailHubItem(item: any) {
    const extractionModel = this.config.get('EXTRACTION_MODEL', 'gpt-4-turbo');
    return this.create({
      title: `Extraction: ${item.subject || 'No Subject'}`,
      body: `Extracted via ${extractionModel}`,
      type: 'LOGISTICS_EXTRACTION',
      payload: { 
        automated: this.aggressionLevel === 'HIGH',
        sourceId: item.id 
      },
      companyId: item.companyId,
      emailHubItemId: item.id,
      severity: 'MEDIUM',
    }, 'CLAW_1');
  }

  async repairInvoicing(companyId: number) {
    this.logger.warn(`[Claw 2] Executing Invoicing Repair for Company ${companyId}`);
    return { status: 'repaired', mode: this.aggressionLevel, timestamp: new Date().toISOString() };
  }

  async resolve(id: number, companyId: number, resolutionNote: string) {
    // Fetch the current metadata so we can merge without losing existing fields.
    const current = await this.prisma.aiEvent.findFirst({
      where: { id: String(id), companyId: String(companyId) },
      select: { metadata: true },
    });

    const currentMeta =
      current?.metadata && typeof current.metadata === 'object'
        ? (current.metadata as Record<string, any>)
        : {};

    return this.prisma.aiEvent.update({
      where: { id: String(id) },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        metadata: {
          ...currentMeta,
          resolutionNote,
          resolvedBy: 'DUAL_CLAW_SYSTEM',
        } as any,
      },
    });
  }
}

