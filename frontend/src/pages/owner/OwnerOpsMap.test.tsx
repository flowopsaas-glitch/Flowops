import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../../api/client", () => ({ api: { get: h.get } }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="owner-map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position, children }: { position: [number, number]; children?: ReactNode }) => (
    <div data-testid="owner-courier-marker" data-position={position.join(",")}>{children}</div>
  ),
  CircleMarker: ({ center, children }: { center: [number, number]; children?: ReactNode }) => (
    <div data-testid="owner-exception-marker" data-position={center.join(",")}>{children}</div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => ({ default: { divIcon: () => ({}) } }));

import OwnerOpsMap from "./OwnerOpsMap";

const snapshot = {
  generatedAt: "2026-10-18T08:00:00.000Z",
  summary: { activeCouriers: 1, exceptions: 1, tenantsActive: 1 },
  couriers: [
    { id: "shipment-1", status: "IN_TRANSIT", lat: 0, lng: 28.04, tenantId: "tenant-1", tenant: "Tenant One", driver: "Driver One", vehicleReg: "REG-1", trackingNumber: "TRACK-1", destLat: null, destLng: null },
  ],
  exceptions: [
    { id: "exception-1", lat: 91, lng: 181, status: "FAILED_DELIVERY", tenant: "Tenant One", trackingNumber: "TRACK-ERR" },
  ],
};

beforeEach(() => {
  h.get.mockReset();
  h.get.mockResolvedValue({ data: snapshot });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OwnerOpsMap snapshot states", () => {
  it("does not present a failed first request as zero counts or an empty exception list", async () => {
    h.get.mockRejectedValue(new Error("Network unavailable"));
    render(<OwnerOpsMap />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Live operations unavailable");
    expect(screen.getByText("Exception data unavailable; retry to confirm the current list.")).toBeTruthy();
    expect(screen.queryByText(/No delivery exceptions/)).toBeNull();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("retains and labels the last successful snapshot after a refresh failure", async () => {
    h.get.mockResolvedValueOnce({ data: snapshot }).mockRejectedValueOnce(new Error("Refresh failed"));
    render(<OwnerOpsMap />);

    expect(await screen.findByText("TRACK-ERR")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh live operations" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Refresh failed.");
    expect(alert.textContent).toContain("Showing the last successful snapshot");
    expect(screen.getByText("TRACK-ERR")).toBeTruthy();
  });

  it("keeps an exception with invalid coordinates in the list without plotting it", async () => {
    render(<OwnerOpsMap />);

    expect(await screen.findByText("TRACK-ERR")).toBeTruthy();
    expect(screen.getByText("Location unavailable — not plotted")).toBeTruthy();
    expect(screen.getAllByTestId("owner-courier-marker")).toHaveLength(1);
    expect(screen.queryAllByTestId("owner-exception-marker")).toHaveLength(0);
    expect(screen.getByText(/1 record retained in the source counts or exception list/)).toBeTruthy();
  });
});
