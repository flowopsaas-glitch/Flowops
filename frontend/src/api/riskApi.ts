import { api } from "./client";

export type ShipmentRisk = {
  shipmentId: number;
  riskScore: number;
  confidence: number;
  reasons: string[];
  computedAt: string;
};

export async function getShipmentRisk(shipmentId: number) {
  const res = await api.get<ShipmentRisk>(`/shipments-risk/${shipmentId}`);
  return res.data;
}

export async function recalcRisk(companyId?: number) {
  const res = await api.post(`/shipments-risk/recalculate`, null, {
    params: companyId ? { companyId } : {},
  });
  return res.data;
}