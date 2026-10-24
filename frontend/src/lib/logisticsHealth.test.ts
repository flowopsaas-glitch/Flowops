import { describe, expect, it } from "vitest";
import { computeLogisticsHealthScore, deliverySuccessRate } from "./logisticsHealth";

describe("deliverySuccessRate", () => {
  it("is unavailable (null) with zero deliveries — never 100%", () => {
    expect(deliverySuccessRate(0, 0)).toBeNull();
  });

  it("computes from the real denominator", () => {
    expect(deliverySuccessRate(200, 5)).toBe(97.5);
    expect(deliverySuccessRate(10, 10)).toBe(0);
  });
});

describe("computeLogisticsHealthScore", () => {
  it("is unavailable (null) with zero deliveries", () => {
    expect(
      computeLogisticsHealthScore({
        totalDeliveries: 0,
        failedDeliveries: 0,
        slaBreaches: 0,
        onTimePercentage: 0,
        customerRatingAvg: null,
      }),
    ).toBeNull();
  });

  it("does not invent a rating score when no ratings exist", () => {
    const withRating = computeLogisticsHealthScore({
      totalDeliveries: 100,
      failedDeliveries: 0,
      slaBreaches: 0,
      onTimePercentage: 100,
      customerRatingAvg: 5,
    });
    const withoutRating = computeLogisticsHealthScore({
      totalDeliveries: 100,
      failedDeliveries: 0,
      slaBreaches: 0,
      onTimePercentage: 100,
      customerRatingAvg: null,
    });
    // Perfect operations score the same with or without ratings data;
    // previously a missing rating silently contributed a default 70.
    expect(withRating).toBe(100);
    expect(withoutRating).toBe(100);
  });

  it("penalises failures against the real denominator", () => {
    const score = computeLogisticsHealthScore({
      totalDeliveries: 100,
      failedDeliveries: 20,
      slaBreaches: 0,
      onTimePercentage: 80,
      customerRatingAvg: null,
    });
    expect(score).not.toBeNull();
    expect(score!).toBeLessThan(80);
  });
});
