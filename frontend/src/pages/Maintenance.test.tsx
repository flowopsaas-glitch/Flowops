import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  summary: null as Row | null,
  assets: [] as Row[],
  jobs: [] as Row[],
  history: null as Row | null,
  posted: [] as { url: string; body: unknown }[],
  events: [] as Row[],
}));

vi.mock("../api/client", () => {
  const get = vi.fn(async (url: string) => {
    if (url === "/maintenance/summary") return h.summary;
    if (url.startsWith("/maintenance/assets/")) return h.history;
    if (url === "/maintenance/assets") return h.assets;
    if (url === "/maintenance/jobs") return h.jobs;
    if (url.startsWith("/maintenance/jobs/")) {
      const id = url.split("/").pop();
      const found = h.jobs.find((row) => row.id === id);
      return { ...(found ?? h.jobs[0]), events: h.events };
    }
    return [];
  });
  const post = vi.fn(async (url: string, body: unknown) => {
    h.posted.push({ url, body });
    return { id: "created-1" };
  });
  return { api: { get, post } };
});

import MaintenancePage from "./Maintenance";

function summary(overrides: Row = {}): Row {
  return {
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
    ...overrides,
  };
}

function asset(overrides: Row = {}): Row {
  return {
    id: "asset-1",
    assetCode: "RS-014",
    name: "Stacker 14",
    assetClass: "REACH_STACKER",
    make: "Kalmar",
    model: "DRG450",
    serialNumber: "K-9911",
    custodian: "TTT Logistics",
    site: "Pier 1",
    meterType: "HOURS",
    meterReading: 1240,
    meterReadAt: "2026-11-03T10:00:00.000Z",
    status: "IN_SERVICE",
    retiredAt: null,
    notes: null,
    openJob: null,
    ...overrides,
  };
}

function job(overrides: Row = {}): Row {
  return {
    id: "job-1",
    jobNumber: "MJ-2026-0001",
    assetId: "asset-1",
    type: "BREAKDOWN",
    status: "REPORTED",
    reportedAt: "2026-11-03T06:00:00.000Z",
    reportedByName: "Sipho Dlamini",
    startedAt: null,
    completedAt: null,
    signedOffAt: null,
    signedOffBy: null,
    faultCodeId: null,
    faultDescription: "Hydraulic oil leaking at the boom cylinder",
    workPerformed: null,
    downtimeMinutes: null,
    meterAtJob: 1240,
    priorJobId: null,
    warrantyTermDays: null,
    warrantyExpiresAt: null,
    labourHours: null,
    providerName: null,
    invoiceRef: null,
    cancelledReason: null,
    currency: "ZAR",
    costs: [],
    asset: { id: "asset-1", assetCode: "RS-014", name: "Stacker 14" },
    priorJob: null,
    ...overrides,
  };
}

function history(overrides: Row = {}): Row {
  return {
    asset: asset(),
    windowDays: 90,
    jobs: [
      job({
        status: "COMPLETED",
        completedAt: "2026-10-01T09:00:00.000Z",
        downtimeMinutes: 180,
        warrantyTermDays: 30,
        warrantyExpiresAt: "2026-10-31T09:00:00.000Z",
        costs: [{ amount: 2400, kind: "PART" }],
      }),
    ],
    availability: { percent: 98.4, basisMinutes: 129600, downtimeMinutes: 2100, hours: 35 },
    costs: { total: 2400, byKind: { PART: 2400 }, rows: 1 },
    faultPattern: [
      {
        faultCodeId: "fault-hyd",
        occurrences: 3,
        totalDowntimeMinutes: 540,
        downtimeHours: 9,
        comebacks: 1,
        lastReportedAt: "2026-10-01T06:00:00.000Z",
        faultCode: { id: "fault-hyd", code: "HYD-LEAK", label: "Hydraulic leak" },
      },
    ],
    comebacks: { count: 1, sharePercent: 33.3 },
    meter: { type: "HOURS", reading: 1240, readAt: "2026-11-03T10:00:00.000Z", start: 1000, end: 1240, advanced: 240, costPerUnit: 10 },
    lastJobWarranty: {
      jobId: "job-1",
      jobNumber: "MJ-2026-0001",
      position: "OUT_OF_WARRANTY",
      expiresAt: "2026-10-31T09:00:00.000Z",
      termDays: 30,
    },
    openJob: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.summary = summary();
  h.assets = [asset()];
  h.jobs = [job()];
  h.history = history();
  h.posted = [];
  h.events = [
    {
      id: "ev-1",
      type: "CREATED",
      fromStatus: null,
      toStatus: "REPORTED",
      actorName: "Sipho Dlamini",
      description: "Breakdown raised on RS-014.",
      createdAt: "2026-11-03T06:00:00.000Z",
    },
    {
      id: "ev-2",
      type: "COMEBACK_LINKED",
      fromStatus: null,
      toStatus: null,
      actorName: "Sipho Dlamini",
      description: "Same fault as MJ-2026-0009, which is still inside the warranty it carried.",
      createdAt: "2026-11-03T06:00:01.000Z",
    },
  ];
});

describe("Maintenance — the fleet position is stated, not implied", () => {
  it("leads with the sentence and shows the basis behind availability", async () => {
    render(<MaintenancePage />);

    expect(await screen.findByText("Availability 99.2% across 6 units, 2 open.")).toBeTruthy();
    expect(screen.getByTestId("fleet-headline")).toHaveTextContent(
      "Availability 99.2% across 6 units, 2 open.",
    );
    // The tile must carry the basis: units and hours lost, not a bare percentage.
    expect(screen.getByText(/6 units · 30 h lost/)).toBeTruthy();
  });

  it("shows each finding as a sentence, not a count", async () => {
    h.summary = summary({
      status: "attention",
      headline: "RS-014 has been out of service for 168 hours.",
      findings: [
        {
          code: "long_down:asset-1",
          severity: "attention",
          message: "RS-014 has been out of service for 168 hours. At this age it is a contractual problem, not a repair.",
        },
      ],
      metrics: { ...(summary().metrics as Row), assetsDown: 1 },
    });
    render(<MaintenancePage />);

    expect(
      await screen.findByText(/contractual problem, not a repair/i),
    ).toBeTruthy();
  });

  it("shows an empty register as a next step, not as 0% availability", async () => {
    h.summary = summary({
      headline: "No assets on the register yet.",
      metrics: { ...(summary().metrics as Row), assets: 0, availabilityPercent: null },
    });
    h.assets = [];
    h.jobs = [];
    render(<MaintenancePage />);

    // Wait for the settled state, not the first paint: the headline element
    // exists while the page is still loading, so asserting on it immediately
    // races the fetch under a loaded test runner.
    expect(await screen.findByText("No units on the register")).toBeTruthy();
    expect(screen.getByTestId("fleet-headline")).toHaveTextContent(/No units on the register/i);
  });
});

describe("Maintenance — a job card says what actually happened", () => {
  it("marks planned down-time as planned rather than as zero hours lost", async () => {
    h.jobs = [
      job({ id: "job-p", jobNumber: "MJ-2026-0009", type: "PLANNED", downtimeMinutes: null, status: "COMPLETED" }),
      job({ id: "job-b", jobNumber: "MJ-2026-0010", downtimeMinutes: 240 }),
    ];
    render(<MaintenancePage />);

    const planned = (await screen.findByText("MJ-2026-0009")).closest("tr") as HTMLElement;
    expect(within(planned).getByText("planned")).toBeTruthy();

    const breakdown = screen.getByText("MJ-2026-0010").closest("tr") as HTMLElement;
    expect(within(breakdown).getByText("4 h")).toBeTruthy();
  });

  it("flags a repeat failure on the card", async () => {
    h.jobs = [job({ priorJobId: "job-0", priorJob: { id: "job-0", jobNumber: "MJ-2026-0001", completedAt: null } })];
    render(<MaintenancePage />);

    const row = (await screen.findByText("MJ-2026-0001")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Comeback")).toBeTruthy();
  });

  it("offers no delete, only a reasoned cancellation", async () => {
    render(<MaintenancePage />);
    await userEvent.click(await screen.findByRole("row", { name: "Open job MJ-2026-0001" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/delete/i)).toBeNull();

    await userEvent.click(within(dialog).getByText("Cancel card"));
    expect(within(dialog).getByText(/There is no delete/i)).toBeTruthy();
  });
});

describe("Maintenance — the card's history is the record", () => {
  it("shows the append-only trail, not just timestamps", async () => {
    render(<MaintenancePage />);
    await userEvent.click(await screen.findByRole("row", { name: "Open job MJ-2026-0001" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Breakdown raised on RS-014.")).toBeTruthy();
    // The comeback is a link with a reason, visible on the card itself.
    expect(
      within(dialog).getByText(/Same fault as MJ-2026-0009, which is still inside the warranty/i),
    ).toBeTruthy();
  });
});

describe("Maintenance — the unit page is the artefact", () => {
  it("shows availability, cost per hour and the fault pattern for one unit", async () => {
    render(<MaintenancePage />);
    await userEvent.click(await screen.findByRole("row", { name: "Open unit RS-014" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("98.4%")).toBeTruthy();
    // The total appears twice on purpose: once as the unit's cost, once on the
    // card that carried it. Both must be there.
    expect(within(dialog).getAllByText("ZAR 2 400.00").length).toBeGreaterThan(1);
    expect(within(dialog).getByText("ZAR 10.00")).toBeTruthy();
    expect(within(dialog).getByText("HYD-LEAK — Hydraulic leak")).toBeTruthy();
    expect(within(dialog).getByText(/1 of 1 are repeats/)).toBeTruthy();
  });

  it("says the warranty was not recorded when the term is missing", async () => {
    h.history = history({
      lastJobWarranty: {
        jobId: "job-1",
        jobNumber: "MJ-2026-0001",
        position: "UNKNOWN",
        expiresAt: null,
        termDays: null,
      },
      jobs: [
        job({
          status: "COMPLETED",
          completedAt: "2026-10-01T09:00:00.000Z",
          warrantyTermDays: null,
          warrantyExpiresAt: null,
        }),
      ],
    });
    render(<MaintenancePage />);
    await userEvent.click(await screen.findByRole("row", { name: "Open unit RS-014" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("Warranty not recorded").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("Out of warranty")).toBeNull();
  });

  it("does not invent a cost per hour when the meter has not moved", async () => {
    h.history = history({
      meter: { type: "HOURS", reading: 1000, readAt: null, start: 1000, end: 1000, advanced: 0, costPerUnit: null },
    });
    render(<MaintenancePage />);
    await userEvent.click(await screen.findByRole("row", { name: "Open unit RS-014" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("meter did not move in window")).toBeTruthy();
  });
});

describe("Maintenance — capture happens where the machine is", () => {
  it("raises a card with the minimum a person in a yard can type", async () => {
    render(<MaintenancePage />);
    await userEvent.click(await screen.findByText("Raise job card"));

    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText("What was seen"),
      "Hydraulic oil leaking at the boom cylinder",
    );
    await userEvent.click(within(dialog).getByText("Raise card"));

    expect(h.posted).toHaveLength(1);
    expect(h.posted[0].url).toBe("/maintenance/jobs");
    expect(h.posted[0].body).toMatchObject({
      assetId: "asset-1",
      type: "BREAKDOWN",
      faultDescription: "Hydraulic oil leaking at the boom cylinder",
    });
  });

  it("will not send a card with no description", async () => {
    render(<MaintenancePage />);
    await userEvent.click(await screen.findByText("Raise job card"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Raise card")).toBeDisabled();
    expect(h.posted).toHaveLength(0);
  });

  it("warns on the completion form that a lifetime warranty cannot be recorded", async () => {
    h.jobs = [job({ status: "IN_PROGRESS" })];
    render(<MaintenancePage />);
    await userEvent.click(await screen.findByRole("row", { name: "Open job MJ-2026-0001" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByText("Complete job"));
    expect(within(dialog).getByText(/“Lifetime” is refused/)).toBeTruthy();
  });
});
