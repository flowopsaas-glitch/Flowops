import { api } from "./client";

export type UsageMeter = {
  used: number;
  limit: number; // -1 = unlimited
  unlimited: boolean;
  remaining: number;
  atLimit: boolean;
};

export type Entitlements = {
  plan: "starter" | "professional" | "enterprise";
  effectivePlan: "starter" | "professional" | "enterprise" | "expired";
  planName: string;
  onTrial: boolean;
  trialExpired?: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  features: Record<string, boolean>;
  limits: { waybillsPerMonth: number; drivers: number; users: number; branches: number };
  usage: {
    waybillsThisMonth: UsageMeter;
    drivers: UsageMeter;
    users: UsageMeter;
    branches: UsageMeter;
  };
  message?: string;
};

export async function getEntitlements(): Promise<Entitlements> {
  const r = await api.get("/billing/entitlements");
  return r?.data ?? r;
}
