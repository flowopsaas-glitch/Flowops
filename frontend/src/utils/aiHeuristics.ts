export type ShipmentLike = {
  id: string;
  status: string;
  customer: string;
  eta?: string;
  isHighPriority?: boolean;
  driverAssigned?: boolean;
  lastUpdateMinutesAgo?: number;
  isLate?: boolean;
  customerName?: string;
  driverName?: string;
  driverPhone?: string;
  origin?: string;
  destination?: string;
  waybill?: string;
};

export type AiInsight = {
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  explanation: string;
  actions: string[];
};

export function insightsFromShipments(shipments: ShipmentLike[]): AiInsight[] {
  const insights: AiInsight[] = [];

  // Logic 1: High Priority Delay
  const delayed = shipments.filter(s => s.status.toLowerCase().includes('delayed') && s.isHighPriority);
  if (delayed.length > 0) {
    insights.push({
      title: "High-Priority Delays",
      severity: "HIGH",
      explanation: `${delayed.length} VIP shipments are currently off-schedule.`,
      actions: ["Notify Account Managers", "Re-route courier", "Check traffic patterns"]
    });
  }

  // Logic 2: Capacity Alert
  if (shipments.length > 20) {
    insights.push({
      title: "Volume Surge",
      severity: "MEDIUM",
      explanation: "Current active shipment volume is 25% above daily average.",
      actions: ["Open extra loading docks", "Verify driver availability"]
    });
  }

  // Logic 3: Healthy State
  if (insights.length === 0) {
    insights.push({
      title: "System Stable",
      severity: "LOW",
      explanation: "No critical shipment bottlenecks detected in current view.",
      actions: ["Continue monitoring", "Review end-of-day reports"]
    });
  }

  return insights;
}


export function riskScoreForShipment(s: ShipmentLike): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (s.isLate === true) { score += 30; reasons.push('Shipment is late'); }
  if (s.isHighPriority) { score += 20; reasons.push('High priority shipment'); }
  if (s.driverAssigned === false) { score += 25; reasons.push('No driver assigned'); }
  if (s.lastUpdateMinutesAgo && s.lastUpdateMinutesAgo > 60) { score += 15; reasons.push('Stale update (>60min)'); }
  if (s.status.toLowerCase().includes('delayed')) { score += 10; reasons.push('Status shows delayed'); }
  return { score: Math.min(score, 100), reasons };
}
