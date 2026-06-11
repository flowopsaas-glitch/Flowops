import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

type AnyMap = Record<string, any>;

export class QuotesCompatService {
  private readonly dataDir = join(process.cwd(), "data");
  private readonly storePath = join(this.dataDir, "quotes-store.json");

  private ensureStore() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    if (!existsSync(this.storePath)) {
      writeFileSync(
        this.storePath,
        JSON.stringify({ quotes: [] }, null, 2),
        "utf-8"
      );
    }
  }

  readStore(): AnyMap {
    this.ensureStore();

    try {
      const raw = readFileSync(this.storePath, "utf-8");
      const parsed = raw ? JSON.parse(raw) : { quotes: [] };

      if (Array.isArray(parsed)) {
        return { quotes: parsed };
      }

      if (!parsed || typeof parsed !== "object") {
        return { quotes: [] };
      }

      if (!Array.isArray(parsed.quotes)) {
        parsed.quotes = [];
      }

      return parsed;
    } catch {
      return { quotes: [] };
    }
  }

  writeStore(store: AnyMap) {
    this.ensureStore();
    writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf-8");
  }

  nextId(store: AnyMap): number {
    const ids = (store?.quotes ?? [])
      .map((q: AnyMap) => Number(q?.id) || 0)
      .filter((n: number) => Number.isFinite(n));

    return ids.length ? Math.max(...ids) + 1 : 1;
  }

  normalizeLineItems(body: AnyMap) {
    const items = Array.isArray(body?.lineItems)
      ? body.lineItems
      : Array.isArray(body?.items)
      ? body.items
      : [];

    return items.map((item: AnyMap, index: number) => ({
      id: item?.id ?? `line-${index + 1}`,
      description: String(item?.description ?? item?.name ?? "Line Item"),
      quantity: Number(item?.quantity ?? 1) || 1,
      unitPrice: Number(item?.unitPrice ?? item?.rate ?? 0) || 0,
      total:
        Number(
          item?.total ??
            (Number(item?.quantity ?? 1) || 1) *
              (Number(item?.unitPrice ?? item?.rate ?? 0) || 0)
        ) || 0,
    }));
  }

  buildQuote(body: AnyMap, id: number) {
    const now = new Date().toISOString();
    const pricing = body?.pricing ?? {};

    return {
      id,
      title: String(body?.title ?? body?.name ?? `Quote ${id}`),
      clientName: String(body?.clientName ?? "Unassigned Client"),
      contractCode: String(body?.contractCode ?? ""),
      billingMode: String(body?.billingMode ?? ""),
      payerSide: String(body?.payerSide ?? ""),
      verdict: String(body?.verdict ?? "QUOTE"),
      notes: String(body?.notes ?? ""),
      distanceKm: Number(body?.distanceKm ?? 0) || 0,
      actualWeightKg: Number(body?.actualWeightKg ?? 0) || 0,
      volumetricWeightKg: Number(body?.volumetricWeightKg ?? 0) || 0,
      remoteArea: !!body?.remoteArea,
      afterHours: !!body?.afterHours,
      pricing: {
        chargeableWeight: Number(pricing?.chargeableWeight ?? 0) || 0,
        baseFee: Number(pricing?.baseFee ?? 0) || 0,
        distanceCharge: Number(pricing?.distanceCharge ?? 0) || 0,
        weightCharge: Number(pricing?.weightCharge ?? 0) || 0,
        remoteFee: Number(pricing?.remoteFee ?? 0) || 0,
        afterHoursFee: Number(pricing?.afterHoursFee ?? 0) || 0,
        codExtraFee: Number(pricing?.codExtraFee ?? 0) || 0,
        subtotal: Number(pricing?.subtotal ?? 0) || 0,
        fuelSurcharge: Number(pricing?.fuelSurcharge ?? 0) || 0,
        totalExVat: Number(pricing?.totalExVat ?? 0) || 0,
        vat: Number(pricing?.vat ?? 0) || 0,
        total: Number(pricing?.total ?? body?.total ?? 0) || 0,
        estimatedInternalCost: Number(pricing?.estimatedInternalCost ?? 0) || 0,
        marginAmount: Number(pricing?.marginAmount ?? 0) || 0,
        marginPercent: Number(pricing?.marginPercent ?? 0) || 0,
        recommendedMinSellExVat:
          Number(pricing?.recommendedMinSellExVat ?? 0) || 0,
      },
      total: Number(pricing?.total ?? body?.total ?? 0) || 0,
      marginPercent: Number(pricing?.marginPercent ?? 0) || 0,
      lineItems: this.normalizeLineItems(body),
      source: "rate-cards-simulator",
      createdAt: now,
      updatedAt: now,
    };
  }
}
