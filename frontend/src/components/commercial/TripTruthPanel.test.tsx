import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TripTruthPanel from "./TripTruthPanel";

const { mockList, mockRecompute } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockRecompute: vi.fn(),
}));

vi.mock("../../api/tripTruthApi", () => ({
  listTripTruth: mockList,
  recomputeTripTruth: mockRecompute,
}));

const LIST = {
  period: "2026-10",
  computedAt: new Date().toISOString(),
  total: 2,
  trips: [
    {
      id: "a1", waybillId: "w1", trackingNumber: "WB-1", period: "2026-10",
      revenue: 1000, fuelCost: 900, labourCost: 0, vehicleCost: 0, overheadCost: 0,
      tollsCost: 150, otherCost: 0, totalCost: 1050, grossMargin: -50, marginPercent: -5,
      provenance: "MEASURED" as const, sourceEntryCount: 3,
      allocationNote: "direct entry", distanceKm: null, clientName: "Client A",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "a2", waybillId: "w2", trackingNumber: "WB-2", period: "2026-10",
      revenue: 400, fuelCost: 30, labourCost: 18.75, vehicleCost: 21.6, overheadCost: 15,
      tollsCost: 0, otherCost: 0, totalCost: 85.35, grossMargin: 314.65, marginPercent: 78.7,
      provenance: "ESTIMATED" as const, sourceEntryCount: 0,
      allocationNote: "no recorded costs — config-rate estimate over 12 km",
      distanceKm: null, clientName: "Client B",
      updatedAt: new Date().toISOString(),
    },
  ],
  summary: {
    measured: { trips: 1, revenue: 1000, cost: 1050, margin: -50 },
    estimated: { trips: 1, revenue: 400, cost: 85.35, margin: 314.65 },
    deliveredNotComputed: 0,
  },
};

describe("TripTruthPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue(LIST);
    mockRecompute.mockResolvedValue({
      period: "2026-10", computedAt: new Date().toISOString(), trips: 2,
      measured: 1, allocated: 0, estimated: 1,
      recordedCost: 1050, estimatedCost: 85.35,
      unallocatedCost: 250, unallocatedEntries: 1,
    });
  });

  it("headlines measured truth only and badges estimates separately", async () => {
    render(<TripTruthPanel />);
    expect(await screen.findByText(/Measured truth · 1 trip/)).toBeInTheDocument();
    expect(screen.getByText(/Estimated · 1 trip \(excluded above\)/)).toBeInTheDocument();
    expect(screen.getByText("MEASURED")).toBeInTheDocument();
    expect(screen.getByText("ESTIMATED")).toBeInTheDocument();
    expect(screen.getByText("WB-1")).toBeInTheDocument();
    expect(screen.getByText(/3 entries/)).toBeInTheDocument();
  });

  it("refetches with the below-cost filter when toggled", async () => {
    render(<TripTruthPanel />);
    await screen.findByText("WB-1");
    fireEvent.click(screen.getByLabelText(/Below-cost trips only/));
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ belowCostOnly: true })),
    );
  });

  it("recomputes and honestly reports costs that could not be tied to a trip", async () => {
    render(<TripTruthPanel />);
    await screen.findByText("WB-1");
    fireEvent.click(screen.getByRole("button", { name: /Recompute/ }));
    expect(await screen.findByText(/could not be tied to a delivered trip/)).toBeInTheDocument();
    expect(mockRecompute).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledTimes(2); // initial load + post-recompute refresh
  });
});
