import { apiGet } from "./client";

/**
 * Dashboard API wrapper.
 * We keep response type loose because different backends may vary.
 */
export async function getDashboard(): Promise<any> {
  return apiGet<any>("/dashboard");
}
