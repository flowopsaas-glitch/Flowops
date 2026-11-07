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
  role: "MANAGER" as string | null,
}));

// The page decides which buttons exist from the reader's role as well as the
// card's status, so the role has to be part of the fixture.
vi.mock("../contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "user-1", role: h.role, companyId: "tenant-1" } }),
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
      return { ...(found ?? h.jobs[0]), events: h.events, commercial: found?.commercial ?? null };
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
      unitsInTerm: 0,
      unitsServiceOverdue: 0,
      authorityWaitHours: 0,
      awaitingOrder: 0,
      unbilledExposure: 0,
    },
    byClass: [
      {
        assetClass: "RTG",
        label: "RTG",
        units: 4,
        byStatus: { IN_SERVICE: 4 },
        unitsDown: 0,
        openJobs: 1,
        jobsCompleted: 6,
        downtimeHours: 12,
        availabilityPercent: 99.4,
        longestDownHours: null,
        expectedRepairHours: 120,
        longDownLimitHours: 180,
      },
      {
        assetClass: "STRADDLE_CARRIER",
        label: "Straddle carrier",
        units: 2,
        byStatus: { IN_SERVICE: 1, DOWN: 1 },
        unitsDown: 1,
        openJobs: 1,
        jobsCompleted: 5,
        downtimeHours: 96,
        availabilityPercent: 88.1,
        longestDownHours: 240,
        expectedRepairHours: 72,
        longDownLimitHours: 108,
      },
    ],
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
  h.role = "MANAGER";
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

  it("groups the fleet by class, worst first, and states each class's own limit", async () => {
    h.summary = summary();
    render(<MaintenancePage />);

    const straddles = await screen.findByTestId("class-STRADDLE_CARRIER");
    expect(screen.getByTestId("fleet-headline")).toHaveTextContent("Availability");
    expect(straddles).toHaveTextContent("88.1%");
    expect(straddles).toHaveTextContent("1 down");
    // The limit is stated on the card: an operator should not have to find out
    // from an alarm that a three-day straddle repair is inside its allowance.
    expect(straddles).toHaveTextContent("72 h expected repair");
    expect(straddles).toHaveTextContent("flags past 108 h");

    const rtg = screen.getByTestId("class-RTG");
    expect(rtg).toHaveTextContent("99.4%");
    expect(rtg).toHaveTextContent("flags past 180 h");
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

/** A chain shaped like the one Robert described: a fast repair, a slow yes. */
function chain(overrides: Row = {}): Row {
  return {
    steps: [
      { key: "QUOTED", label: "Quoted", at: "2026-11-02T09:00:00.000Z", done: true, waitHours: 1 },
      { key: "AUTHORISED", label: "Authorised", at: "2026-11-06T09:00:00.000Z", done: true, waitHours: 96 },
      { key: "WORKED", label: "Worked", at: "2026-11-09T09:00:00.000Z", done: true, waitHours: 1 },
      { key: "INVOICED", label: "Invoiced", at: null, done: false, waitHours: null },
      { key: "PAID", label: "Paid", at: null, done: false, waitHours: null },
    ],
    nextStep: "INVOICED",
    stuckHours: 264,
    quoteToOrderHours: 96,
    orderToWorkHours: 1,
    workHours: 72,
    outageHours: 169,
    authorityWaitHours: 96,
    authoritySharePercent: 56.8,
    quotedAmount: 42500,
    actualCost: 38100,
    variance: 4400,
    startedBeforeOrder: false,
    workedWithoutOrder: false,
    uninvoiced: true,
    collectionDays: null,
    ...overrides,
  };
}

describe("Maintenance — the repair and the permission are different waits", () => {
  it("shows the chain on the card, with who is holding it up", async () => {
    h.jobs = [job({ status: "COMPLETED", commercial: chain() })];
    render(<MaintenancePage />);

    await userEvent.click(await screen.findByRole("row", { name: /Open job MJ-2026-0001/i }));

    const strip = await screen.findByTestId("commercial-chain");
    expect(within(strip).getByText("Quoted")).toBeTruthy();
    expect(within(strip).getByText("4 days after previous")).toBeTruthy();

    // The sentence that ends the argument about who was slow.
    expect(await screen.findByTestId("commercial-stuck")).toHaveTextContent(
      /Work done, not yet invoiced for 11 days/,
    );
    expect(screen.getByTestId("commercial-split")).toHaveTextContent(/3 days repairing/);
    expect(screen.getByTestId("commercial-split")).toHaveTextContent(/4 days waiting for authority/);
  });

  it("says plainly when nothing commercial has been recorded, rather than showing zeros", async () => {
    h.jobs = [job({ status: "COMPLETED", commercial: null })];
    render(<MaintenancePage />);

    await userEvent.click(await screen.findByRole("row", { name: /Open job MJ-2026-0001/i }));

    expect(await screen.findByText(/No commercial trail recorded/i)).toBeTruthy();
  });

  it("warns when work started before the order that authorised it", async () => {
    h.jobs = [job({ status: "COMPLETED", commercial: chain({ startedBeforeOrder: true }) })];
    render(<MaintenancePage />);

    await userEvent.click(await screen.findByRole("row", { name: /Open job MJ-2026-0001/i }));

    expect(await screen.findByText(/started before the purchase order arrived/i)).toBeTruthy();
  });

  it("records only what changed, so an untouched box cannot blank a date", async () => {
    h.jobs = [
      job({
        status: "COMPLETED",
        quotationAmount: 42500,
        quotationAt: "2026-11-02T09:00:00.000Z",
        commercial: chain(),
      }),
    ];
    render(<MaintenancePage />);

    await userEvent.click(await screen.findByRole("row", { name: /Open job MJ-2026-0001/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Record step" }));

    const invoiced = document.getElementById("commercial-invoicedAt") as HTMLInputElement;
    await userEvent.type(invoiced, "2026-11-12");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const call = h.posted.find((entry) => entry.url.endsWith("/commercial"));
    expect(call).toBeTruthy();
    expect(call?.body).toEqual({ invoicedAt: "2026-11-12" });
  });
});

describe("Maintenance — money and authority on the fleet page", () => {
  it("shows what is waiting for a purchase order and what has not been invoiced", async () => {
    h.summary = summary({
      metrics: {
        ...(summary().metrics as Row),
        awaitingOrder: 3,
        authorityWaitHours: 96,
        unbilledExposure: 12000,
      },
    });
    render(<MaintenancePage />);

    const band = await screen.findByTestId("commercial-band");
    expect(within(band).getByText("Waiting on a PO")).toBeTruthy();
    expect(within(band).getByText("3")).toBeTruthy();
    expect(within(band).getByText("4 days")).toBeTruthy();
    expect(within(band).getByText(/12 000\.00/)).toBeTruthy();
  });
});

describe("Maintenance — the screen does not offer what the API will refuse", () => {
  it("hides the manager actions from a dispatcher, and says who has them", async () => {
    h.role = "DISPATCH";
    h.jobs = [job({ status: "IN_PROGRESS" })];
    render(<MaintenancePage />);

    await userEvent.click(await screen.findByRole("row", { name: /Open job MJ-2026-0001/i }));

    // The four the API reserves for a manager.
    expect(screen.queryByRole("button", { name: "Complete job" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel card" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Record step" })).toBeNull();

    // What a dispatcher may actually do stays.
    expect(screen.getByRole("button", { name: "Add cost" })).toBeTruthy();

    // And its absence is explained rather than mysterious — a control that
    // simply vanishes reads as a broken page.
    expect(screen.getByText(/are manager actions/i)).toBeTruthy();
  });

  it("shows them to a manager, with no apology", async () => {
    h.role = "MANAGER";
    h.jobs = [job({ status: "IN_PROGRESS" })];
    render(<MaintenancePage />);

    await userEvent.click(await screen.findByRole("row", { name: /Open job MJ-2026-0001/i }));

    expect(screen.getByRole("button", { name: "Complete job" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Record step" })).toBeTruthy();
    expect(screen.queryByText(/are manager actions/i)).toBeNull();
  });

  it("does not offer a viewer any action at all", async () => {
    h.role = "VIEWER";
    h.jobs = [job({ status: "REPORTED" })];
    render(<MaintenancePage />);

    await userEvent.click(await screen.findByRole("row", { name: /Open job MJ-2026-0001/i }));

    expect(screen.queryByRole("button", { name: "Start work" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add cost" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete job" })).toBeNull();
    // Reading is still allowed — that is the whole point of a viewer.
    expect(screen.getAllByText(/Hydraulic oil leaking at the boom cylinder/).length).toBeGreaterThan(0);
  });

  it("keeps the warehouse out of the register but inside the cards", async () => {
    h.role = "WAREHOUSE";
    h.jobs = [job({ status: "REPORTED" })];
    render(<MaintenancePage />);

    expect(await screen.findByRole("button", { name: /Raise job card/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Register unit/i })).toBeNull();
  });

  it("shows both to a manager", async () => {
    h.role = "MANAGER";
    render(<MaintenancePage />);

    expect(await screen.findByRole("button", { name: /Raise job card/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Register unit/i })).toBeTruthy();
  });
});
