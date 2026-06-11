import { apiGet } from "./client";

export type LiveShipmentsResponse = {
  items: any[];
  total?: number;
};

export async function getLiveShipments() {
  return apiGet<LiveShipmentsResponse>("/shipments/live");
}
