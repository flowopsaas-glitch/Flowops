#!/usr/bin/env bash
set -e

cd /opt/Flowops/backend || cd /opt/flowops/backend || exit 1

echo ""
echo "============================================================"
echo "FLOWOPS BUILD POST API INVOICE-DRAFTS SAFE"
echo "============================================================"
echo ""

mkdir -p src/invoice-drafts

cp src/invoice-drafts/invoice-drafts.controller.ts src/invoice-drafts/invoice-drafts.controller.ts.bak.$(date +%Y%m%d-%H%M%S) 2>/dev/null || true
cp src/invoice-drafts/invoice-drafts.service.ts src/invoice-drafts/invoice-drafts.service.ts.bak.$(date +%Y%m%d-%H%M%S) 2>/dev/null || true
cp src/invoice-drafts/invoice-drafts.service.recovery.ts src/invoice-drafts/invoice-drafts.service.recovery.ts.bak.$(date +%Y%m%d-%H%M%S) 2>/dev/null || true

cat > src/invoice-drafts/invoice-drafts.controller.ts <<'CONTROLLER'
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { InvoiceDraftsServiceRecovery } from "./invoice-drafts.service";

@Controller("invoice-drafts")
export class InvoiceDraftsController {
  constructor(
    private readonly invoiceDraftsService: InvoiceDraftsServiceRecovery,
  ) {}

  @Get()
  findAll() {
    return this.invoiceDraftsService.findAll();
  }

  @Get("health-check")
  healthCheck() {
    return {
      ok: true,
      module: "invoice-drafts",
      count: this.invoiceDraftsService.findAll().length,
    };
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.invoiceDraftsService.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.invoiceDraftsService.create(body);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.invoiceDraftsService.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.invoiceDraftsService.remove(id);
  }
}
CONTROLLER

cat > src/invoice-drafts/invoice-drafts.service.ts <<'SERVICE'
import { Injectable, NotFoundException } from "@nestjs/common";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

type InvoiceDraftRecord = {
  id: string;
  quoteId?: string;
  quoteRef?: string;
  quoteNumber?: string;
  clientId?: string | number | null;
  clientName?: string;
  tenantId?: string | number | null;
  contractCode?: string;
  billingMode?: string;
  payerSide?: string;
  invoiceNumber?: string;
  status?: string;
  currency?: string;
  subtotal?: number;
  vatPercent?: number;
  vatAmount?: number;
  total?: number;
  notes?: string;
  aiSummary?: string;
  lineItems?: any[];
  items?: any[];
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class InvoiceDraftsServiceRecovery {
  private readonly dataDir = join(process.cwd(), "data");
  private readonly storeFile = join(this.dataDir, "invoice-draft-store.json");

  private ensureStore() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    if (!existsSync(this.storeFile)) {
      writeFileSync(this.storeFile, "[]", "utf-8");
    }
  }

  private readStore(): InvoiceDraftRecord[] {
    this.ensureStore();

    try {
      const raw = readFileSync(this.storeFile, "utf-8");
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.items)) return parsed.items;
      if (Array.isArray(parsed?.rows)) return parsed.rows;
      if (Array.isArray(parsed?.drafts)) return parsed.drafts;

      return [];
    } catch {
      return [];
    }
  }

  private writeStore(items: InvoiceDraftRecord[]) {
    this.ensureStore();
    writeFileSync(this.storeFile, JSON.stringify(items, null, 2), "utf-8");
  }

  private text(value: any, fallback = ""): string {
    if (value === null || value === undefined) return fallback;
    return String(value).trim();
  }

  private num(value: any, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private buildId(payload: any) {
    const explicit =
      this.text(payload?.id) ||
      this.text(payload?.invoiceDraftId) ||
      this.text(payload?.draftId);

    if (explicit) return explicit;

    const quoteId =
      this.text(payload?.quoteId) ||
      this.text(payload?.quoteRef) ||
      this.text(payload?.quoteNumber) ||
      "manual";

    const stamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14);

    return `draft-${quoteId}-${stamp}`;
  }

  private normalizeLineItems(payload: any): any[] {
    if (Array.isArray(payload?.lineItems)) return payload.lineItems;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.rows)) return payload.rows;
    return [];
  }

  private buildDraft(payload: any): InvoiceDraftRecord {
    const now = new Date().toISOString();
    const lineItems = this.normalizeLineItems(payload);

    const subtotalFromBody =
      payload?.subtotal ??
      payload?.subTotal ??
      payload?.totals?.subtotal;

    const vatPercent = this.num(
      payload?.vatPercent ??
      payload?.vat_percent ??
      payload?.totals?.vatPercent,
      15
    );

    let subtotal = this.num(subtotalFromBody, 0);

    if (!subtotal && lineItems.length) {
      subtotal = lineItems.reduce((sum: number, item: any) => {
        const qty = this.num(item?.qty ?? item?.quantity, 1);
        const unit = this.num(item?.unitPrice ?? item?.rate ?? item?.amount, 0);
        const rowTotal = this.num(item?.total, qty * unit);
        return sum + rowTotal;
      }, 0);
    }

    const vatAmount = this.num(
      payload?.vatAmount ?? payload?.vat_amount,
      Number((subtotal * (vatPercent / 100)).toFixed(2))
    );

    const total = this.num(
      payload?.total ?? payload?.grandTotal,
      Number((subtotal + vatAmount).toFixed(2))
    );

    return {
      id: this.buildId(payload),
      quoteId: this.text(payload?.quoteId || payload?.quote?.id) || undefined,
      quoteRef: this.text(payload?.quoteRef || payload?.quote?.quoteRef) || undefined,
      quoteNumber: this.text(payload?.quoteNumber || payload?.quote?.quoteNumber) || undefined,
      clientId: payload?.clientId ?? payload?.client?.id ?? null,
      clientName: this.text(payload?.clientName || payload?.client?.name),
      tenantId: payload?.tenantId ?? payload?.companyId ?? null,
      contractCode: this.text(payload?.contractCode),
      billingMode: this.text(payload?.billingMode, "CONTRACT"),
      payerSide: this.text(payload?.payerSide, "SENDER"),
      invoiceNumber: this.text(payload?.invoiceNumber),
      status: this.text(payload?.status, "DRAFT"),
      currency: this.text(payload?.currency, "ZAR"),
      subtotal,
      vatPercent,
      vatAmount,
      total,
      notes: this.text(payload?.notes),
      aiSummary: this.text(payload?.aiSummary || payload?.aiInsights || payload?.aiNote),
      lineItems,
      items: lineItems,
      createdAt: now,
      updatedAt: now,
    };
  }

  findAll(): InvoiceDraftRecord[] {
    return this.readStore()
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  findOne(id: string): InvoiceDraftRecord {
    const item = this.readStore().find((row) => String(row.id) === String(id));

    if (!item) {
      throw new NotFoundException(`Invoice draft not found: ${id}`);
    }

    return item;
  }

  create(payload: any): InvoiceDraftRecord {
    const rows = this.readStore();
    const draft = this.buildDraft(payload);

    const existingIndex = rows.findIndex((row) => String(row.id) === String(draft.id));

    if (existingIndex >= 0) {
      rows[existingIndex] = {
        ...rows[existingIndex],
        ...draft,
        createdAt: rows[existingIndex].createdAt || draft.createdAt,
        updatedAt: new Date().toISOString(),
      };
      this.writeStore(rows);
      return rows[existingIndex];
    }

    rows.unshift(draft);
    this.writeStore(rows);
    return draft;
  }

  update(id: string, payload: any): InvoiceDraftRecord {
    const rows = this.readStore();
    const index = rows.findIndex((row) => String(row.id) === String(id));

    if (index < 0) {
      throw new NotFoundException(`Invoice draft not found: ${id}`);
    }

    const current = rows[index];
    const lineItems = this.normalizeLineItems(payload);

    const next: InvoiceDraftRecord = {
      ...current,
      ...payload,
      id: current.id,
      clientName: this.text(payload?.clientName ?? current.clientName),
      contractCode: this.text(payload?.contractCode ?? current.contractCode),
      billingMode: this.text(payload?.billingMode ?? current.billingMode, "CONTRACT"),
      payerSide: this.text(payload?.payerSide ?? current.payerSide, "SENDER"),
      status: this.text(payload?.status ?? current.status, "DRAFT"),
      currency: this.text(payload?.currency ?? current.currency, "ZAR"),
      notes: this.text(payload?.notes ?? current.notes),
      aiSummary: this.text(payload?.aiSummary ?? payload?.aiInsights ?? current.aiSummary),
      lineItems: lineItems.length ? lineItems : current.lineItems || current.items || [],
      items: lineItems.length ? lineItems : current.items || current.lineItems || [],
      subtotal: this.num(payload?.subtotal ?? current.subtotal, 0),
      vatPercent: this.num(payload?.vatPercent ?? current.vatPercent, 15),
      vatAmount: this.num(payload?.vatAmount ?? current.vatAmount, 0),
      total: this.num(payload?.total ?? current.total, 0),
      updatedAt: new Date().toISOString(),
    };

    rows[index] = next;
    this.writeStore(rows);
    return next;
  }

  remove(id: string) {
    const rows = this.readStore();
    const index = rows.findIndex((row) => String(row.id) === String(id));

    if (index < 0) {
      throw new NotFoundException(`Invoice draft not found: ${id}`);
    }

    const removed = rows[index];
    rows.splice(index, 1);
    this.writeStore(rows);

    return {
      ok: true,
      removedId: removed.id,
    };
  }
}
SERVICE

cp src/invoice-drafts/invoice-drafts.service.ts src/invoice-drafts/invoice-drafts.service.recovery.ts

echo ""
echo "[MODULE]"
sed -n '1,220p' src/invoice-drafts/invoice-drafts.module.ts || true

echo ""
echo "[BUILD]"
npm run build
