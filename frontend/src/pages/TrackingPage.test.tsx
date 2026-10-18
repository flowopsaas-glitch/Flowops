import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TrackingPage from "./TrackingPage";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="tracking-map">{children}</div>,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Polyline: () => null,
  Popup: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TileLayer: () => null,
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet", () => ({ default: { divIcon: () => ({}) } }));

const trackingRecord = {
  trackingNumber: "FO-12345",
  status: "IN_TRANSIT",
  statusLabel: "In transit",
  delivered: false,
  recipientName: "A. Customer",
  driver: { name: "Driver One", vehicleReg: "ABC 123 GP" },
  current: { lat: -26.2, lng: 28.04 },
  destination: { lat: 0, lng: 0 },
  remainingKm: 0,
  etaMinutes: 0,
  estimatedDelivery: null,
  deliveredAt: null,
  branding: { brandName: "Parcel Co", logoUrl: null, primaryColor: "#10b981" },
  updatedAt: "2026-10-17T10:00:00.000Z",
};

const okResponse = (record: unknown) => ({
  ok: true,
  json: async () => ({ data: record, statusCode: 200, message: "" }),
});

function renderTracking() {
  return render(
    <MemoryRouter initialEntries={["/track/FO-12345"]}>
      <Routes>
        <Route path="/track/:trackingNumber" element={<TrackingPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TrackingPage", () => {
  it("renders a validated snapshot, supports zero coordinates, and displays zero-minute ETA", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(trackingRecord));
    renderTracking();

    expect(await screen.findByText("FO-12345")).toBeInTheDocument();
    expect(screen.getByText("Parcel Co")).toBeInTheDocument();
    expect(screen.getByText("Arriving now")).toBeInTheDocument();
    expect(screen.getByText(/0\.0 km away/)).toBeInTheDocument();
    expect(screen.getByTestId("tracking-map")).toBeInTheDocument();
    expect(screen.getByText(/Tracking checked/)).toBeInTheDocument();
  });

  it("keeps the last successful record visible and labels it stale when auto-refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ ...trackingRecord, etaMinutes: null, remainingKm: null }));
    let refresh: (() => void) | undefined;
    vi.spyOn(globalThis, "setInterval").mockImplementation(((handler: TimerHandler, delay?: number) => {
      if (delay === 60000 && typeof handler === "function") refresh = handler as () => void;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);

    renderTracking();
    expect(await screen.findByText("FO-12345")).toBeInTheDocument();
    expect(refresh).toBeDefined();

    fetchMock.mockRejectedValueOnce(new Error("Network Error"));
    await act(async () => {
      refresh?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Showing the last successfully loaded snapshot");
    });
    expect(screen.getByText("FO-12345")).toBeInTheDocument();
    expect(screen.getByText(/Last successful response/)).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(okResponse(trackingRecord));
    fireEvent.click(screen.getByRole("button", { name: "Retry tracking" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("FO-12345")).toBeInTheDocument();
  });

  it("does not render a map when neither location contains valid coordinates", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({
      ...trackingRecord,
      current: { lat: 91, lng: 28 },
      destination: { lat: -26.2, lng: Number.NaN },
      etaMinutes: null,
      remainingKm: null,
    }));
    renderTracking();

    expect(await screen.findByText("FO-12345")).toBeInTheDocument();
    expect(screen.queryByTestId("tracking-map")).not.toBeInTheDocument();
    expect(screen.getByText(/Map unavailable — this tracking record has no valid current or destination coordinates/)).toBeInTheDocument();
  });

  it("rejects malformed tracking responses rather than rendering fabricated details", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ trackingNumber: "FO-12345" }));
    renderTracking();

    expect(await screen.findByRole("alert")).toHaveTextContent("incomplete record");
    expect(screen.queryByText("FO-12345")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry tracking" })).toBeInTheDocument();
  });
});
