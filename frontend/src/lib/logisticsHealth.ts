/**
 * Logistics analytics — honest rate/health helpers.
 *
 * Rule: with zero deliveries in the period there is nothing to rate, so
 * rates and the composite health score are null (rendered "Unavailable"),
 * never 0% failure-free perfection and never a default mid-range score.
 * A missing customer rating likewise contributes no score instead of an
 * invented default.
 */

export interface LogisticsHealthInputs {
  totalDeliveries: number;
  failedDeliveries: number;
  slaBreaches: number;
  onTimePercentage: number;
  customerRatingAvg: number | null;
}

/** (deliveries − failed) / deliveries, or null when there were no deliveries. */
export function deliverySuccessRate(totalDeliveries: number, failedDeliveries: number): number | null {
  if (!Number.isFinite(totalDeliveries) || totalDeliveries <= 0) return null;
  return ((totalDeliveries - failedDeliveries) / totalDeliveries) * 100;
}

/**
 * Weighted operational health (0–100), or null when the period has no
 * deliveries. Components without observations (customer rating) are
 * excluded and the remaining weights renormalised — no default scores.
 */
export function computeLogisticsHealthScore(s: LogisticsHealthInputs): number | null {
  if (!Number.isFinite(s.totalDeliveries) || s.totalDeliveries <= 0) return null;

  const components: { score: number; weight: number }[] = [
    { score: Math.min(s.onTimePercentage, 100), weight: 0.35 },
    {
      score: Math.max(0, 100 - (s.failedDeliveries / s.totalDeliveries) * 100 * 5),
      weight: 0.25,
    },
    {
      score: Math.max(0, 100 - (s.slaBreaches / s.totalDeliveries) * 100 * 3),
      weight: 0.2,
    },
  ];
  if (s.customerRatingAvg != null && Number.isFinite(s.customerRatingAvg)) {
    components.push({ score: (s.customerRatingAvg / 5) * 100, weight: 0.2 });
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight <= 0) return null;
  return Math.round(
    components.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight,
  );
}
