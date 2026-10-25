import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TruckPack from "./TruckPack";

const { mockGetPack } = vi.hoisted(() => ({ mockGetPack: vi.fn() }));

vi.mock("../../api/tripTruthApi", () => ({ getTruckPack: mockGetPack }));

const PACK = {
  period: "2026-10",
  trucks: [
    {
      driverId: "d1", driverName: "Sam Driver", vehicleReg: "CA 123",
      trips: 3, measuredTrips: 2, estimatedTrips: 1,
      revenue: 3000, recordedCost: 2300, tripMargin: 700, marginPct: 23.3,
      estimatedRevenue: 500, estimatedCost: 85,
      serviceCost: 250, serviceEvents: 1, netMargin: 450,
      costPerKm: { value: 6.57, loadedKm: 350, tripsWithDistance: 3, trips: 3 },
      belowCostTrips: 1, openExceptions: 1, worstTripMargin: -400,
      km: {
        status: "MEASURED" as const, loadedKm: 350, odometerSpanKm: 1000,
        readings: 3, emptyKm: 650, emptyPct: 65, note: "upper bound",
      },
    },
    {
      driverId: "d2", driverName: "Pat Ndlovu", vehicleReg: "CA 999",
      trips: 1, measuredTrips: 1, estimatedTrips: 0,
      revenue: 800, recordedCost: 300, tripMargin: 500, marginPct: 62.5,
      estimatedRevenue: 0, estimatedCost: 0,
      serviceCost: 0, serviceEvents: 0, netMargin: 500,
      costPerKm: null,
      belowCostTrips: 0, openExceptions: 0, worstTripMargin: 500,
      km: {
        status: "NOT_MEASURED" as const, loadedKm: null, odometerSpanKm: null,
        readings: 1, emptyKm: null, emptyPct: null,
        note: "No odometer span this period — log the odometer with fuel entries and empty km becomes measurable.",
      },
    },
  ],
  unassigned: { trips: 1, measuredTrips: 1, estimatedTrips: 0, revenue: 300, recordedCost: 100, tripMargin: 200 },
  fleet: {
    trucks: 2, trips: 4, measuredTrips: 3, estimatedTrips: 1,
    revenue: 3800, recordedCost: 2600, tripMargin: 1200, serviceCost: 250, netMargin: 950,
  },
};

describe("TruckPack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPack.mockResolvedValue(PACK);
  });

  it("shows per-truck net margin after workshop spend, with measured trips only", async () => {
    render(<TruckPack period="2026-10" />);
    expect(await screen.findByText("Sam Driver")).toBeInTheDocument();
    expect(screen.getByText(/1 below-cost trip · 1 open exceptions · 1 estimated trips excluded/)).toBeInTheDocument();
    expect(screen.getByText(/over 3\/3 trips/)).toBeInTheDocument();
  });

  it("shows measured empty km as an upper bound, and refuses to invent it otherwise", async () => {
    render(<TruckPack period="2026-10" />);
    await screen.findByText("Sam Driver");
    expect(screen.getByText(/650 km/)).toBeInTheDocument();
    expect(screen.getByText(/65\.0% of 1,000 km · upper bound/)).toBeInTheDocument();
    expect(screen.getByText("not measured")).toBeInTheDocument();
    expect(screen.getByText(/log the odometer with fuel entries/)).toBeInTheDocument();
  });

  it("discloses trips that could not be attributed to a truck", async () => {
    render(<TruckPack period="2026-10" />);
    await screen.findByText("Sam Driver");
    expect(screen.getByText(/Not attributed to a truck/)).toBeInTheDocument();
  });
});
