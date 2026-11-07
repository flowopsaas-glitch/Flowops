import { describe, expect, it } from "vitest";
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  allowedJobActions,
  commercialStuckText,
  isMaintenanceAssetWriter,
  isMaintenanceJobWriter,
  isMaintenanceManager,
  repairVsWaitText,
  varianceText,
  warrantyStandingText,
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
  type CommercialChain,
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
    quotationAmount: null,
    quotationAt: null,
    purchaseOrderNumber: null,
    purchaseOrderAt: null,
    invoicedAt: null,
    paidAt: null,
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
    expect(allowedJobActions("REPORTED", "MANAGER").complete).toBe(true);
    expect(allowedJobActions("IN_PROGRESS", "MANAGER").signOff).toBe(false);
    expect(allowedJobActions("COMPLETED", "MANAGER").signOff).toBe(true);
    expect(allowedJobActions("SIGNED_OFF", "MANAGER").cancel).toBe(false);
    // A cost line can still arrive after sign-off — workshop invoices do — and
    // the API allows it, so the UI must not hide the only way to record it.
    expect(allowedJobActions("SIGNED_OFF", "MANAGER").addCost).toBe(true);
  });

  it("never offers a cost line on a cancelled card", () => {
    expect(allowedJobActions("CANCELLED", "MANAGER").addCost).toBe(false);
  });

  it("does not offer a manager action to a role the API refuses", () => {
    // The defect this pins: the card used to decide from status alone, so a
    // dispatcher was shown Complete / Sign off / Cancel / Record step, filled
    // them in, and was refused by the API every time.
    const dispatcher = allowedJobActions("IN_PROGRESS", "DISPATCH");
    expect(dispatcher.complete).toBe(false);
    expect(dispatcher.cancel).toBe(false);
    expect(dispatcher.recordCommercial).toBe(false);
    // …but still gets the day-to-day actions the API does allow on that card.
    expect(dispatcher.addCost).toBe(true);
    // Starting is a status-bound action, so it is asserted on the status that
    // offers it — a dispatcher may start a reported card, manager or not.
    expect(allowedJobActions("REPORTED", "DISPATCH").start).toBe(true);

    const warehouse = allowedJobActions("REPORTED", "WAREHOUSE");
    expect(warehouse.complete).toBe(false);
    expect(warehouse.signOff).toBe(false);
    expect(warehouse.recordCommercial).toBe(false);
    expect(warehouse.start).toBe(true);
  });

  it("offers nothing at all to a read-only role, rather than a button that 403s", () => {
    for (const status of ["REPORTED", "IN_PROGRESS", "COMPLETED", "SIGNED_OFF"] as const) {
      const actions = allowedJobActions(status, "VIEWER");
      expect(actions.start).toBe(false);
      expect(actions.complete).toBe(false);
      expect(actions.signOff).toBe(false);
      expect(actions.cancel).toBe(false);
      expect(actions.addCost).toBe(false);
      expect(actions.recordCommercial).toBe(false);
    }
  });

  it("treats a missing or oddly-cased role as no role at all", () => {
    // An unanswered /auth/me must not be read as permission.
    expect(allowedJobActions("IN_PROGRESS", null).complete).toBe(false);
    expect(allowedJobActions("IN_PROGRESS", undefined).recordCommercial).toBe(false);
    expect(allowedJobActions("IN_PROGRESS", "").cancel).toBe(false);
    // The API stores roles uppercase; a lowercase value from a stale token or a
    // hand-set row is the same role and must not silently lose its rights.
    expect(allowedJobActions("IN_PROGRESS", "manager").complete).toBe(true);
    expect(allowedJobActions("IN_PROGRESS", " Company_Admin ").recordCommercial).toBe(true);
  });

  it("splits writing a card from writing the asset register", () => {
    // The API lets WAREHOUSE raise and work a card but not add a machine to the
    // register — mirroring that keeps a mystery button off the page.
    expect(isMaintenanceJobWriter("WAREHOUSE")).toBe(true);
    expect(isMaintenanceAssetWriter("WAREHOUSE")).toBe(false);
    expect(isMaintenanceAssetWriter("DISPATCH")).toBe(true);
    expect(isMaintenanceManager("DISPATCH")).toBe(false);
    expect(isMaintenanceManager("ADMIN")).toBe(true);
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
      unitsInTerm: 0,
      unitsServiceOverdue: 0,
      authorityWaitHours: 0,
      awaitingOrder: 0,
      unbilledExposure: 0,
    },
    byClass: [],
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

describe("a warranty that can lapse without expiring", () => {
  const standing = (overrides: Record<string, unknown> = {}) => ({
    state: "IN_WARRANTY" as const,
    expiresAt: "2028-07-02T00:00:00.000Z",
    serviceDueAt: "2027-09-29T00:00:00.000Z",
    serviceGraceEndsAt: "2027-10-29T00:00:00.000Z",
    daysOverdue: 0,
    daysSinceService: 400,
    neverServiced: false,
    ...overrides,
  });

  it("gives a live term a date to act on, not just a status", () => {
    expect(warrantyStandingText(standing())).toMatch(/In warranty to/);
    expect(warrantyStandingText(standing())).toMatch(/service due by/);
  });

  it("says whose decision a lapsed condition is — the supplier's, not the page's", () => {
    const text = warrantyStandingText(
      standing({ state: "SERVICE_OVERDUE", daysOverdue: 14 }),
    );
    expect(text).toMatch(/Service overdue by 14 days/);
    expect(text).toMatch(/supplier's discretion/);
    expect(text).not.toMatch(/void/i);
  });

  it("reads an overdue service as a warning rather than as good news", () => {
    expect(warrantyTone("SERVICE_OVERDUE")).toBe("warning");
    expect(warrantyTone("IN_WARRANTY")).toBe("success");
  });

  it("still refuses to guess a term nobody recorded", () => {
    expect(warrantyStandingText(null)).toBe("Warranty not recorded");
    expect(warrantyStandingText(standing({ state: "UNKNOWN" }))).toBe("Warranty not recorded");
  });

  it("shows a plain term with no service condition as a plain date", () => {
    const text = warrantyStandingText(standing({ serviceDueAt: null }));
    expect(text).toMatch(/In warranty to/);
    expect(text).not.toMatch(/service due/);
  });
});

/** A chain with only the fields the four sentences read. */
function chain(overrides: Partial<CommercialChain> = {}): CommercialChain {
  return {
    steps: [],
    nextStep: "AUTHORISED",
    stuckHours: null,
    quoteToOrderHours: null,
    orderToWorkHours: null,
    workHours: null,
    outageHours: null,
    authorityWaitHours: null,
    authoritySharePercent: null,
    quotedAmount: null,
    actualCost: null,
    variance: null,
    startedBeforeOrder: false,
    workedWithoutOrder: false,
    uninvoiced: false,
    collectionDays: null,
    ...overrides,
  };
}

describe("commercial chain — the sentences the screen is allowed to print", () => {
  it("never calls a wait a finding until it has a floor and a ratio", () => {
    // Not shown here (server-side), but the copy must not invent one either:
    // an undated wait reads as undated, not as zero.
    expect(commercialStuckText(chain({ stuckHours: null }))).toBe("Quoted, waiting for a purchase order");
    expect(commercialStuckText(chain({ stuckHours: 5 }))).toBe("Quoted, waiting for a purchase order for 5 hours");
    expect(commercialStuckText(chain({ stuckHours: 48 }))).toBe("Quoted, waiting for a purchase order for 2 days");
    // 47.9 h must not round up into "2 days" and overstate the delay.
    expect(commercialStuckText(chain({ stuckHours: 47 }))).toBe("Quoted, waiting for a purchase order for 47 hours");
  });

  it("names the desk that is holding the card, step by step", () => {
    expect(commercialStuckText(chain({ nextStep: "QUOTED", stuckHours: 6 }))).toMatch(/^Not quoted yet for 6 hours$/);
    expect(commercialStuckText(chain({ nextStep: "WORKED", stuckHours: 30 }))).toMatch(/^Authorised, work not yet complete for 30 hours$/);
    expect(commercialStuckText(chain({ nextStep: "INVOICED", stuckHours: 264 }))).toMatch(/^Work done, not yet invoiced for 11 days$/);
    expect(commercialStuckText(chain({ nextStep: "PAID", stuckHours: 96 }))).toMatch(/^Invoiced, not yet paid for 4 days$/);
    expect(commercialStuckText(chain({ nextStep: null }))).toMatch(/^Complete/);
  });

  it("says 'not recorded' rather than drawing a chain out of nothing", () => {
    expect(commercialStuckText(null)).toBe("Commercial chain not recorded");
    expect(repairVsWaitText(undefined)).toBe("No commercial trail recorded");
    expect(varianceText(null)).toBe("No quotation recorded");
  });

  it("splits the outage into the repair and the permission", () => {
    const text = repairVsWaitText(chain({ workHours: 72, authorityWaitHours: 96 }));
    expect(text).toBe("3 days repairing · 4 days waiting for authority (57% of the job)");
    // One side dated is a fact, not half a comparison.
    expect(repairVsWaitText(chain({ workHours: 72 }))).toBe("3 days of repair");
    expect(repairVsWaitText(chain({ authorityWaitHours: 96 }))).toBe("4 days waiting for a purchase order");
    expect(repairVsWaitText(chain())).toBe("Neither the repair nor the wait has been dated yet");
  });

  it("states an overrun as an overrun, with the sign spelled out", () => {
    expect(varianceText(chain({ variance: 4400 }))).toBe("ZAR 4 400.00 under quote");
    expect(varianceText(chain({ variance: -1250.5 }))).toBe("ZAR 1 250.50 over quote");
    expect(varianceText(chain({ variance: 0 }))).toBe("On quote at ZAR 0.00");
    expect(varianceText(chain({ variance: null }))).toBe("No quotation recorded");
    expect(varianceText(chain({ variance: -99 }), "USD")).toBe("USD 99.00 over quote");
  });
});
