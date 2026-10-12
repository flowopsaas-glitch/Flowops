import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const BOARD = {
  asOf: "2026-10-12T18:00:00Z",
  summary: {
    drivers: 2, onDuty: 1, offDuty: 1,
    byMode: { TRUCK: 1 },
    fatigueWarn: 1, fatigueCritical: 0,
    openLoads: 2, deliveredToday: 3,
  },
  roster: [
    {
      driverId: "d1", driverName: "Kabelo", phone: "071", state: "ON_DUTY", mode: "TRUCK",
      craft: "Truck", vehicleReg: "GP 42", dutyId: "duty-1",
      startedAt: "2026-10-12T10:00:00Z", hoursOnDuty: 8, fatigue: "WARN",
      openLoads: 2, deliveredToday: 3,
    },
    {
      driverId: "d2", driverName: "Zanele", phone: null, state: "OFF_DUTY", mode: null,
      craft: "—", vehicleReg: null, dutyId: null,
      startedAt: null, hoursOnDuty: 0, fatigue: "OK",
      openLoads: 0, deliveredToday: 0,
    },
  ],
};

describe("FleetDutyBoard", () => {
  const g = globalThis as any;
  let api: any;

  beforeEach(() => {
    api = { get: vi.fn().mockResolvedValue(BOARD), post: vi.fn().mockResolvedValue({}) };
    g.fetch = vi.fn();
    vi.doMock("../api/client", () => ({ api }));
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("shows the roster with craft, vehicle, shift clock and load", async () => {
    const { default: Page } = await import("./FleetDutyBoard");
    render(<MemoryRouter><Page /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("on-duty").textContent).toBe("1"));
    expect(screen.getAllByTestId("roster-row").length).toBe(2);
    expect(screen.getAllByTestId("roster-row")[0].textContent).toContain("Kabelo");
    expect(screen.getAllByTestId("roster-row")[0].textContent).toContain("GP 42");
    expect(screen.getAllByTestId("roster-row")[0].textContent).toContain("WARN");
  });

  it("force-ends a stuck duty through the two-step confirm", async () => {
    const { default: Page } = await import("./FleetDutyBoard");
    render(<MemoryRouter><Page /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("force-end-d1")).toBeTruthy());
    fireEvent.click(screen.getByTestId("force-end-d1"));
    fireEvent.click(screen.getByTestId("confirm-end-d1"));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/dispatch/fleet-duty/duty-1/force-end", {
        note: "force-ended from the duty board",
      }),
    );
  });

  it("shows the empty state when no drivers are active", async () => {
    api.get.mockResolvedValue({ summary: null, roster: [] });
    const { default: Page } = await import("./FleetDutyBoard");
    render(<MemoryRouter><Page /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("No active drivers in this fleet yet.")).toBeTruthy());
  });
});
