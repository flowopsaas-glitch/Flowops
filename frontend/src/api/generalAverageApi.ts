import { api } from "./client";

/**
 * General Average.
 *
 * Types mirror `backend/src/general-average/dto/general-average.dto.ts` and the
 * Prisma models. They are hand-written rather than generated so a backend field
 * rename breaks `tsc` here instead of rendering `undefined` in a money column.
 */

const unwrap = <T>(r: unknown): T => ((r as { data?: T } | null)?.data ?? r) as T;

export type GaStatus = "DECLARED" | "SECURING" | "SECURED" | "ADJUSTED" | "SETTLED" | "CLOSED";
export type GaSecurity = "AVERAGE_BOND" | "INSURER_GUARANTEE" | "CASH_DEPOSIT";
export type GaValueBasis = "CIF" | "DECLARED" | "ADJUSTED";

export const GA_STATUS_LABEL: Record<GaStatus, string> = {
  DECLARED: "Declared",
  SECURING: "Securing",
  SECURED: "Secured",
  ADJUSTED: "Adjusted",
  SETTLED: "Settled",
  CLOSED: "Closed",
};

export const GA_SECURITY_LABEL: Record<GaSecurity, string> = {
  AVERAGE_BOND: "Average bond",
  INSURER_GUARANTEE: "Insurer guarantee",
  CASH_DEPOSIT: "Cash deposit",
};

export interface GaContributor {
  id: string;
  eventId: string;
  shipmentFileId: string;
  contributoryValue: number;
  valueBasis: GaValueBasis;
  adjustedValue?: number | null;
  sharePct?: number | null;
  estimatedContribution?: number | null;
  assessedContribution?: number | null;
  securityType?: GaSecurity | null;
  securityAmount?: number | null;
  securityRef?: string | null;
  securityLodgedAt?: string | null;
  releasedAt?: string | null;
  releasedBy?: string | null;
  balanceDue?: number | null;
  settledAt?: string | null;
  notes?: string | null;
  shipmentFile?: {
    id: string;
    fileNumber: string;
    consigneeName?: string | null;
    pod?: string | null;
  } | null;
}

export interface GaEvent {
  id: string;
  vesselName: string;
  vesselImo?: string | null;
  vesselMmsi?: string | null;
  voyageNumber?: string | null;
  occurredAt: string;
  portOfRefuge?: string | null;
  nature: string;
  declaredBy?: string | null;
  declaredAt?: string | null;
  adjusterName?: string | null;
  adjusterRef?: string | null;
  totalExpenditure: number;
  totalSacrifice: number;
  currency: string;
  status: GaStatus;
  notes?: string | null;
  createdAt: string;
  contributors?: GaContributor[];
  _count?: { contributors: number };
}

export interface GaCandidate {
  shipmentFileId: string;
  fileNumber: string;
  consigneeName?: string | null;
  pod?: string | null;
  incoterm?: string | null;
  suggestedValue: number;
  basis: "CIF";
  /** True when the incoterm is not CIF/CIP, or the cargo has no value. */
  needsReview: boolean;
}

export interface GaDiscoverResult {
  candidates: GaCandidate[];
  matchedOn: "voyage" | "imo" | "mmsi" | "nothing";
}

export interface CreateGaEventInput {
  vesselName: string;
  nature: string;
  occurredAt: string;
  vesselImo?: string;
  vesselMmsi?: string;
  voyageNumber?: string;
  portOfRefuge?: string;
  declaredBy?: string;
  declaredAt?: string;
  adjusterName?: string;
  adjusterRef?: string;
  totalExpenditure?: number;
  totalSacrifice?: number;
  currency?: string;
  notes?: string;
}

export interface AddContributorInput {
  shipmentFileId: string;
  contributoryValue: number;
  valueBasis?: GaValueBasis;
  notes?: string;
}

export interface LodgeSecurityInput {
  securityType: GaSecurity;
  amount: number;
  reference?: string;
}

export interface AwardContributionInput {
  contributorId: string;
  assessedContribution: number;
  adjustedValue?: number;
}

export interface RecordAwardInput {
  contributions: AwardContributionInput[];
  adjusterName?: string;
  adjusterRef?: string;
}

export const listGaEvents = async (): Promise<GaEvent[]> =>
  unwrap<GaEvent[]>(await api.get("/general-average/events"));

export const createGaEvent = async (input: CreateGaEventInput): Promise<GaEvent> =>
  unwrap<GaEvent>(await api.post("/general-average/events", input));

export const getGaEvent = async (id: string): Promise<GaEvent> =>
  unwrap<GaEvent>(await api.get(`/general-average/events/${id}`));

export const updateGaEvent = async (
  id: string,
  input: Partial<CreateGaEventInput> & { status?: GaStatus },
): Promise<GaEvent> =>
  unwrap<GaEvent>(await api.patch(`/general-average/events/${id}`, input));

export const discoverGaContributors = async (id: string): Promise<GaDiscoverResult> =>
  unwrap<GaDiscoverResult>(await api.get(`/general-average/events/${id}/candidates`));

export const addGaContributor = async (
  id: string,
  input: AddContributorInput,
): Promise<GaContributor> =>
  unwrap<GaContributor>(await api.post(`/general-average/events/${id}/contributors`, input));

export const lodgeGaSecurity = async (
  id: string,
  contributorId: string,
  input: LodgeSecurityInput,
): Promise<GaEvent> =>
  unwrap<GaEvent>(
    await api.post(`/general-average/events/${id}/contributors/${contributorId}/security`, input),
  );

/**
 * Record cargo release.
 *
 * The server refuses this unless security is on record. The UI disables the
 * button too, but that is a courtesy — the gate that counts is in the service.
 */
export const releaseGaCargo = async (id: string, contributorId: string): Promise<GaEvent> =>
  unwrap<GaEvent>(
    await api.post(`/general-average/events/${id}/contributors/${contributorId}/release`),
  );

export const recordGaAward = async (id: string, input: RecordAwardInput): Promise<GaEvent> =>
  unwrap<GaEvent>(await api.post(`/general-average/events/${id}/award`, input));

export const settleGaEvent = async (id: string): Promise<GaEvent> =>
  unwrap<GaEvent>(await api.post(`/general-average/events/${id}/settle`));
