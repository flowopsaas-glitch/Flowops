import { apiPost } from "./client";

export type ShipmentsCopilotResponse = {
  summary: string;
  actions?: string[];
};

export async function shipmentsCopilot(input: any) {
  return apiPost<ShipmentsCopilotResponse>("/ai/shipments-copilot", input);
}
