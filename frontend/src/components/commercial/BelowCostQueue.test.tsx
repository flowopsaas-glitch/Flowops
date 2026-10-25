import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BelowCostQueue from "./BelowCostQueue";

const { mockListExceptions, mockUpdate } = vi.hoisted(() => ({
  mockListExceptions: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("../../api/tripTruthApi", () => ({
  listTripExceptions: mockListExceptions,
  updateTripException: mockUpdate,
}));

const OPEN_EXCEPTION = {
  id: "a1",
  waybillId: "w1",
  trackingNumber: "WB-1",
  period: "2026-10",
  revenue: 1000,
  fuelCost: 1400,
  labourCost: 0,
  vehicleCost: 0,
  overheadCost: 0,
  tollsCost: 0,
  otherCost: 0,
  totalCost: 1400,
  grossMargin: -400,
  marginPercent: -40,
  provenance: "MEASURED" as const,
  sourceEntryCount: 2,
  allocationNote: "direct entry",
  distanceKm: null,
  clientName: "Client A",
  updatedAt: new Date().toISOString(),
  exceptionStatus: "OPEN" as const,
  exceptionNote: null,
  exceptionBy: null,
  exceptionAt: new Date().toISOString(),
};

describe("BelowCostQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ ...OPEN_EXCEPTION, exceptionStatus: "ACKNOWLEDGED" });
  });

  it("shows open exceptions with the measured basis and margin at stake", async () => {
    mockListExceptions.mockResolvedValue({
      period: "2026-10",
      exceptions: [OPEN_EXCEPTION],
      counts: { open: 1, acknowledged: 0 },
    });
    render(<BelowCostQueue period="2026-10" />);
    expect(await screen.findByText("WB-1")).toBeInTheDocument();
    expect(screen.getByText(/1 open · 0 acknowledged/)).toBeInTheDocument();
    expect(screen.getByText(/estimates never raise exceptions/i)).toBeInTheDocument();
  });

  it("acknowledges with the operator's note and refreshes the queue", async () => {
    mockListExceptions
      .mockResolvedValueOnce({
        period: "2026-10",
        exceptions: [OPEN_EXCEPTION],
        counts: { open: 1, acknowledged: 0 },
      })
      .mockResolvedValueOnce({
        period: "2026-10",
        exceptions: [{ ...OPEN_EXCEPTION, exceptionStatus: "ACKNOWLEDGED" }],
        counts: { open: 0, acknowledged: 1 },
      });
    render(<BelowCostQueue period="2026-10" />);
    await screen.findByText("WB-1");
    fireEvent.change(screen.getByLabelText("Note for WB-1"), {
      target: { value: "Repricing with client" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith("w1", "ACKNOWLEDGED", "Repricing with client");
    expect(await screen.findByText(/0 open · 1 acknowledged/)).toBeInTheDocument();
  });

  it("says so honestly when nothing is below cost", async () => {
    mockListExceptions.mockResolvedValue({
      period: "2026-10",
      exceptions: [],
      counts: { open: 0, acknowledged: 0 },
    });
    render(<BelowCostQueue period="2026-10" />);
    expect(await screen.findByText(/No open below-cost exceptions/)).toBeInTheDocument();
    // The honesty guard: absence may mean unrecorded, not healthy.
    expect(screen.getByText(/unrecorded trips raise no exceptions/)).toBeInTheDocument();
  });
});
