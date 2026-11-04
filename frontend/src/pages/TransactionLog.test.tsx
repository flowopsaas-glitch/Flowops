import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { mockTrail, mockSummary, mockHistory } = vi.hoisted(() => ({
  mockTrail: vi.fn(),
  mockSummary: vi.fn(),
  mockHistory: vi.fn(),
}));

vi.mock("../lib/auditTrail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auditTrail")>();
  return {
    ...actual,
    fetchTrail: mockTrail,
    fetchTrailSummary: mockSummary,
    fetchEntityHistory: mockHistory,
  };
});

import TransactionLog from "./TransactionLog";
import type { TrailRecord, TrailSummary } from "../lib/auditTrail";

function record(over: Partial<TrailRecord> = {}): TrailRecord {
  return {
    id: "e1",
    kind: "waybill",
    entityId: "wb-1",
    entityReference: "WB-1001",
    event: "COLLECTED",
    status: "COLLECTED",
    fromStatus: null,
    description: "Parcel collected from sender",
    location: "Spartan Depot",
    lat: null,
    lng: null,
    actorType: "DRIVER",
    actorId: "drv-1",
    actorName: "Sipho Ndlovu",
    occurredAt: "2026-11-04T08:00:00.000Z",
    evidence: null,
    ...over,
  };
}

const SUMMARY: TrailSummary = {
  days: 7,
  total: 2,
  byKind: { waybill: 1, consignment: 1 },
  byActorType: { DRIVER: 1, UNRECORDED_RAIL: 1 },
  entitiesTouched: 2,
  firstEventAt: "2026-11-04T06:00:00.000Z",
  lastEventAt: "2026-11-04T08:00:00.000Z",
};

const PAGE = {
  records: [
    record(),
    record({
      id: "e2",
      kind: "consignment",
      entityId: "rc-1",
      entityReference: "RC-77",
      event: "ARRIVED",
      status: "ARRIVED",
      description: "Consignment arrived at terminal",
      location: null,
      actorType: null,
      actorId: null,
      actorName: null,
    }),
  ],
  nextCursor: null,
  hasMore: false,
};

describe("TransactionLog", () => {
  beforeEach(() => {
    mockTrail.mockReset().mockResolvedValue(PAGE);
    mockSummary.mockReset().mockResolvedValue(SUMMARY);
    mockHistory.mockReset().mockResolvedValue([]);
  });

  it("renders the events it was given", async () => {
    render(<TransactionLog />);
    expect(await screen.findByText("WB-1001")).toBeInTheDocument();
    expect(screen.getByText("RC-77")).toBeInTheDocument();
    expect(screen.getByText("Parcel collected from sender")).toBeInTheDocument();
    expect(screen.getByText("Sipho Ndlovu")).toBeInTheDocument();
  });

  it("shows no field-diff columns, because none are recorded", async () => {
    render(<TransactionLog />);
    await screen.findByText("WB-1001");
    for (const heading of ["Field Changed", "Old Value", "New Value", "Changed By"]) {
      expect(screen.queryByText(heading)).not.toBeInTheDocument();
    }
    expect(screen.getByText(/not field-level edits/i)).toBeInTheDocument();
  });

  it("distinguishes a rail event with no actor from an unattributed waybill event", async () => {
    render(<TransactionLog />);
    await screen.findByText("RC-77");
    // Rail: the source has no actor column.
    expect(screen.getByText("Not recorded")).toBeInTheDocument();
    expect(screen.getByText(/rail events carry no actor/i)).toBeInTheDocument();
  });

  it("never labels a missing actor as System", async () => {
    mockTrail.mockResolvedValue({
      records: [record({ id: "e3", actorName: null, actorId: null, actorType: null })],
      nextCursor: null,
      hasMore: false,
    });
    render(<TransactionLog />);
    expect(await screen.findByText("Unattributed")).toBeInTheDocument();
    // "System" is a legitimate *filter option* and a legitimate actor type when
    // the row records it — the assertion is about the row, so scope to the table.
    const table = screen.getByRole("table");
    expect(within(table).queryByText("System")).not.toBeInTheDocument();
  });

  it("opens the entity history and shows a transition only there", async () => {
    mockHistory.mockResolvedValue([
      record({ id: "h1", status: "COLLECTED", fromStatus: null }),
      record({ id: "h2", status: "IN_TRANSIT", fromStatus: "COLLECTED", event: "IN_TRANSIT" }),
    ]);

    render(<TransactionLog />);
    fireEvent.click(await screen.findByText("WB-1001"));

    await waitFor(() => expect(mockHistory).toHaveBeenCalledWith("waybill", "wb-1"));
    expect(await screen.findByText(/History —/)).toBeInTheDocument();
    expect(await screen.findByText(/state: COLLECTED → IN_TRANSIT/)).toBeInTheDocument();
  });

  it("summarises the loaded window", async () => {
    render(<TransactionLog />);
    await waitFor(() => expect(mockSummary).toHaveBeenCalledWith(7));
    expect(await screen.findByText("Entities touched")).toBeInTheDocument();
    expect(screen.getByText("Rail (no actor recorded)")).toBeInTheDocument();
  });

  it("explains an empty result instead of showing a blank panel", async () => {
    mockTrail.mockResolvedValue({ records: [], nextCursor: null, hasMore: false });
    render(<TransactionLog />);
    expect(await screen.findByText(/No events recorded yet/i)).toBeInTheDocument();
  });

  it("offers a retry when the trail request fails", async () => {
    mockTrail.mockRejectedValueOnce(new Error("boom"));
    render(<TransactionLog />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("appends the next page when 'Load more' is used", async () => {
    mockTrail.mockResolvedValueOnce({ ...PAGE, nextCursor: "cursor-2", hasMore: true });
    mockTrail.mockResolvedValueOnce({
      records: [record({ id: "e9", entityReference: "WB-2002", description: "Second page event" })],
      nextCursor: null,
      hasMore: false,
    });

    render(<TransactionLog />);
    await screen.findByText("WB-1001");

    fireEvent.click(screen.getByRole("button", { name: /load more events/i }));

    expect(await screen.findByText("WB-2002")).toBeInTheDocument();
    // The first page is still there — appending, not replacing.
    expect(screen.getByText("WB-1001")).toBeInTheDocument();
    expect(mockTrail.mock.calls[1][0]).toMatchObject({ cursor: "cursor-2" });
    expect(screen.queryByRole("button", { name: /load more events/i })).not.toBeInTheDocument();
  });

  it("re-queries when a filter changes", async () => {
    render(<TransactionLog />);
    await screen.findByText("WB-1001");

    fireEvent.change(screen.getByLabelText("Filter by actor type"), {
      target: { value: "DRIVER" },
    });

    await waitFor(() =>
      expect(mockTrail.mock.calls.some((call) => call[0].actorType === "DRIVER")).toBe(true),
    );
  });

  it("locks the source filter when the page is scoped to waybills", async () => {
    render(<TransactionLog kind="waybill" />);
    await screen.findByText("WB-1001");
    expect(screen.getByText("Waybill Transaction Log")).toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by source")).not.toBeInTheDocument();
    expect(mockTrail.mock.calls[0][0].kind).toBe("waybill");
  });
});
