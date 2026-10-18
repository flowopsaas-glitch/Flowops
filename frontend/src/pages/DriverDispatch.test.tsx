import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  showToast: vi.fn(),
  setView: vi.fn(),
  fitBounds: vi.fn(),
}));

vi.mock("../api/client", () => ({ api: { get: h.get, post: h.post } }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1", role: "ADMIN", companyId: "tenant-1" } }) }));
vi.mock("../hooks/useSocket", () => ({ useSocket: () => ({ socket: null, isConnected: false }) }));
vi.mock("../components/ToastProvider", () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock("../components/premium/CommandCenterHeader", () => ({
  CommandCenterHeader: ({ children, title }: { children?: ReactNode; title?: string }) => <header><h1>{title}</h1>{children}</header>,
}));
vi.mock("react-leaflet-cluster", () => ({
  default: ({ children }: { children?: ReactNode }) => <div data-testid="marker-clusters">{children}</div>,
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="dispatch-map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position, children }: { position: [number, number]; children?: ReactNode }) => (
    <div data-testid="map-marker" data-position={position.join(",")}>{children}</div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useMap: () => ({ setView: h.setView, fitBounds: h.fitBounds }),
}));

import DriverDispatch from "./DriverDispatch";

beforeEach(() => {
  h.get.mockImplementation((path: string) => {
    if (path === "/waybills") {
      return Promise.resolve({ data: [{ id: "wb-1", status: "PENDING", trackingNumber: "WB-1", recipientAddress: "Durban" }] });
    }
    if (path === "/collections") {
      return Promise.resolve({ data: [{ id: "col-1", status: "PENDING", clientName: "Collection 1", pickupLat: -29.8587, pickupLng: 31.0218, pickupAddress: "Durban" }] });
    }
    if (path === "/drivers") {
      return Promise.resolve({ data: [
        { id: "driver-unlocated", name: "Unlocated driver", status: "AVAILABLE", vehicleReg: "REG-1" },
        { id: "driver-located", name: "Located driver", status: "ON_ROUTE", lastLat: -26.2, lastLng: 28.04, vehicleReg: "REG-2" },
      ] });
    }
    if (path === "/shipments") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DriverDispatch map data integrity", () => {
  it("does not plot fabricated coordinates and keeps unlocated records available for manual dispatch", async () => {
    render(<MemoryRouter><DriverDispatch /></MemoryRouter>);
    await screen.findAllByText("WB-1");
    expect(screen.getAllByText("Location unavailable — not shown on map")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "MAP" }));

    expect(await screen.findByTestId("dispatch-map")).toBeTruthy();
    expect(screen.getByText("1 located job · 1 located driver.")).toBeTruthy();
    expect(screen.getByText(/2 records not plotted because coordinates are missing or invalid/)).toBeTruthy();
    expect(screen.getAllByTestId("map-marker")).toHaveLength(2);
    expect(screen.getAllByTestId("map-marker").map((marker) => marker.getAttribute("data-position"))).toEqual([
      "-29.8587,31.0218",
      "-26.2,28.04",
    ]);
    expect(h.fitBounds).toHaveBeenCalledWith([[ -29.8587, 31.0218 ], [ -26.2, 28.04 ]], { padding: [36, 36], maxZoom: 12 });
    expect(screen.getByRole("button", { name: "Assign Unlocated driver" })).toBeTruthy();
    expect(screen.queryByText(/Proximity fit/)).toBeNull();
    expect(screen.queryByText(/AUTO-ASSIGN/)).toBeNull();
  });

  it("clears stale dispatch records when every source fails on refresh", async () => {
    render(<MemoryRouter><DriverDispatch /></MemoryRouter>);
    expect(await screen.findAllByText("WB-1")).not.toHaveLength(0);

    h.get.mockRejectedValue(new Error("Unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh dispatch data" }));

    expect(await screen.findByText(/Backend offline/)).toBeTruthy();
    expect(screen.queryByText("WB-1")).toBeNull();
    expect(screen.getByText("Job queue unavailable")).toBeTruthy();
  });

  it("shows partial source failures instead of false empty queue and fleet states", async () => {
    h.get.mockImplementation((path: string) => {
      if (path === "/waybills" || path === "/drivers") return Promise.reject(new Error("Unavailable"));
      if (path === "/collections" || path === "/shipments") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    render(<MemoryRouter><DriverDispatch /></MemoryRouter>);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Waybills");
    expect(alert.textContent).toContain("Drivers");
    expect(screen.getByText("Job queue unavailable")).toBeTruthy();
    expect(screen.getByText(/an empty queue cannot be confirmed/i)).toBeTruthy();
    expect(screen.queryByText("No unassigned jobs")).toBeNull();
    expect(screen.getByText("Driver list unavailable")).toBeTruthy();
    expect(screen.queryByText("No drivers registered")).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh dispatch data" })).toBeTruthy();
  });

  it("does not treat an absent driver status as available", async () => {
    h.get.mockImplementation((path: string) => {
      if (path === "/drivers") return Promise.resolve({ data: [{ id: "unknown", name: "Status unknown", vehicleReg: "REG-X" }] });
      if (path === "/waybills" || path === "/collections" || path === "/shipments") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    render(<MemoryRouter><DriverDispatch /></MemoryRouter>);
    const assignButton = await screen.findByRole("button", { name: "Manual Assign" });
    expect(assignButton).toBeDisabled();
    expect(screen.getByText("UNKNOWN")).toBeTruthy();
  });
});
