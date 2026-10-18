import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../api/client", () => ({ api: { get: h.get } }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "ops-1", companyId: "tenant-1" } }) }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="field-map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position, children }: { position: [number, number]; children?: ReactNode }) => (
    <div data-testid="field-marker" data-position={position.join(",")}>{children}</div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => ({ default: { divIcon: () => ({}) } }));

import FieldDeliveryPage from "./FieldDeliveryPage";

const locatedDriver = {
  id: "driver-zero-lat",
  name: "Zero Latitude Driver",
  status: "AVAILABLE",
  lastLat: 0,
  lastLng: 28.04,
  lastSeen: new Date().toISOString(),
  jobsToday: 2,
  activeCollections: [],
  activeShipments: [],
};

beforeEach(() => {
  h.get.mockReset();
  h.get.mockResolvedValue({ data: [locatedDriver] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FieldDeliveryPage source and location states", () => {
  it("does not show a false empty fleet when the initial request fails", async () => {
    h.get.mockRejectedValue(new Error("Network unavailable"));
    render(<MemoryRouter><FieldDeliveryPage /></MemoryRouter>);

    expect(await screen.findByText("Driver data unavailable")).toBeTruthy();
    expect(screen.queryByText("No drivers found")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("No driver totals or empty state can be confirmed");
    expect(screen.getAllByText("—")).toHaveLength(6);
  });

  it("accepts a zero latitude as a real GPS location", async () => {
    render(<MemoryRouter><FieldDeliveryPage /></MemoryRouter>);

    expect(await screen.findAllByText("Zero Latitude Driver")).not.toHaveLength(0);
    expect(screen.getByText("1 drivers on map")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Track" })).toBeTruthy();
    expect(screen.getByTestId("field-marker").getAttribute("data-position")).toBe("0,28.04");
  });

  it("keeps the last successful fleet visible and labels it stale after refresh failure", async () => {
    h.get
      .mockResolvedValueOnce({ data: [locatedDriver] })
      .mockRejectedValueOnce(new Error("Refresh failed"));
    render(<MemoryRouter><FieldDeliveryPage /></MemoryRouter>);

    expect(await screen.findAllByText("Zero Latitude Driver")).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Refresh failed.");
    expect(alert.textContent).toContain("Showing the last successful snapshot");
    expect(screen.getAllByText("Zero Latitude Driver")).not.toHaveLength(0);
  });
});
