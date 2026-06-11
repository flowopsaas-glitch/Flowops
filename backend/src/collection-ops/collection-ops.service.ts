import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

type DriverRecord = {
  id: string;
  name: string;
  status: "AVAILABLE" | "ON_ROUTE" | "OFFLINE" | "ON_LEAVE";
  zone: string;
  vehicle: string;
  currentLoad: number;
};

type BillingType = "PREPAID" | "CONTRACT" | "COD";
type PayerSide = "SENDER" | "RECEIVER";
type PricingStatus = "UNRATED" | "RATED" | "NO_RATE_CARD" | "NEEDS_REVIEW";
type BillingStatus = "PENDING" | "READY_FOR_INVOICE" | "INVOICED" | "BATCHED" | "BLOCKED";
type ProofStatus = "PENDING" | "PARTIAL" | "RECEIVED";
type DeliveryStatus = "PENDING" | "IN_TRANSIT" | "AT_BRANCH" | "OUT_FOR_DELIVERY" | "DELIVERED";

type ProofImage = {
  id: string;
  kind: "POD" | "WAYBILL" | "PARCEL";
  source: "WHATSAPP" | "MANUAL" | "UPLOAD";
  url: string;
  note: string;
  createdAt: string;
};

type CollectionRequest = {
  id: string;
  customerName: string;
  companyName: string;
  phone: string;
  pickupAddress: string;
  zone: string;
  notes: string;
  source: "WHATSAPP" | "PORTAL" | "EMAIL" | "MANUAL";
  status: "NEW" | "OPS_REVIEW" | "OPS_CONFIRMED" | "DRIVER_ASSIGNED" | "COLLECTED";
  createdAt: string;
  requestedWindow: string;
  parcelsEstimate: number;
  aiPriority: "LOW" | "MEDIUM" | "HIGH";
  aiReason: string;
  assignedDriverId?: string | null;
  assignedDriverName?: string | null;
  billingType?: BillingType;
  contactPerson?: string;
  collectingFor?: string;
  deliveryCompanyName?: string;
  deliveryContactPerson?: string;
  deliveryPhone?: string;
  deliveryAddress?: string;
  clientId?: string | null;
  contractCode?: string | null;
  payerSide?: PayerSide | null;
  rateCardId?: string | null;
  serviceType?: string | null;
  quotedPrice?: number | null;
  ratedPrice?: number | null;
  pricingStatus?: PricingStatus;
  billingStatus?: BillingStatus;
  invoiceDraftId?: string | null;
  billingBatchId?: string | null;
  waybillId?: string | null;
  shipmentId?: string | null;
  billingAiSummary?: string | null;

  podImages?: ProofImage[];
  waybillImages?: ProofImage[];
  parcelImages?: ProofImage[];
  proofStatus?: ProofStatus;
  manifestId?: string | null;
  manifestReady?: boolean;
  destinationBranch?: string | null;
  destinationCity?: string | null;
  destinationZone?: string | null;
  transferBranch?: string | null;
  linehaulBatchId?: string | null;
  deliveryStatus?: DeliveryStatus;
  deliveredAt?: string | null;
  proofReceivedAt?: string | null;
};

type CreateManualCollectionInput = {
  customerName?: string;
  companyName?: string;
  phone?: string;
  pickupAddress?: string;
  zone?: string;
  notes?: string;
  requestedWindow?: string;
  parcelsEstimate?: number | string;
  billingType?: BillingType | string;
  contactPerson?: string;
  collectingFor?: string;
  deliveryCompanyName?: string;
  deliveryContactPerson?: string;
  deliveryPhone?: string;
  deliveryAddress?: string;
  destinationBranch?: string;
  destinationCity?: string;
  destinationZone?: string;
  transferBranch?: string;
};

type AddProofInput = {
  kind?: "POD" | "WAYBILL" | "PARCEL" | string;
  source?: "WHATSAPP" | "MANUAL" | "UPLOAD" | string;
  url?: string;
  note?: string;
};

type AnyRow = Record<string, any>;

@Injectable()
export class CollectionOpsService {
  private storePath(fileName: string) {
    return path.join(process.cwd(), "data", fileName);
  }

  private ensureJsonFile(fileName: string, fallback: any) {
    const p = this.storePath(fileName);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(fallback, null, 2), "utf-8");
    }
  }

  private readJson<T>(fileName: string, fallback: T): T {
    try {
      this.ensureJsonFile(fileName, fallback);
      return JSON.parse(fs.readFileSync(this.storePath(fileName), "utf-8")) as T;
    } catch {
      return fallback;
    }
  }

  private writeJson(fileName: string, value: any) {
    fs.mkdirSync(path.dirname(this.storePath(fileName)), { recursive: true });
    fs.writeFileSync(this.storePath(fileName), JSON.stringify(value, null, 2), "utf-8");
  }

  private asArray(input: any): any[] {
    if (Array.isArray(input)) return input;
    if (input && typeof input === "object") {
      for (const key of ["items", "rows", "drafts", "profiles", "clients", "rateCards", "ratecards", "data"]) {
        if (Array.isArray(input[key])) return input[key];
      }
    }
    return [];
  }

  private buildDefaultDrivers(): DriverRecord[] {
    return [
      { id: "DRV-001", name: "Mpho Ndlovu", status: "AVAILABLE", zone: "Johannesburg South", vehicle: "LDV 1", currentLoad: 1 },
      { id: "DRV-002", name: "Kabelo Maseko", status: "ON_ROUTE", zone: "Johannesburg Central", vehicle: "Bike 2", currentLoad: 4 },
      { id: "DRV-003", name: "Aisha Petersen", status: "AVAILABLE", zone: "East Rand", vehicle: "Van 3", currentLoad: 2 },
      { id: "DRV-004", name: "Sibusiso Khumalo", status: "OFFLINE", zone: "Pretoria", vehicle: "Van 4", currentLoad: 0 },
      { id: "DRV-005", name: "Lerato Dlamini", status: "AVAILABLE", zone: "Johannesburg North", vehicle: "LDV 5", currentLoad: 0 }
    ];
  }

  private buildDefaultRequests(): CollectionRequest[] {
    return [
      {
        id: "COL-1001",
        customerName: "Nadine Jacobs",
        companyName: "J/D Fasteners Polokwane",
        phone: "+27 82 555 1101",
        pickupAddress: "14 Forge Road, Jet Park",
        zone: "East Rand",
        notes: "4 cartons for same-day dispatch.",
        source: "WHATSAPP",
        status: "NEW",
        createdAt: new Date().toISOString(),
        requestedWindow: "09:00 - 11:00",
        parcelsEstimate: 4,
        aiPriority: "HIGH",
        aiReason: "Urgent WhatsApp request.",
        billingType: "CONTRACT",
        contactPerson: "Nadine Jacobs",
        collectingFor: "J/D Fasteners Polokwane",
        deliveryCompanyName: "FlowOps Linehaul",
        deliveryContactPerson: "Dispatch Desk",
        deliveryPhone: "+27 10 555 2100",
        deliveryAddress: "32 Logistics Avenue, Isando",
        destinationBranch: "Johannesburg Hub",
        destinationCity: "Johannesburg",
        destinationZone: "East Rand",
        transferBranch: "Main Hub"
      }
    ];
  }

  private loadDrivers(): DriverRecord[] {
    const fallback = this.buildDefaultDrivers();
    const data = this.readJson<any>("drivers-availability-store.json", fallback);
    return Array.isArray(data) ? data : fallback;
  }

  private saveDrivers(drivers: DriverRecord[]) {
    this.writeJson("drivers-availability-store.json", drivers);
  }

  private loadRequests(): CollectionRequest[] {
    const fallback = this.buildDefaultRequests();
    const data = this.readJson<any>("collection-ops-store.json", fallback);
    return Array.isArray(data) ? data : fallback;
  }

  private saveRequests(requests: CollectionRequest[]) {
    this.writeJson("collection-ops-store.json", requests);
  }

  private loadCommercialProfiles(): AnyRow[] {
    return this.asArray(this.readJson<any>("client-commercial.json", []));
  }

  private loadRateCards(): AnyRow[] {
    return this.asArray(this.readJson<any>("rate-card-store.json", []));
  }

  private nextId(requests: CollectionRequest[]) {
    const nums = requests
      .map((r) => Number(String(r.id || "").replace(/[^\d]/g, "")))
      .filter((n) => Number.isFinite(n));
    const max = nums.length ? Math.max(...nums) : 1000;
    return `COL-${max + 1}`;
  }

  private nextInvoiceDraftId() {
    return `INV-DRAFT-${Date.now()}`;
  }

  private normalizeText(value: any) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private fuzzyIncludes(a: any, b: any) {
    const aa = this.normalizeText(a);
    const bb = this.normalizeText(b);
    if (!aa || !bb) return false;
    return aa.includes(bb) || bb.includes(aa);
  }

  private normalBillingType(value?: string): BillingType {
    const v = String(value || "").trim().toUpperCase();
    if (v === "COD") return "COD";
    if (v === "PREPAID") return "PREPAID";
    return "CONTRACT";
  }

  private normalPayerSide(value?: string): PayerSide {
    return String(value || "").trim().toUpperCase() === "RECEIVER" ? "RECEIVER" : "SENDER";
  }

  private normalizeProofKind(value?: string): "POD" | "WAYBILL" | "PARCEL" {
    const v = String(value || "").trim().toUpperCase();
    if (v === "WAYBILL") return "WAYBILL";
    if (v === "PARCEL") return "PARCEL";
    return "POD";
  }

  private normalizeProofSource(value?: string): "WHATSAPP" | "MANUAL" | "UPLOAD" {
    const v = String(value || "").trim().toUpperCase();
    if (v === "WHATSAPP") return "WHATSAPP";
    if (v === "UPLOAD") return "UPLOAD";
    return "MANUAL";
  }

  private deriveDestinationBranch(item: CollectionRequest) {
    const manual = String(item.destinationBranch || "").trim();
    if (manual) return manual;

    const city = this.normalizeText(item.destinationCity || item.deliveryAddress || item.zone);
    if (city.includes("pretoria")) return "Pretoria Branch";
    if (city.includes("polokwane")) return "Polokwane Branch";
    if (city.includes("cape")) return "Cape Town Branch";
    if (city.includes("durban")) return "Durban Branch";
    if (city.includes("east rand")) return "East Rand Branch";
    return "Johannesburg Hub";
  }

  private deriveDestinationCity(item: CollectionRequest) {
    const manual = String(item.destinationCity || "").trim();
    if (manual) return manual;

    const address = String(item.deliveryAddress || item.zone || "").toLowerCase();
    if (address.includes("pretoria")) return "Pretoria";
    if (address.includes("polokwane")) return "Polokwane";
    if (address.includes("sandton")) return "Johannesburg";
    if (address.includes("jet park")) return "Johannesburg";
    return "Johannesburg";
  }

  private deriveDestinationZone(item: CollectionRequest) {
    const manual = String(item.destinationZone || "").trim();
    if (manual) return manual;

    if (item.zone) return item.zone;
    return "General";
  }

  private buildAiForManual(input: CreateManualCollectionInput) {
    const notes = String(input.notes || "").toLowerCase();
    const window = String(input.requestedWindow || "").toLowerCase();
    const parcels = Number(input.parcelsEstimate || 0);
    const billingType = this.normalBillingType(input.billingType);

    if (notes.includes("urgent") || notes.includes("same day") || window.includes("asap") || parcels >= 10) {
      return {
        aiPriority: "HIGH" as const,
        aiReason: "Manual request flagged as urgent due to notes, time pressure, or high parcel volume."
      };
    }
    if (billingType === "COD" || parcels >= 4) {
      return {
        aiPriority: "MEDIUM" as const,
        aiReason: "Manual request requires ops attention due to COD billing or moderate parcel volume."
      };
    }
    return {
      aiPriority: "LOW" as const,
      aiReason: "Manual request appears straightforward and suitable for normal ops confirmation flow."
    };
  }

  private rateCardBaseAmount(card: AnyRow): number {
    const candidates = [card.baseRate, card.base_rate, card.price, card.amount]
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0);
    return candidates.length ? candidates[0] : 85;
  }

  private enrichBillingFields(item: CollectionRequest): CollectionRequest {
    const commercial = this.loadCommercialProfiles();
    const rateCards = this.loadRateCards();

    const itemNameA = this.normalizeText(item.companyName);
    const itemNameB = this.normalizeText(item.collectingFor);
    const itemBilling = this.normalBillingType(item.billingType);

    const match = commercial.find((row) => {
      const rowNames = [row.clientName, row.companyName, row.customerName].map((v) => this.normalizeText(v));
      return rowNames.includes(itemNameA) || (itemNameB && rowNames.includes(itemNameB));
    });

    const clientId = match ? String(match.clientId ?? match.id ?? match.clientName ?? match.companyName ?? match.customerName ?? item.companyName) : (item.clientId ?? this.normalizeText(item.companyName || item.collectingFor || "") ?? null);
    const contractCode = String(match?.contractCode ?? match?.contract_code ?? item.contractCode ?? "").trim() || (itemBilling === "CONTRACT" ? "Q94" : null);
    const payerSide = this.normalPayerSide(String(match?.payerSide ?? match?.payer_side ?? item.payerSide ?? "SENDER"));
    const preferredServiceType = String(match?.serviceType ?? match?.service_type ?? item.serviceType ?? "STANDARD").trim() || "STANDARD";
    const rateCardIdFromProfile = String(match?.rateCardId ?? match?.rate_card_id ?? item.rateCardId ?? "").trim() || null;

    const quotedPriceCandidates = [
      Number(match?.quotedPrice),
      Number(match?.quoted_price),
      Number(match?.ratedPrice),
      Number(match?.rated_price),
      Number(item.quotedPrice)
    ].filter((v) => Number.isFinite(v) && v > 0);

    let pickedRateCard: AnyRow | undefined;

    if (rateCardIdFromProfile) {
      pickedRateCard = rateCards.find((r) => String(r.id ?? "") === rateCardIdFromProfile);
    }

    if (!pickedRateCard) {
      pickedRateCard = rateCards.find((r) => {
        const rateZone = this.normalizeText(r.zone);
        const billingMatch = !r.billingType && !r.billing_mode
          ? true
          : this.normalBillingType(String(r.billingType ?? r.billing_mode ?? "")) === itemBilling;
        const serviceMatch = !r.serviceType && !r.service_type
          ? true
          : this.normalizeText(r.serviceType ?? r.service_type) === this.normalizeText(preferredServiceType);

        const zoneMatch =
          !rateZone ||
          rateZone === this.normalizeText(item.zone) ||
          rateZone === this.normalizeText(item.destinationZone) ||
          this.fuzzyIncludes(rateZone, item.zone) ||
          this.fuzzyIncludes(rateZone, item.destinationZone) ||
          this.fuzzyIncludes(rateZone, item.destinationCity) ||
          this.fuzzyIncludes(rateZone, item.destinationBranch);

        return zoneMatch && billingMatch && serviceMatch;
      });
    }

    const ratedPrice = pickedRateCard
      ? this.rateCardBaseAmount(pickedRateCard) + Math.max(0, (item.parcelsEstimate || 1) - 1) * 12
      : quotedPriceCandidates.length
        ? quotedPriceCandidates[0]
        : itemBilling === "COD"
          ? 95 + Math.max(0, (item.parcelsEstimate || 1) - 1) * 10
          : itemBilling === "PREPAID"
            ? 75 + Math.max(0, (item.parcelsEstimate || 1) - 1) * 8
            : 85 + Math.max(0, (item.parcelsEstimate || 1) - 1) * 9;

    const quotedPrice = quotedPriceCandidates.length > 0 ? quotedPriceCandidates[0] : ratedPrice;

    let pricingStatus: PricingStatus = pickedRateCard ? "RATED" : "NEEDS_REVIEW";
    let billingStatus: BillingStatus = "PENDING";
    const aiBits: string[] = [];

    if (!pickedRateCard) {
      aiBits.push("No exact rate card match. Fallback pricing applied.");
    }

    if (!contractCode && itemBilling === "CONTRACT") {
      pricingStatus = pricingStatus === "RATED" ? "NEEDS_REVIEW" : pricingStatus;
      billingStatus = "BLOCKED";
      aiBits.push("Missing contract code for contract billing.");
    }

    if (item.status === "OPS_CONFIRMED" || item.status === "DRIVER_ASSIGNED" || item.status === "COLLECTED") {
      if (pricingStatus === "RATED" && !(itemBilling === "CONTRACT" && !contractCode)) {
        billingStatus = item.invoiceDraftId ? "INVOICED" : "READY_FOR_INVOICE";
      }
    }

    const invoiceDraftId =
      billingStatus === "READY_FOR_INVOICE" || item.billingStatus === "INVOICED" || item.billingStatus === "BATCHED"
        ? item.invoiceDraftId || this.nextInvoiceDraftId()
        : item.invoiceDraftId || null;

    const podImages = Array.isArray(item.podImages) ? item.podImages : [];
    const waybillImages = Array.isArray(item.waybillImages) ? item.waybillImages : [];
    const parcelImages = Array.isArray(item.parcelImages) ? item.parcelImages : [];

    const proofCount = podImages.length + waybillImages.length + parcelImages.length;
    const proofStatus: ProofStatus =
      proofCount === 0 ? "PENDING" : podImages.length > 0 && waybillImages.length > 0 ? "RECEIVED" : "PARTIAL";

    const billingAiSummary =
      aiBits.length > 0
        ? aiBits.join(" ")
        : pricingStatus === "RATED"
          ? "Collection is billing-linked and ready for invoice flow."
          : "Collection is billing-linked and ready for the next operational step.";

    const destinationCity = String(item.destinationCity || "").trim() || this.deriveDestinationCity(item);
    const destinationZone = String(item.destinationZone || "").trim() || this.deriveDestinationZone(item);
    const destinationBranch = String(item.destinationBranch || "").trim() || this.deriveDestinationBranch({ ...item, destinationCity, destinationZone });

    const manifestReady =
      !!destinationBranch &&
      !!destinationCity &&
      !!destinationZone &&
      (
        item.status === "OPS_CONFIRMED" ||
        item.status === "DRIVER_ASSIGNED" ||
        item.status === "COLLECTED" ||
        !!item.assignedDriverId ||
        !!item.assignedDriverName
      );

    const manifestId = manifestReady ? item.manifestId || `MAN-${destinationBranch.replace(/\s+/g, "-").toUpperCase()}-${item.id}` : item.manifestId || null;
    const linehaulBatchId = manifestReady ? item.linehaulBatchId || `LH-${destinationBranch.replace(/\s+/g, "-").toUpperCase()}` : item.linehaulBatchId || null;

    const deliveryStatus: DeliveryStatus =
      item.status === "COLLECTED"
        ? "AT_BRANCH"
        : item.status === "DRIVER_ASSIGNED"
          ? "IN_TRANSIT"
          : item.deliveryStatus || "PENDING";

    return {
      ...item,
      billingType: itemBilling,
      clientId,
      contractCode,
      payerSide,
      rateCardId: pickedRateCard ? String(pickedRateCard.id ?? rateCardIdFromProfile ?? "") || "AUTO-RATE" : rateCardIdFromProfile || "AUTO-RATE",
      serviceType: preferredServiceType,
      quotedPrice: quotedPrice ?? null,
      ratedPrice: ratedPrice ?? null,
      pricingStatus,
      billingStatus,
      invoiceDraftId,
      billingBatchId: item.billingBatchId ?? null,
      waybillId: item.waybillId ?? ((item.status === "DRIVER_ASSIGNED" || item.status === "COLLECTED") ? `WB-${item.id}` : null),
      shipmentId: item.shipmentId ?? ((item.status === "DRIVER_ASSIGNED" || item.status === "COLLECTED") ? `SHP-${item.id}` : null),
      billingAiSummary,
      podImages,
      waybillImages,
      parcelImages,
      proofStatus,
      proofReceivedAt: proofStatus === "RECEIVED" ? item.proofReceivedAt || new Date().toISOString() : item.proofReceivedAt || null,
      destinationCity,
      destinationZone,
      destinationBranch,
      transferBranch: item.transferBranch || destinationBranch,
      manifestReady,
      manifestId,
      linehaulBatchId,
      deliveryStatus,
      deliveredAt: item.deliveredAt || null
    };
  }

  private sortPriority(input: CollectionRequest[]) {
    const score = (r: CollectionRequest) => {
      const p = r.aiPriority === "HIGH" ? 3 : r.aiPriority === "MEDIUM" ? 2 : 1;
      const s = r.status === "NEW" ? 5 : r.status === "OPS_REVIEW" ? 4 : r.status === "OPS_CONFIRMED" ? 3 : r.status === "DRIVER_ASSIGNED" ? 2 : 1;
      const bill = r.billingStatus === "BLOCKED" ? 3 : r.billingStatus === "READY_FOR_INVOICE" ? 2 : 1;
      const proof = r.proofStatus === "PENDING" ? 2 : r.proofStatus === "PARTIAL" ? 1 : 0;
      return p * 10 + s + bill + proof;
    };
    return [...input].sort((a, b) => score(b) - score(a));
  }

  private enrichAllRequests(requests: CollectionRequest[]) {
    const enriched = requests.map((r) => this.enrichBillingFields(r));
    this.saveRequests(enriched);
    return enriched;
  }

  getDashboard() {
    const requests = this.sortPriority(this.enrichAllRequests(this.loadRequests()));
    const drivers = this.loadDrivers();

    const availableDrivers = drivers.filter((d) => d.status === "AVAILABLE");
    const whatsappQueue = requests.filter((r) => r.source === "WHATSAPP");
    const opsReview = requests.filter((r) => r.status === "NEW" || r.status === "OPS_REVIEW");
    const readyForInvoice = requests.filter((r) => r.billingStatus === "READY_FOR_INVOICE");
    const blockedBilling = requests.filter((r) => r.billingStatus === "BLOCKED");
    const manifestReady = requests.filter((r) => r.manifestReady);
    const proofPending = requests.filter((r) => r.proofStatus !== "RECEIVED");

    const destinationBuckets = Array.from(
      requests.reduce((map, item) => {
        const branch = item.destinationBranch || this.deriveDestinationBranch(item) || "Unknown Branch";
        const city = item.destinationCity || this.deriveDestinationCity(item) || "Unknown City";
        const zone = item.destinationZone || this.deriveDestinationZone(item) || "Unknown Zone";

        const key = `${branch}|${city}|${zone}`;
        const current = map.get(key) || {
          destinationBranch: branch,
          destinationCity: city,
          destinationZone: zone,
          count: 0
        };

        current.count += 1;
        map.set(key, current);
        return map;
      }, new Map<string, { destinationBranch: string; destinationCity: string; destinationZone: string; count: number }>())
      .values()
    ).sort((a, b) => b.count - a.count);

    return {
      ok: true,
      summary: {
        totalRequests: requests.length,
        whatsappRequests: whatsappQueue.length,
        opsReviewQueue: opsReview.length,
        availableDrivers: availableDrivers.length,
        totalDrivers: drivers.length,
        aiEscalations: requests.filter((r) => r.aiPriority === "HIGH").length,
        invoiceReady: readyForInvoice.length,
        billingBlocked: blockedBilling.length,
        manifestReady: manifestReady.length,
        proofPending: proofPending.length
      },
      aiSupervisor: {
        status: "ACTIVE",
        message: "Collections now track POD proof, waybill proof, manifest readiness, destination sorting, and late-invoice support links.",
        nextAction: proofPending.length > 0
          ? "Collect missing POD and waybill proof first, then print branch manifests."
          : manifestReady.length > 0
            ? "Print manifests and sort branch transfers by destination."
            : "Queue is stable. Monitor pricing, proof intake, and destination flows."
      },
      requests,
      drivers,
      destinationBuckets
    };
  }

  getDriverAvailability() {
    const drivers = this.loadDrivers();
    return { ok: true, drivers, availableNow: drivers.filter((d) => d.status === "AVAILABLE").length };
  }

  getWhatsAppIntake() {
    const requests = this.enrichAllRequests(this.loadRequests()).filter((r) => r.source === "WHATSAPP");
    return { ok: true, requests: this.sortPriority(requests) };
  }

  createManualCollection(input: CreateManualCollectionInput) {
    const requests = this.loadRequests();

    const companyName = String(input.companyName || "").trim();
    const customerName = String(input.customerName || "").trim();
    const pickupAddress = String(input.pickupAddress || "").trim();
    const zone = String(input.zone || "").trim();

    if (!companyName || !customerName || !pickupAddress || !zone) {
      return { ok: false, message: "Company name, customer name, pickup address, and zone are required." };
    }

    const ai = this.buildAiForManual(input);

    const item: CollectionRequest = {
      id: this.nextId(requests),
      customerName,
      companyName,
      phone: String(input.phone || "").trim(),
      pickupAddress,
      zone,
      notes: String(input.notes || "").trim(),
      source: "MANUAL",
      status: "NEW",
      createdAt: new Date().toISOString(),
      requestedWindow: String(input.requestedWindow || "08:00 - 17:00").trim(),
      parcelsEstimate: Math.max(1, Number(input.parcelsEstimate || 1)),
      aiPriority: ai.aiPriority,
      aiReason: ai.aiReason,
      assignedDriverId: null,
      assignedDriverName: null,
      billingType: this.normalBillingType(input.billingType),
      contactPerson: String(input.contactPerson || customerName).trim(),
      collectingFor: String(input.collectingFor || companyName).trim(),
      deliveryCompanyName: String(input.deliveryCompanyName || "").trim(),
      deliveryContactPerson: String(input.deliveryContactPerson || "").trim(),
      deliveryPhone: String(input.deliveryPhone || "").trim(),
      deliveryAddress: String(input.deliveryAddress || "").trim(),
      destinationBranch: String(input.destinationBranch || "").trim() || null,
      destinationCity: String(input.destinationCity || "").trim() || null,
      destinationZone: String(input.destinationZone || "").trim() || null,
      transferBranch: String(input.transferBranch || "").trim() || null,
      clientId: null,
      contractCode: null,
      payerSide: "SENDER",
      rateCardId: null,
      serviceType: "STANDARD",
      quotedPrice: null,
      ratedPrice: null,
      pricingStatus: "UNRATED",
      billingStatus: "PENDING",
      invoiceDraftId: null,
      billingBatchId: null,
      waybillId: null,
      shipmentId: null,
      billingAiSummary: null,
      podImages: [],
      waybillImages: [],
      parcelImages: [],
      proofStatus: "PENDING",
      manifestId: null,
      manifestReady: false,
      linehaulBatchId: null,
      deliveryStatus: "PENDING",
      deliveredAt: null,
      proofReceivedAt: null
    };

    const enriched = this.enrichBillingFields(item);
    requests.unshift(enriched);
    this.saveRequests(requests);

    return { ok: true, message: "Manual collection created successfully.", request: enriched };
  }

  addProofImage(requestId: string, input: AddProofInput) {
    const requests = this.loadRequests();
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx < 0) return { ok: false, message: "Collection request not found." };

    const kind = this.normalizeProofKind(input.kind);
    const source = this.normalizeProofSource(input.source);
    const image: ProofImage = {
      id: `IMG-${Date.now()}`,
      kind,
      source,
      url: String(input.url || `proof:/${requestId}/${kind.toLowerCase()}/${Date.now()}`),
      note: String(input.note || ""),
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(requests[idx].podImages)) requests[idx].podImages = [];
    if (!Array.isArray(requests[idx].waybillImages)) requests[idx].waybillImages = [];
    if (!Array.isArray(requests[idx].parcelImages)) requests[idx].parcelImages = [];

    if (kind === "POD") requests[idx].podImages!.push(image);
    if (kind === "WAYBILL") requests[idx].waybillImages!.push(image);
    if (kind === "PARCEL") requests[idx].parcelImages!.push(image);

    requests[idx] = this.enrichBillingFields(requests[idx]);
    this.saveRequests(requests);

    return { ok: true, message: `${kind} proof added successfully.`, request: requests[idx], image };
  }

  confirmOps(requestId: string) {
    const requests = this.loadRequests();
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx < 0) return { ok: false, message: "Collection request not found." };

    requests[idx].status = "OPS_CONFIRMED";
    if (!requests[idx].aiReason) requests[idx].aiReason = "Ops confirmed request for dispatch readiness.";
    requests[idx] = this.enrichBillingFields(requests[idx]);
    this.saveRequests(requests);

    return { ok: true, message: "Collection request confirmed by ops.", request: requests[idx] };
  }

  assignDriver(requestId: string, driverId: string) {
    const requests = this.loadRequests();
    const drivers = this.loadDrivers();

    const requestIndex = requests.findIndex((r) => r.id === requestId);
    if (requestIndex < 0) return { ok: false, message: "Collection request not found." };

    const driver = drivers.find((d) => d.id === driverId);
    if (!driver) return { ok: false, message: "Driver not found." };
    if (driver.status !== "AVAILABLE") return { ok: false, message: "Selected driver is not currently available." };

    const oldDriverId = requests[requestIndex].assignedDriverId;
    if (oldDriverId) {
      const oldDriver = drivers.find((d) => d.id === oldDriverId);
      if (oldDriver && oldDriver.id !== driver.id) {
        oldDriver.status = "AVAILABLE";
        oldDriver.currentLoad = Math.max(0, Number(oldDriver.currentLoad || 0) - 1);
      }
    }

    requests[requestIndex].status = "DRIVER_ASSIGNED";
    requests[requestIndex].assignedDriverId = driver.id;
    requests[requestIndex].assignedDriverName = driver.name;
    requests[requestIndex] = this.enrichBillingFields(requests[requestIndex]);

    driver.status = "ON_ROUTE";
    driver.currentLoad = Number(driver.currentLoad || 0) + 1;

    this.saveRequests(requests);
    this.saveDrivers(drivers);

    return { ok: true, message: `Driver ${driver.name} assigned successfully.`, request: requests[requestIndex], driver };
  }

  releaseDriver(requestId: string) {
    const requests = this.loadRequests();
    const drivers = this.loadDrivers();

    const requestIndex = requests.findIndex((r) => r.id === requestId);
    if (requestIndex < 0) {
      return { ok: false, message: "Collection request not found." };
    }

    const request = requests[requestIndex];
    if (!request.assignedDriverId) {
      return { ok: false, message: "No driver is assigned to this collection." };
    }

    const driver = drivers.find((d) => d.id === request.assignedDriverId);
    if (driver) {
      driver.status = "AVAILABLE";
      driver.currentLoad = Math.max(0, Number(driver.currentLoad || 0) - 1);
    }

    request.assignedDriverId = null;
    request.assignedDriverName = null;
    request.status = "OPS_CONFIRMED";
    requests[requestIndex] = this.enrichBillingFields(request);

    this.saveRequests(requests);
    this.saveDrivers(drivers);

    return {
      ok: true,
      message: "Driver released successfully.",
      request: requests[requestIndex],
      driver: driver || null
    };
  }

  setDriverStatus(driverId: string, status: "AVAILABLE" | "ON_ROUTE" | "OFFLINE" | "ON_LEAVE") {
    const drivers = this.loadDrivers();
    const driver = drivers.find((d) => d.id === driverId);

    if (!driver) {
      return { ok: false, message: "Driver not found." };
    }

    driver.status = status;

    if (status === "AVAILABLE" && Number(driver.currentLoad || 0) < 0) {
      driver.currentLoad = 0;
    }

    if ((status === "OFFLINE" || status === "ON_LEAVE") && Number(driver.currentLoad || 0) < 0) {
      driver.currentLoad = 0;
    }

    this.saveDrivers(drivers);

    return {
      ok: true,
      message: `Driver ${driver.name} set to ${status}.`,
      driver
    };
  }

  cycleDriverStatus(driverId: string) {
    const drivers = this.loadDrivers();
    const driver = drivers.find((d) => d.id === driverId);

    if (!driver) {
      return { ok: false, message: "Driver not found." };
    }

    const order = ["AVAILABLE", "ON_ROUTE", "OFFLINE", "ON_LEAVE"];
    const idx = order.indexOf(driver.status);
    const next = order[(idx + 1) % order.length] as "AVAILABLE" | "ON_ROUTE" | "OFFLINE" | "ON_LEAVE";
    driver.status = next;

    if (next === "AVAILABLE" && Number(driver.currentLoad || 0) < 0) {
      driver.currentLoad = 0;
    }

    this.saveDrivers(drivers);

    return {
      ok: true,
      message: `Driver ${driver.name} moved to ${next}.`,
      driver
    };
  }
}
