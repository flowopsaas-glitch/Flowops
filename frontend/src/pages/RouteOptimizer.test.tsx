import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("../api/client", () => ({ api: { get: h.get, post: h.post } }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="route-map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position, children }: { position: [number, number]; children?: ReactNode }) => (
    <div data-testid="route-marker" data-position={position.join(",")}>{children}</div>
  ),
  Polyline: ({ positions }: { positions: [number, number][] }) => (
    <div data-testid="route-line" data-positions={JSON.stringify(positions)} />
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => ({ default: { divIcon: () => ({}) } }));

import RouteOptimizer from "./RouteOptimizer";

const collections = [
  { id: "collection-zero", clientName: "Zero Latitude Pickup", pickupAddress: "Equator Road", pickupLat: 0, pickupLng: 28.04, status: "PENDING" },
  { id: "collection-durban", clientName: "Durban Pickup", pickupAddress: "Durban", pickupLat: -29.8587, pickupLng: 31.0218, status: "PENDING" },
  { id: "collection-unlocated", clientName: "Unlocated Pickup", pickupAddress: "Address only", pickupLat: null, pickupLng: null, status: "PENDING" },
];

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.get.mockResolvedValue({ data: collections });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RouteOptimizer data integrity", () => {
  it("does not present an API failure as an empty collection list", async () => {
    h.get.mockRejectedValue(new Error("Network unavailable"));
    render(<MemoryRouter><RouteOptimizer /></MemoryRouter>);

    expect(await screen.findByText("Collection data unavailable; retry to confirm which stops are available.")).toBeTruthy();
    expect(screen.queryByText("No collections are available.")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("An empty collection list cannot be confirmed");
  });

  it("keeps unlocated pickups visible, excludes them from routing, and accepts zero-valued coordinates", async () => {
    render(<MemoryRouter><RouteOptimizer /></MemoryRouter>);

    expect(await screen.findByText("Unlocated Pickup")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unlocated Pickup/ })).toBeDisabled();
    expect(screen.getAllByTestId("route-marker").map((marker) => marker.getAttribute("data-position"))).toEqual([
      "0,28.04",
      "-29.8587,31.0218",
    ]);
    expect(screen.getByRole("heading", { name: /Stops \(2\/2\)/ })).toBeTruthy();
  });

  it("renders route savings returned by the optimizer and clears stale results when the selection changes", async () => {
    h.post.mockResolvedValue({
      data: {
        stops: [
          { id: "collection-zero", lat: 0, lng: 28.04, label: "Zero Latitude Pickup", seq: 1, legKm: 0 },
          { id: "collection-durban", lat: -29.8587, lng: 31.0218, label: "Durban Pickup", seq: 2, legKm: 12.5 },
        ],
        totalKm: 12.5,
        totalMinutes: 28,
        skipped: 1,
        savedMinutes: 15,
        savedFuelZar: 4.32,
        fuelCostZar: 11.3,
        routingEngine: "osrm",
      },
    });
    render(<MemoryRouter><RouteOptimizer /></MemoryRouter>);

    await screen.findByText("Unlocated Pickup");
    fireEvent.click(screen.getByRole("button", { name: "Optimize" }));

    expect(await screen.findByText("Optimized Route")).toBeTruthy();
    expect(h.post).toHaveBeenCalledWith("/routing/optimize/collections", {
      collectionIds: ["collection-zero", "collection-durban"],
    });
    expect(screen.getByText("R4.32")).toBeTruthy();
    expect(screen.getByText("15 min")).toBeTruthy();
    expect(screen.getByText("R11.30")).toBeTruthy();
    expect(screen.getByText(/1 skipped by optimizer/)).toBeTruthy();
    expect(screen.queryByText("Cost per delivery")).toBeNull();
    expect(screen.queryByText("Time saved vs manual")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Zero Latitude Pickup/ }));
    expect(screen.queryByText("Optimized Route")).toBeNull();
  });
});
