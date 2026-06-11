// @ts-nocheck
﻿import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  OwnerCommercialAuditEntry,
  OwnerCommercialControlStore,
  OwnerTenantCommercialNoteBody,
  OwnerTenantInvoiceBody,
  OwnerTenantQuoteBody,
  OwnerTenantStatusBody,
  OwnerTenantSubscriptionOverrideBody,
} from './owner-commercial.types';

@Injectable()
export class OwnerCommercialService {
  private readonly commercialStorePath = path.join(
    process.cwd(),
    'data',
    'owner-commercial-control-store.json',
  );

  private readonly ownerAuditStorePath = path.join(
    process.cwd(),
    'data',
    'owner-superadmin-store.json',
  );

  constructor(private readonly prisma: PrismaService) {}

  async getTenantCommercialState(tenantIdInput: string | number) {
    const tenant = await this.getTenantOrThrow(tenantIdInput);
    const state = this.getTenantCommercialStateSync(tenant.id, tenant.name);

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
      commercial: state,
    };
  }

  async getTenantCommercialSummary(tenantIdInput: string | number) {
    const tenant = await this.getTenantOrThrow(tenantIdInput);
    return this.buildTenantCommercialSummary(tenant.id, tenant.name);
  }

  async getAllTenantCommercialSummaries() {
    const tenants = await (this.prisma as any).company.findMany({
      orderBy: { id: 'asc' },
    });

    return tenants
      .map((company: any) => {
        const tenantId = Number(company?.id);
        const tenantName = String(
          company?.name ??
          company?.companyName ??
          company?.legalName ??
          `Tenant ${tenantId}`,
        );

        if (/flowops ltd/i.test(tenantName)) {
          return null;
        }

        return this.buildTenantCommercialSummary(tenantId, tenantName);
      })
      .filter(Boolean);
  }

  async getCommercialAuditFeed(limitInput?: string | number) {
    const limit = Math.max(1, Math.min(200, Number(limitInput ?? 50) || 50));
    const store = this.readOwnerAuditStore();
    const audit = Array.isArray(store.audit) ? store.audit : [];

    const normalized = audit
      .filter((entry: any) => {
        const action = String(entry?.action ?? '');
        return action.startsWith('OWNER_');
      })
      .map((entry: any) => ({
        id: entry?.id ?? null,
        action: entry?.action ?? null,
        createdAt: entry?.createdAt ?? entry?.at ?? null,
        at: entry?.at ?? entry?.createdAt ?? null,
        tenantId:
          entry?.tenantId ??
          entry?.meta?.tenantId ??
          entry?.payload?.tenantId ??
          null,
        tenantName:
          entry?.tenantName ??
          entry?.meta?.tenantName ??
          entry?.payload?.tenantName ??
          null,
        actorEmail:
          entry?.actorEmail ??
          entry?.meta?.email ??
          null,
        actorRole:
          entry?.actorRole ??
          entry?.meta?.role ??
          null,
        payload: entry?.payload ?? entry?.meta ?? null,
      }));

    return {
      total: normalized.length,
      limit,
      items: normalized.slice(0, limit),
    };
  }

  async setTenantStatus(
    tenantIdInput: string | number,
    body: OwnerTenantStatusBody,
    actor?: { email?: string; role?: string },
  ) {
    const tenant = await this.getTenantOrThrow(tenantIdInput);

    if (!body?.status) {
      throw new BadRequestException('status is required');
    }

    const requested = String(body.status).trim().toUpperCase();
    const normalized =
      requested === 'RESTORED'
        ? 'ACTIVE'
        : requested;

    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(normalized)) {
      throw new BadRequestException('status must be ACTIVE, INACTIVE, SUSPENDED, or RESTORED');
    }

    const store = this.readCommercialStore();
    const key = String(tenant.id);
    const state = store.tenants[key] ?? this.makeDefaultTenantState(tenant.id, tenant.name);
    const now = new Date().toISOString();

    state.tenantName = tenant.name;
    state.status = normalized as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    state.statusReason = body.reason?.trim() || body.note?.trim() || undefined;
    state.statusChangedAt = now;
    state.updatedAt = now;

    store.tenants[key] = state as any;
    this.writeCommercialStore(store);

    this.appendAudit({
      action: `OWNER_TENANT_STATUS_${normalized}`,
      tenantId: tenant.id,
      tenantName: tenant.name,
      actorEmail: actor?.email,
      actorRole: actor?.role,
      payload: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        reason: body.reason ?? null,
        note: body.note ?? null,
      },
    });

    return {
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      status: state.status,
      statusReason: state.statusReason ?? null,
      statusChangedAt: state.statusChangedAt,
      updatedAt: state.updatedAt,
    };
  }

  async setSubscriptionOverride(
    tenantIdInput: string | number,
    body: OwnerTenantSubscriptionOverrideBody,
    actor?: { email?: string; role?: string },
  ) {
    const tenant = await this.getTenantOrThrow(tenantIdInput);

    if (
      !body ||
      (!body.planCode && !body.planName && body.price === undefined && !body.features?.length)
    ) {
      throw new BadRequestException(
        'Provide at least one subscription override field such as planCode, planName, price, or features',
      );
    }

    const store = this.readCommercialStore();
    const key = String(tenant.id);
    const state = store.tenants[key] ?? this.makeDefaultTenantState(tenant.id, tenant.name);
    const now = new Date().toISOString();

    state.tenantName = tenant.name;
    state.subscriptionOverride = {
      planCode: body.planCode ?? null,
      planName: body.planName ?? null,
      billingCycle: body.billingCycle ?? null,
      price: body.price ?? null,
      currency: body.currency ?? 'ZAR',
      startsAt: body.startsAt ?? null,
      endsAt: body.endsAt ?? null,
      features: Array.isArray(body.features) ? body.features : [],
      notes: body.notes ?? null,
      updatedAt: now,
    };
    state.updatedAt = now;

    store.tenants[key] = state as any;
    this.writeCommercialStore(store);

    this.appendAudit({
      action: 'OWNER_SUBSCRIPTION_OVERRIDE_SET',
      tenantId: tenant.id,
      tenantName: tenant.name,
      actorEmail: actor?.email,
      actorRole: actor?.role,
      payload: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        ...(state.subscriptionOverride as Record<string, unknown>),
      },
    });

    return {
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      subscriptionOverride: state.subscriptionOverride,
      updatedAt: state.updatedAt,
    };
  }

  async createTenantQuote(
    tenantIdInput: string | number,
    body: OwnerTenantQuoteBody,
    actor?: { email?: string; role?: string },
  ) {
    const tenant = await this.getTenantOrThrow(tenantIdInput);

    if (!body?.title?.trim()) {
      throw new BadRequestException('title is required');
    }

    if (body.amount === undefined || body.amount === null || Number(body.amount) < 0) {
      throw new BadRequestException('amount must be a valid non-negative number');
    }

    const store = this.readCommercialStore();
    const key = String(tenant.id);
    const state = store.tenants[key] ?? this.makeDefaultTenantState(tenant.id, tenant.name);
    const now = new Date().toISOString();

    const quote = {
      id: `owner-quote-${Date.now()}-${randomUUID().slice(0, 8)}`,
      createdAt: now,
      createdBy: actor?.email ?? 'owner',
      title: body.title.trim(),
      summary: body.summary ?? null,
      amount: Number(body.amount),
      currency: body.currency ?? 'ZAR',
      validUntil: body.validUntil ?? null,
      lines: Array.isArray(body.lines) ? body.lines : [],
      notes: body.notes ?? null,
      status: 'DRAFT',
    };

    state.tenantName = tenant.name;
    state.quotes = Array.isArray(state.quotes) ? state.quotes : [];
    state.quotes.unshift(quote);
    state.updatedAt = now;

    store.tenants[key] = state as any;
    this.writeCommercialStore(store);

    this.appendAudit({
      action: 'OWNER_TENANT_QUOTE_CREATED',
      tenantId: tenant.id,
      tenantName: tenant.name,
      actorEmail: actor?.email,
      actorRole: actor?.role,
      payload: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        quoteId: quote.id,
        title: quote.title,
        amount: quote.amount,
        currency: quote.currency,
      },
    });

    return {
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      quote,
      updatedAt: state.updatedAt,
    };
  }

  async createTenantInvoice(
    tenantIdInput: string | number,
    body: OwnerTenantInvoiceBody,
    actor?: { email?: string; role?: string },
  ) {
    const tenant = await this.getTenantOrThrow(tenantIdInput);

    if (!body?.title?.trim()) {
      throw new BadRequestException('title is required');
    }

    if (body.amount === undefined || body.amount === null || Number(body.amount) < 0) {
      throw new BadRequestException('amount must be a valid non-negative number');
    }

    const store = this.readCommercialStore();
    const key = String(tenant.id);
    const state = store.tenants[key] ?? this.makeDefaultTenantState(tenant.id, tenant.name);
    const now = new Date().toISOString();

    const invoice = {
      id: `owner-invoice-${Date.now()}-${randomUUID().slice(0, 8)}`,
      createdAt: now,
      createdBy: actor?.email ?? 'owner',
      title: body.title.trim(),
      summary: body.summary ?? null,
      amount: Number(body.amount),
      currency: body.currency ?? 'ZAR',
      billingMonth: body.billingMonth ?? null,
      dueDate: body.dueDate ?? null,
      lines: Array.isArray(body.lines) ? body.lines : [],
      notes: body.notes ?? null,
      status: 'ISSUED',
    };

    state.tenantName = tenant.name;
    state.invoices = Array.isArray(state.invoices) ? state.invoices : [];
    state.invoices.unshift(invoice);
    state.updatedAt = now;

    store.tenants[key] = state as any;
    this.writeCommercialStore(store);

    this.appendAudit({
      action: 'OWNER_TENANT_INVOICE_CREATED',
      tenantId: tenant.id,
      tenantName: tenant.name,
      actorEmail: actor?.email,
      actorRole: actor?.role,
      payload: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        invoiceId: invoice.id,
        title: invoice.title,
        amount: invoice.amount,
        currency: invoice.currency,
        billingMonth: invoice.billingMonth,
      },
    });

    return {
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      invoice,
      updatedAt: state.updatedAt,
    };
  }

  async addCommercialNote(
    tenantIdInput: string | number,
    body: OwnerTenantCommercialNoteBody,
    actor?: { email?: string; role?: string },
  ) {
    const tenant = await this.getTenantOrThrow(tenantIdInput);

    if (!body?.note?.trim()) {
      throw new BadRequestException('note is required');
    }

    const store = this.readCommercialStore();
    const key = String(tenant.id);
    const state = store.tenants[key] ?? this.makeDefaultTenantState(tenant.id, tenant.name);
    const now = new Date().toISOString();

    const note = {
      id: `owner-note-${Date.now()}-${randomUUID().slice(0, 8)}`,
      createdAt: now,
      createdBy: actor?.email ?? 'owner',
      note: body.note.trim(),
      tags: Array.isArray(body.tags) ? body.tags : [],
    };

    state.tenantName = tenant.name;
    state.commercialNotes = Array.isArray(state.commercialNotes) ? state.commercialNotes : [];
    state.commercialNotes.unshift(note);
    state.updatedAt = now;

    store.tenants[key] = state as any;
    this.writeCommercialStore(store);

    this.appendAudit({
      action: 'OWNER_TENANT_COMMERCIAL_NOTE_ADDED',
      tenantId: tenant.id,
      tenantName: tenant.name,
      actorEmail: actor?.email,
      actorRole: actor?.role,
      payload: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        noteId: note.id,
        tags: note.tags,
      },
    });

    return {
      ok: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      note,
      updatedAt: state.updatedAt,
    };
  }

  private buildTenantCommercialSummary(tenantId: number, tenantName: string) {
    const state = this.getTenantCommercialStateSync(tenantId, tenantName);


    const latestQuote = Array.isArray(state.quotes) && state.quotes.length
      ? state.quotes[0]
      : null;

    const latestInvoice = Array.isArray(state.invoices) && state.invoices.length
      ? state.invoices[0]
      : null;

    const latestCommercialNote = Array.isArray(state.commercialNotes) && state.commercialNotes.length
      ? state.commercialNotes[0]
      : null;

    return {
      tenantId,
      tenantName,
      commercialStatus: state.status ?? 'ACTIVE',
      commercialStatusReason: state.statusReason ?? null,
      statusChangedAt: state.statusChangedAt ?? null,
      subscriptionOverride: state.subscriptionOverride ?? null,
      subscriptionOverrideSummary: state.subscriptionOverride
        ? {
            planCode: state.subscriptionOverride['planCode'] ?? null,
            planName: state.subscriptionOverride['planName'] ?? null,
            billingCycle: state.subscriptionOverride['billingCycle'] ?? null,
            price: state.subscriptionOverride['price'] ?? null,
            currency: state.subscriptionOverride['currency'] ?? 'ZAR',
            startsAt: state.subscriptionOverride['startsAt'] ?? null,
            endsAt: state.subscriptionOverride['endsAt'] ?? null,
            featureCount: Array.isArray(state.subscriptionOverride['features'])
              ? state.subscriptionOverride['features'].length
              : 0,
            updatedAt: state.subscriptionOverride['updatedAt'] ?? null,
          }
        : null,
      latestQuote,
      latestInvoice,
      latestCommercialNote,
      counts: {
        notes: Array.isArray(state.commercialNotes) ? state.commercialNotes.length : 0,
        quotes: Array.isArray(state.quotes) ? state.quotes.length : 0,
        invoices: Array.isArray(state.invoices) ? state.invoices.length : 0,
      },
      updatedAt: state.updatedAt ?? null,
    };
  }

  private getTenantCommercialStateSync(tenantId: number, tenantName: string) {
    const store = this.readCommercialStore();
    const key = String(tenantId);
    return store.tenants[key] ?? this.makeDefaultTenantState(tenantId, tenantName);
  }

  private async getTenantOrThrow(tenantIdInput: string | number) {
    const tenantId = Number(tenantIdInput);

    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      throw new BadRequestException('tenantId must be a valid positive number');
    }

    const company = await (this.prisma as any).company.findUnique({
      where: { id: tenantId },
    });

    if (!company) {
      throw new NotFoundException(`Tenant ${tenantId} was not found`);
    }

    const tenantName =
      String(
        (company as any).name ??
        (company as any).companyName ??
        (company as any).legalName ??
        `Tenant ${tenantId}`,
      );

    if (/flowops ltd/i.test(tenantName)) {
      throw new BadRequestException('FlowOps platform owner cannot be mutated as a tenant');
    }

    return {
      id: tenantId,
      name: tenantName,
      raw: company,
    };
  }

  private makeDefaultTenantState(tenantId: number, tenantName: string) {
    const now = new Date().toISOString();

    return {
      tenantId,
      tenantName,
      status: 'ACTIVE',
      statusReason: undefined,
      statusChangedAt: now,
      commercialNotes: [],
      quotes: [],
      invoices: [],
      subscriptionOverride: undefined,
      updatedAt: now,
    };
  }

  private readCommercialStore(): OwnerCommercialControlStore {
    try {
      if (!fs.existsSync(this.commercialStorePath)) {
        return { tenants: {} };
      }

      const raw = fs.readFileSync(this.commercialStorePath, 'utf8').trim();

      if (!raw) {
        return { tenants: {} };
      }

      const parsed = JSON.parse(raw);

      return {
        tenants: parsed?.tenants ?? {},
      };
    } catch {
      return { tenants: {} };
    }
  }

  private readOwnerAuditStore(): any {
    try {
      if (!fs.existsSync(this.ownerAuditStorePath)) {
        return { audit: [], plans: [], tenantDrafts: [] };
      }

      const raw = fs.readFileSync(this.ownerAuditStorePath, 'utf8').trim();

      if (!raw) {
        return { audit: [], plans: [], tenantDrafts: [] };
      }

      const parsed = JSON.parse(raw);

      return {
        audit: Array.isArray(parsed?.audit) ? parsed.audit : [],
        plans: Array.isArray(parsed?.plans) ? parsed.plans : [],
        tenantDrafts: Array.isArray(parsed?.tenantDrafts) ? parsed.tenantDrafts : [],
      };
    } catch {
      return { audit: [], plans: [], tenantDrafts: [] };
    }
  }

  private writeCommercialStore(store: OwnerCommercialControlStore) {
    fs.writeFileSync(
      this.commercialStorePath,
      JSON.stringify(store, null, 2),
      'utf8',
    );
  }

  private appendAudit(entry: Omit<OwnerCommercialAuditEntry, 'id' | 'at'>) {
    const auditEntry: any = {
      id: `owner-audit-${Date.now()}-${randomUUID().slice(0, 8)}`,
      at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...entry,
    };

    let existing: any = { audit: [], plans: [], tenantDrafts: [] };

    try {
      if (fs.existsSync(this.ownerAuditStorePath)) {
        const raw = fs.readFileSync(this.ownerAuditStorePath, 'utf8').trim();
        existing = raw ? JSON.parse(raw) : { audit: [], plans: [], tenantDrafts: [] };
      }
    } catch {
      existing = { audit: [], plans: [], tenantDrafts: [] };
    }

    if (!Array.isArray(existing.audit)) {
      existing.audit = [];
    }

    existing.audit.unshift(auditEntry);

    fs.writeFileSync(
      this.ownerAuditStorePath,
      JSON.stringify(existing, null, 2),
      'utf8',
    );
  }
}

