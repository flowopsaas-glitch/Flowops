import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type AiDomain = 'dispatch' | 'sales' | 'warehouse' | 'collections' | 'invoices' | 'drivers';

type AiAction =
  | { type: 'SET_SELECTED_COMPANY'; payload: { companyId: number } }
  | { type: 'REFRESH_PAGE'; payload?: Record<string, never> }
  | { type: 'SET_COLLECTION_STATUS'; payload: { collectionId: number; status: string } }
  | { type: 'REQUEST_UPLOADS'; payload: { collectionId: number } }
  | { type: 'MARK_READY_FOR_INVOICING'; payload: { collectionId: number } };

type AiActionAny = { type: string; payload?: any };

type AiAssistRequest = {
  user: any;
  domain: AiDomain;
  message: string;
  context?: any;
};

type AiActionRequest = {
  user: any;
  action: AiActionAny;
  context?: any;
};

type AiAssistResponse = {
  summary: string;
  insights: string[];
  questions: string[];
  suggestedActions: Array<{ label: string; action: AiAction }>;
};

type SupervisorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type SupervisorArea =
  | 'SHIPMENTS'
  | 'COLLECTIONS'
  | 'BILLING'
  | 'POD'
  | 'ROUTING'
  | 'TENANTS'
  | 'AI';

type SupervisorOverview = {
  ok: true;
  scope: 'tenant' | 'platform';
  generatedAt: string;
  tenant: { companyId: number | null; companyName: string | null };
  assistant: {
    provider: string;
    mode: 'rules' | 'hybrid';
    autopilot: boolean;
    note: string;
  };
  metrics: {
    totalCollections: number;
    pendingCollections: number;
    unassignedDispatches: number;
    waybillsMissingPod: number;
    draftInvoices: number;
    highSeverityEvents: number;
    activeTenants: number | null;
  };
  alerts: Array<{
    id: string;
    title: string;
    description: string;
    severity: SupervisorSeverity;
    area: SupervisorArea;
    owner: string;
    eta: string;
  }>;
  recommendations: Array<{
    id: string;
    title: string;
    description: string;
    impact: string;
    category: 'CUSTOMER' | 'ROUTE' | 'BILLING' | 'OPERATIONS' | 'TENANT';
    action: AiActionAny;
  }>;
  copilotContext: Record<string, any>;
};

@Injectable()
export class AiOpsService {
  constructor(private readonly prisma: PrismaService) {}

  private hasExternalAiProvider() {
    return Boolean(
      String(process.env.OPENAI_API_KEY || '').trim() ||
        String(process.env.Z_AI_API_KEY || '').trim() ||
        String(process.env.GOOGLE_AI_KEY || '').trim(),
    );
  }

  /**
   * FREE rule-based assist (no external AI).
   */
  async assist(req: AiAssistRequest): Promise<AiAssistResponse> {
    const domain = (req.domain || 'collections') as AiDomain;
    const message = String(req.message || '').trim();
    const context = req.context ?? {};
    return this.ruleAssist(domain, message, context, req.user ?? null);
  }

  /**
   * Safe action runner (allowlist).
   */
  async executeAction(req: AiActionRequest) {
    const action = req.action as AiActionAny;
    const user = req.user ?? null;

    const actionType = String(action?.type || '').trim();
    if (!actionType) return { ok: false, message: 'Missing action.type' };

    switch (actionType) {
      // client-side only (frontend decides what to do)
      case 'REFRESH_PAGE':
      case 'SET_SELECTED_COMPANY':
        return { ok: true, message: 'Client-side action', action };

      // server-side example (safe)
      case 'SET_COLLECTION_STATUS': {
        const companyId = Number(user?.companyId);
        const collectionId = Number(action?.payload?.collectionId);
        const status = String(action?.payload?.status || '').toUpperCase();

        if (!companyId) return { ok: false, message: 'Missing companyId in JWT' };
        if (!collectionId || !status) return { ok: false, message: 'Missing collectionId/status' };

        const allowed = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
        if (!allowed.includes(status)) return { ok: false, message: `Status not allowed: ${status}` };

        const existing = await (this.prisma as any).collection.findFirst({
          where: { id: collectionId, companyId },
          select: { id: true },
        });
        if (!existing) return { ok: false, message: 'Collection not found for your company' };

        const updated = await (this.prisma as any).collection.update({
          where: { id: collectionId },
          data: { status: status as any },
          select: { id: true, status: true },
        });

        return { ok: true, message: 'Collection status updated', data: updated };
      }

      case 'REQUEST_UPLOADS': {
        return {
          ok: true,
          message: 'Prompt driver: upload parcels list + POD photos to unlock invoicing.',
          action,
        };
      }

      case 'MARK_READY_FOR_INVOICING': {
        return {
          ok: true,
          message: 'Mark ready-for-invoicing (requires parcels + POD uploads).',
          action,
        };
      }

      default:
        return { ok: false, message: `Action not supported yet: ${actionType}` };
    }
  }

  async getSupervisorOverview(user: any): Promise<SupervisorOverview> {
    const scope = user?.scope === 'platform' || user?.type === 'owner' || !user?.companyId
      ? 'platform'
      : 'tenant';
    const companyId = scope === 'tenant' ? Number(user?.companyId) : null;
    const companyName = companyId
      ? await this.safeCompanyName(companyId)
      : 'FlowOps Platform';

    const [
      totalCollections,
      pendingCollections,
      unassignedDispatches,
      waybillsMissingPod,
      draftInvoices,
      highSeverityEvents,
      activeTenants,
    ] = await Promise.all([
      this.safeCount('collection', this.scopeWhere(scope, companyId)),
      this.safeCount('collection', {
        ...this.scopeWhere(scope, companyId),
        status: 'PENDING',
      }),
      this.safeCount('dispatch', {
        ...this.scopeWhere(scope, companyId),
        OR: [{ driverId: null }, { status: 'PENDING' }, { status: 'UNASSIGNED' }],
      }),
      this.safeCount('waybill', {
        ...this.scopeWhere(scope, companyId),
        OR: [{ imageUrl: null }, { signatureUrl: null }],
      }),
      this.safeCount('invoice', {
        ...this.scopeWhere(scope, companyId),
        OR: [{ status: 'DRAFT' }, { status: 'PENDING' }],
      }),
      this.safeCount('aIEvent', {
        ...this.scopeWhere(scope, companyId),
        OR: [{ severity: 'HIGH' }, { severity: 'CRITICAL' }],
      }),
      scope === 'platform'
        ? this.safeCount('company', {})
        : Promise.resolve(null),
    ]);

    const alerts = this.buildSupervisorAlerts({
      scope,
      pendingCollections,
      unassignedDispatches,
      waybillsMissingPod,
      draftInvoices,
      highSeverityEvents,
      activeTenants,
    });

    const recommendations = this.buildSupervisorRecommendations({
      scope,
      companyId,
      pendingCollections,
      unassignedDispatches,
      waybillsMissingPod,
      draftInvoices,
      highSeverityEvents,
    });

    return {
      ok: true,
      scope,
      generatedAt: new Date().toISOString(),
      tenant: {
        companyId,
        companyName,
      },
      assistant: {
        provider: 'FlowOps Z AI Supervisor',
        mode: this.hasExternalAiProvider() ? 'hybrid' : 'rules',
        autopilot: true,
        note: this.hasExternalAiProvider()
          ? 'Hybrid supervision is enabled with local guardrails and external AI support.'
          : 'Rule-based supervision is active. Add Z_AI_API_KEY or OPENAI_API_KEY later to upgrade reasoning depth.',
      },
      metrics: {
        totalCollections,
        pendingCollections,
        unassignedDispatches,
        waybillsMissingPod,
        draftInvoices,
        highSeverityEvents,
        activeTenants,
      },
      alerts,
      recommendations,
      copilotContext: {
        scope,
        companyId,
        companyName,
        collections: {
          total: totalCollections,
          pending: pendingCollections,
        },
        dispatches: {
          unassigned: unassignedDispatches,
        },
        invoices: {
          draft: draftInvoices,
        },
        pod: {
          missing: waybillsMissingPod,
        },
        aiEvents: {
          highSeverity: highSeverityEvents,
        },
        activeTenants,
      },
    };
  }

  // ============================================================
  // RULE ENGINE (FREE)
  // ============================================================

  private ruleAssist(domain: AiDomain, message: string, context: any, user: any): AiAssistResponse {
    const insights: string[] = [];
    const questions: string[] = [];
    const suggestedActions: Array<{ label: string; action: AiAction }> = [];

    const now = new Date();
    const hour = now.getHours();

    insights.push(`FlowOps Rule AI active (${domain}).`);

    // ---------- Collections // Drivers ----------
    if (domain === 'collections' || domain === 'drivers') {
      const collections = Array.isArray(context?.collections) ? context.collections : [];

      const pending = collections.filter((c: any) => String(c.status).toUpperCase() === 'PENDING');
      if (pending.length > 0) {
        insights.push(`You have ${pending.length} pending collections.`);
        insights.push('Pending items should be updated and have parcels + PODs uploaded to unlock invoicing.');

        questions.push('Do you want me to prompt drivers now to upload parcels + PODs?');

        suggestedActions.push({
          label: 'Request uploads for first pending',
          action: { type: 'REQUEST_UPLOADS', payload: { collectionId: Number(pending[0]?.id) } },
        });
      } else {
        insights.push('No pending collections detected.');
      }

// 60 mins before closing (default: 17:00 local)
      const closingHourLocal = Number(context?.closingHourLocal ?? 17);
      const minutesToClose = (closingHourLocal - hour) * 60 - now.getMinutes();

      if (minutesToClose <= 60 && minutesToClose > 0) {
        insights.push(`Closing in ~${minutesToClose} minutes. Prioritize the fastest nearby stops first.`);
        questions.push('Should I recommend a quick route order for remaining stops?');
      }
    }

    // ---------- Dispatch ----------
    if (domain === 'dispatch') {
      const dispatches = Array.isArray(context?.dispatches) ? context.dispatches : [];
      const unassigned = dispatches.filter((d: any) => !d.driverId);

      if (unassigned.length > 0) {
        insights.push(`${unassigned.length} dispatch jobs are unassigned.`);
        questions.push('Assign to the nearest available driver?');
      } else {
        insights.push('No unassigned dispatch jobs detected.');
      }
    }

    // ---------- Sales ----------
    if (domain === 'sales') {
      const customers = Array.isArray(context?.customers) ? context.customers : [];
      const inactive = customers.filter((c: any) => {
        if (!c.lastDispatchDate) return false;
        return new Date(c.lastDispatchDate).getTime() < Date.now() - 14 * 24 * 60 * 60 * 1000;
      });

      if (inactive.length > 0) {
        insights.push(`${inactive.length} customers inactive > 14 days.`);
        questions.push('Generate follow-up reminders?');
      } else {
        insights.push('No inactive customers detected (14 day window).');
      }
    }

    // ---------- Warehouse ----------
    if (domain === 'warehouse') {
      const zones = Array.isArray(context?.zones) ? context.zones : [];
      const highCapacity = zones.filter((z: any) => Number(z.capacityUsed) > 85);

      if (highCapacity.length > 0) {
        insights.push('Warehouse zone nearing capacity limit (>85%).');
        questions.push('Recommend re-slotting strategy?');
      } else {
        insights.push('No warehouse capacity risk detected.');
      }
    }

    // ---------- Invoices ----------
    if (domain === 'invoices') {
      const invoices = Array.isArray(context?.invoices) ? context.invoices : [];
      const incomplete = invoices.filter((i: any) => !i.podUploaded || !i.parcelsUploaded);

      if (incomplete.length > 0) {
        insights.push(`${incomplete.length} invoices missing POD or parcel data.`);
        questions.push('Block invoice creation until documents are uploaded?');
      } else {
        insights.push('No invoice documentation gaps detected.');
      }
    }

    // Always offer refresh
    suggestedActions.push({ label: 'Refresh data', action: { type: 'REFRESH_PAGE', payload: {} } });

    // Summary
    const summary = message
      ? `Operational analysis: ${domain} — based on your live data.`
      : 'Operational analysis complete.';

    return {
      summary,
      insights,
      questions,
      suggestedActions: suggestedActions.slice(0, 4),
    };
  }

  private scopeWhere(scope: 'tenant' | 'platform', companyId: number | null) {
    if (scope === 'tenant' && companyId) {
      return { companyId };
    }
    return {};
  }

  private async safeCount(modelName: string, where: Record<string, any>) {
    const model = (this.prisma as any)?.[modelName];
    if (!model || typeof model.count !== 'function') return 0;
    try {
      return await model.count({ where });
    } catch {
      return 0;
    }
  }

  private async safeCompanyName(companyId: number) {
    const companyModel = (this.prisma as any)?.company;
    if (!companyModel || typeof companyModel.findUnique !== 'function') {
      return `Tenant ${companyId}`;
    }
    try {
      const company = await companyModel.findUnique({
        where: { id: companyId },
        select: { name: true },
      });
      return String(company?.name || `Tenant ${companyId}`);
    } catch {
      return `Tenant ${companyId}`;
    }
  }

  private buildSupervisorAlerts(input: {
    scope: 'tenant' | 'platform';
    pendingCollections: number;
    unassignedDispatches: number;
    waybillsMissingPod: number;
    draftInvoices: number;
    highSeverityEvents: number;
    activeTenants: number | null;
  }) {
    const alerts: SupervisorOverview['alerts'] = [];

    if (input.highSeverityEvents > 0) {
      alerts.push({
        id: 'AI-HIGH-SEVERITY',
        title: `${input.highSeverityEvents} high-severity AI events require review`,
        description:
          'Supervisor detected unresolved high-priority operational signals that may affect SLA, billing, or customer trust.',
        severity: input.highSeverityEvents >= 5 ? 'CRITICAL' : 'HIGH',
        area: 'AI',
        owner: 'AI Supervisor',
        eta: 'Act now',
      });
    }

    if (input.unassignedDispatches > 0) {
      alerts.push({
        id: 'DISPATCH-UNASSIGNED',
        title: `${input.unassignedDispatches} dispatch jobs are still unassigned`,
        description:
          'Dispatch demand is exceeding current assignment coverage and could create late collections or missed deliveries.',
        severity: input.unassignedDispatches >= 5 ? 'HIGH' : 'MEDIUM',
        area: 'ROUTING',
        owner: 'Dispatch',
        eta: 'Within 30 min',
      });
    }

    if (input.waybillsMissingPod > 0) {
      alerts.push({
        id: 'POD-MISSING',
        title: `${input.waybillsMissingPod} waybills are missing POD evidence`,
        description:
          'Missing images or signatures can delay invoicing, create disputes, and weaken delivery audit trails.',
        severity: input.waybillsMissingPod >= 10 ? 'HIGH' : 'MEDIUM',
        area: 'POD',
        owner: 'Operations',
        eta: 'Within 1 hour',
      });
    }

    if (input.pendingCollections > 0) {
      alerts.push({
        id: 'COLLECTIONS-PENDING',
        title: `${input.pendingCollections} collections remain pending`,
        description:
          'Pending collections should be advanced, assigned, or closed out so downstream dispatch and billing stay clean.',
        severity: input.pendingCollections >= 8 ? 'HIGH' : 'LOW',
        area: 'COLLECTIONS',
        owner: 'Collections',
        eta: 'Review today',
      });
    }

    if (input.scope === 'platform' && (input.activeTenants ?? 0) > 0) {
      alerts.push({
        id: 'TENANT-OVERSIGHT',
        title: `${input.activeTenants} tenants visible to platform supervision`,
        description:
          'Owner view is active. Cross-tenant supervision can now highlight operational drift and where intervention is needed most.',
        severity: 'LOW',
        area: 'TENANTS',
        owner: 'Platform Owner',
        eta: 'Continuous',
      });
    }

    if (!alerts.length) {
      alerts.push({
        id: 'SUPERVISOR-NOMINAL',
        title: 'No urgent platform risks detected',
        description:
          'The current snapshot looks stable. Keep monitoring collections, dispatch allocation, and POD completion.',
        severity: 'LOW',
        area: 'AI',
        owner: 'AI Supervisor',
        eta: 'Stable',
      });
    }

    return alerts.slice(0, 6);
  }

  private buildSupervisorRecommendations(input: {
    scope: 'tenant' | 'platform';
    companyId: number | null;
    pendingCollections: number;
    unassignedDispatches: number;
    waybillsMissingPod: number;
    draftInvoices: number;
    highSeverityEvents: number;
  }) {
    const recommendations: SupervisorOverview['recommendations'] = [];

    if (input.pendingCollections > 0) {
      recommendations.push({
        id: 'REC-COLLECTION-UPLOADS',
        title: 'Trigger collection completion follow-up',
        description:
          'Prompt teams and drivers to upload remaining evidence and move pending collections toward invoicing readiness.',
        impact: 'Reduces operational lag and improves invoice readiness.',
        category: 'OPERATIONS',
        action: {
          type: 'REQUEST_UPLOADS',
          payload: { collectionId: 0 },
        },
      });
    }

    if (input.unassignedDispatches > 0) {
      recommendations.push({
        id: 'REC-DISPATCH-REFRESH',
        title: 'Re-run dispatch review and assign nearest drivers',
        description:
          'Use the live dispatch board to close assignment gaps before they turn into SLA misses.',
        impact: 'Improves route coverage and on-time execution.',
        category: 'ROUTE',
        action: {
          type: 'REFRESH_PAGE',
          payload: {},
        },
      });
    }

    if (input.waybillsMissingPod > 0 || input.draftInvoices > 0) {
      recommendations.push({
        id: 'REC-BILLING-GATE',
        title: 'Enforce POD and invoicing readiness gate',
        description:
          'Use AI supervision to keep billing from advancing while core delivery evidence is still missing.',
        impact: 'Protects revenue accuracy and customer dispute handling.',
        category: 'BILLING',
        action: {
          type: 'MARK_READY_FOR_INVOICING',
          payload: { collectionId: 0 },
        },
      });
    }

    if (input.scope === 'platform') {
      recommendations.push({
        id: 'REC-TENANT-OVERSIGHT',
        title: 'Review tenant health from owner console',
        description:
          'Use owner-level oversight to identify the tenant that needs commercial or operational intervention next.',
        impact: 'Improves platform-wide supervision and tenant support.',
        category: 'TENANT',
        action: {
          type: 'REFRESH_PAGE',
          payload: {},
        },
      });
    }

    if (input.highSeverityEvents > 0) {
      recommendations.push({
        id: 'REC-AI-EVENTS',
        title: 'Resolve the oldest high-severity AI events first',
        description:
          'Start with critical AI alerts that have the highest business impact across customers, billing, and routing.',
        impact: 'Shrinks unresolved risk backlog quickly.',
        category: 'OPERATIONS',
        action: {
          type: 'REFRESH_PAGE',
          payload: {},
        },
      });
    }

    return recommendations.slice(0, 5);
  }
}
