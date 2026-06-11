import { Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  companyId?: number;
  role?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

const EXEMPT_MODELS = new Set(["Company", "User"]);

const TENANT_MODELS = new Set([
  "Client",
  "Courier",
  "Branch",
  "Driver",
  "RateCard",
  "Collection",
  "Waybill",
  "Dispatch",
  "BillingBatch",
  "EmailHubItem",
  "WhatsAppLog",
  "WaybillInboxItem",
  "WaybillDraft",
  "Parcel",
  "InvoiceDraft",
  "InvoiceDraftLine",
  "Invoice",
  "InvoiceItem",
  "AiEvent",
  "AiAuditLog",
  "AiSystemLog",
  "ActivityLog",
  "LinehaulManifest",
  "Manifest",
  "Lead",
  "Hardware",
  "Communication",
  "Inventory",
]);

export const tenantMiddleware: Prisma.Middleware = async (params, next) => {
  const store = requestContextStorage.getStore();
  if (!store) return next(params);
  if (EXEMPT_MODELS.has(params.model)) return next(params);
  if (!TENANT_MODELS.has(params.model)) return next(params);
  if (store.role === "SUPER_ADMIN") return next(params);

  const companyId = store.companyId;
  if (!companyId) return next(params);

  switch (params.action) {
    case "findUnique":
    case "findFirst":
      params.args.where = { ...params.args.where, companyId };
      break;
    case "findMany":
      if (!params.args.where) params.args.where = {};
      if (!params.args.where.companyId) params.args.where.companyId = companyId;
      break;
    case "create":
      params.args.data = { ...params.args.data, companyId };
      break;
    case "update":
    case "upsert":
      if (params.args.where) {
        params.args.where.companyId = companyId;
      } else {
        params.args.where = { companyId };
      }
      if (params.args.data) delete params.args.data.companyId;
      break;
    case "updateMany":
    case "delete":
    case "deleteMany":
      if (!params.args.where) params.args.where = {};
      params.args.where.companyId = companyId;
      break;
    case "count":
    case "aggregate":
    case "groupBy":
      if (!params.args.where) params.args.where = {};
      params.args.where.companyId = companyId;
      break;
  }

  return next(params);
};
