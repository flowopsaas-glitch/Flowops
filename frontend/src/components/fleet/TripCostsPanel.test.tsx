import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TripCostsPanel from "./TripCostsPanel";

const { mockGet, mockList, mockCreate, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("../../api/client", () => ({ api: { get: mockGet } }));
vi.mock("../../api/tripCostsApi", () => ({
  listTripCosts: mockList,
  createTripCost: mockCreate,
  deleteTripCost: mockDelete,
}));

const ENTRY = {
  id: "e1",
  driverId: "d1",
  type: "FUEL" as const,
  amount: 850,
  litres: 38.5,
  odometerKm: 101_250,
  note: null,
  occurredAt: new Date().toISOString(),
  source: "DRIVER_APP" as const,
  driver: { id: "d1", name: "Sam Driver", vehicleReg: "CA 123" },
};

describe("TripCostsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: [{ id: "d1", name: "Sam Driver", vehicleReg: "CA 123" }] });
    mockList.mockResolvedValue({
      data: [ENTRY],
      total: 1,
      totals: { byType: { FUEL: { total: 850, count: 1 } }, total: 850, count: 1 },
    });
    mockCreate.mockResolvedValue({ ...ENTRY, id: "e2" });
    mockDelete.mockResolvedValue(undefined);
  });

  it("shows recorded-only totals and the captured entries", async () => {
    render(<TripCostsPanel />);
    expect(await screen.findByText(/Recorded this month/)).toBeInTheDocument();
    expect(screen.getByText("Sam Driver")).toBeInTheDocument();
    expect(screen.getByText(/38\.5 L/)).toBeInTheDocument();
    // The honesty rule: never imply trips without entries cost zero.
    expect(screen.getByText(/unknown cost, never zero/i)).toBeInTheDocument();
  });

  it("records a fuel cost for the chosen driver and refreshes the list", async () => {
    render(<TripCostsPanel />);
    await screen.findByText("Sam Driver");
    fireEvent.change(screen.getByLabelText("Driver"), { target: { value: "d1" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "920" } });
    fireEvent.change(screen.getByLabelText("Litres (fuel)"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: /Record cost/ }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "FUEL", amount: 920, driverId: "d1", litres: 40 }),
    );
    expect(await screen.findByText(/Cost recorded/)).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledTimes(2); // initial load + post-save refresh
  });

  it("refuses to submit without a driver, with a visible reason", async () => {
    render(<TripCostsPanel />);
    await screen.findByText("Sam Driver");
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Record cost/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Choose the driver/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
