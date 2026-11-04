import { describe, expect, it } from "vitest";
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  allowedJobActions,
  fleetHeadline,
  formatDuration,
  formatMeter,
  formatMoney,
  formatPercent,
  jobCostTotal,
  jobStatusTone,
  warrantyPositionOf,
  warrantyText,
  warrantyTone,
  type MaintenanceJob,
  type MaintenanceSummary,
} from "./maintenance";

/**
 * The presentation rules.
 *
 * These are not formatting tests for their own sake. A maintenance page is read
 * by the operator who wants the fleet to look available and by the contract
 * holder deciding whether to renew, so the formatters are where the page either
 * stays honest or starts flattering.
 */

function job(overrides: Partial<MaintenanceJob> = {}): MaintenanceJob {
  return {
    id: "job-1",
    jobNumber: "MJ-2026-0001",
    assetId: "asset-1",
    type: "BREAKDOWN",
    status: "COMPLETED",
    reportedAt: "2026-10-01T06:00:00.000Z",
    reportedByName: null,
    startedAt: null,
    completedAt: "2026-10-01T09:00:00.000Z",
    signedOffAt: null,
    signedOffBy: null,
    faultCodeId: null,
    faultDescription: "Boom cylinder leaking",
    workPerformed: null,
    downtimeMinutes: 180,
    meterAtJob: null,
    priorJobId: null,
    warrantyTermDays: null,
    warrantyExpiresAt: null,
    labourHours: null,
    providerName: null,
    invoiceRef: null,
    cancelledReason: null,
    currency: "ZAR",
    ...overrides,
  };
}

describe("warranty is three-valued on screen", () => {
  it('says "warranty not recorded" — not "out of warranty" — when no term exists', () => {
    const position = warrantyPositionOf(job({ warrantyTermDays: null }), new Date("2027-01-01T00:00:00.000Z"));
    expect(position).toBe("UNKNOWN");
    expect(warrantyText(position)).toBe("Warranty not recorded");
    expect(warrantyTone(position)).toBe("warning");
  });

  it("shows the expiry date while the window is open", () => {
    const covered = job({ warrantyTermDays: 30, warrantyExpiresAt: "2026-10-31T09:00:00.000Z" });
    const position = warrantyPositionOf(covered, new Date("2026-10-15T00:00:00.000Z"));
    expect(position).toBe("IN_WARRANTY");
    expect(warrantyText(position, covered.warrantyExpiresAt)).toMatch(/In warranty to/);
    expect(warrantyTone(position)).toBe("success");
  });

  it("says out of warranty only when a term was recorded and has passed", () => {
    const expired = job({ warrantyTermDays: 7, warrantyExpiresAt: "2026-10-08T09:00:00.000Z" });
    const position = warrantyPositionOf(expired, new Date("2026-11-01T00:00:00.000Z"));
    expect(position).toBe("OUT_OF_WARRANTY");
    expect(warrantyText(position)).toBe("Out of warranty");
  });

  it("does not claim a warranty on a cancelled card or an open one", () => {
    expect(warrantyPositionOf(job({ status: "CANCELLED" }))).toBe("UNKNOWN");
    expect(warrantyPositionOf(job({ status: "REPORTED", completedAt: null }))).toBe("UNKNOWN");
  });
});

describe("the register can name the plant a terminal actually runs", () => {
  it("has classes for straddle carriers, haulers and RTGs", () => {
    expect(ASSET_CLASSES).toContain("STRADDLE_CARRIER");
    expect(ASSET_CLASSES).toContain("HAULER");
    expect(ASSET_CLASSES).toContain("RTG");
  });

  it("gives every class a label — a blank one is a dropdown that lies", () => {
    for (const value of ASSET_CLASSES) {
      expect(ASSET_CLASS_LABELS[value]?.trim()).toBeTruthy();
    }
  });

  it("does not hide a whole fleet behind OTHER", () => {
    // 100 of one operator's 122 machines were straddles and haulers; with only
    // OTHER available they would have collapsed into a single meaningless class
    // and every per-class figure would have been fiction.
    expect(ASSET_CLASS_LABELS.STRADDLE_CARRIER).toBe("Straddle carrier");
    expect(ASSET_CLASS_LABELS.HAULER).toBe("Hauler");
  });
});

describe("figures carry their basis", () => {
  it("never rounds availability up to a clean 100%", () => {
    // 99.97% renders as "99.9+%", never "100.0%": the difference between a
    // fleet that is working and one that is perfect is the whole conversation.
    expect(formatPercent(99.97)).toBe("99.9+%");
    expect(formatPercent(100)).toBe("99.9+%");
    expect(formatPercent(96.66)).toBe("96.7%");
  });

  it("shows an em dash rather than 0% when there is no basis", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
  });

  it("speaks in days once a unit has been down long enough to matter", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1.5 h");
    expect(formatDuration(7 * 24 * 60)).toBe("7 days");
    expect(formatDuration(null)).toBe("—");
  });

  it("shows an em dash when a cost has no meter movement behind it", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(1234.5)).toBe("ZAR 1 234.50");
  });

  it("labels the meter with the unit it actually counts", () => {
    expect(formatMeter(1240, "HOURS")).toBe("1 240 h");
    expect(formatMeter(18402, "KM")).toBe("18 402 km");
    expect(formatMeter(null, "HOURS")).toBe("—");
  });
});

describe("what a card offers", () => {
  it("offers completion from report or in-progress, and nothing after sign-off", () => {
    expect(allowedJobActions("REPORTED").complete).toBe(true);
    expect(allowedJobActions("IN_PROGRESS").signOff).toBe(false);
    expect(allowedJobActions("COMPLETED").signOff).toBe(true);
    expect(allowedJobActions("SIGNED_OFF").cancel).toBe(false);
    // A cost line can still arrive after sign-off — workshop invoices do — and
    // the API allows it, so the UI must not hide the only way to record it.
    expect(allowedJobActions("SIGNED_OFF").addCost).toBe(true);
  });

  it("never offers a cost line on a cancelled card", () => {
    expect(allowedJobActions("CANCELLED").addCost).toBe(false);
  });

  it("tones a cancelled card as danger and a completed one as success", () => {
    expect(jobStatusTone("CANCELLED")).toBe("danger");
    expect(jobStatusTone("COMPLETED")).toBe("success");
    expect(jobStatusTone("REPORTED")).toBe("warning");
  });
});

describe("cost totals", () => {
  it("sums the lines to cents", () => {
    expect(jobCostTotal(job({ costs: [{ amount: 100.1, kind: "PART" }, { amount: 200.25, kind: "LABOUR" }] }))).toBe(
      300.35,
    );
  });

  it("is zero, not a crash, on a card with no lines", () => {
    expect(jobCostTotal(job())).toBe(0);
  });
});

describe("the headline", () => {
  const base: MaintenanceSummary = {
    status: "ok",
    headline: "Availability 99.2% across 6 units, 2 open.",
    findings: [],
    metrics: {
      assets: 6,
      assetsDown: 0,
      jobsOpen: 2,
      jobsCompleted: 11,
      availabilityPercent: 99.2,
      downtimeHours: 30,
      comebackSharePercent: 9.1,
      warrantyExposure: 0,
    },
    assetsByStatus: { IN_SERVICE: 6 },
    windowDays: 30,
    windowStart: "2026-10-05T00:00:00.000Z",
    windowEnd: "2026-11-04T00:00:00.000Z",
  };

  it("passes the server's sentence through untouched", () => {
    expect(fleetHeadline(base)).toBe("Availability 99.2% across 6 units, 2 open.");
  });

  it("tells an empty register what to do next instead of showing 0%", () => {
    expect(
      fleetHeadline({ ...base, metrics: { ...base.metrics, assets: 0 } }),
    ).toMatch(/No units on the register/);
  });

  it("says it is loading when there is no summary yet", () => {
    expect(fleetHeadline(null)).toMatch(/Loading/);
  });
});
