import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * The service now returns `null` where it used to return a confident number
 * with no data behind it: a driver with no shipments has no success rate, and a
 * zone with no prior window has no growth rate.
 *
 * These tests exist because `null` is the one value a template renders by
 * accident: `{zone.growthPct}%` prints "null%" without complaint and the bug
 * ships silently. The backend can be right and the screen still wrong.
 */

vi.mock("../api/client", () => ({
  api: { get: vi.fn() },
  default: { get: vi.fn() },
}));

import { api } from "../api/client";
import FleetIntelligence from "./FleetIntelligence";

const REPORT = {
  generatedAt: "2026-11-11T09:00:00Z",
  networkHealthScore: 72,
  zones: {
    totalZones: 2,
    concentration: 50,
    hotZones: [],
    coldZones: [],
    insight: "Demand is evenly distributed.",
    zones: [
      // Brand-new zone: no prior window, so no growth rate.
      { zone: "Soweto", pickups: 1, deliveries: 0, total: 1, growthPct: null, trend: "NEW" },
      // Established zone with a real baseline behind it.
      { zone: "Sandton", pickups: 10, deliveries: 10, total: 20, growthPct: 100, trend: "SURGING" },
    ],
  },
  drivers: {
    totalDrivers: 2,
    avgUtilization: 45,
    highPerformers: 1,
    mediumPerformers: 0,
    lowPerformers: 1,
    insight: "Fleet is mixed.",
    drivers: [
      // Idle all month: no shipments, therefore no success rate.
      { id: "idle", name: "Idle Driver", phone: null, vehicleType: "Van", delivered7d: 0, delivered30d: 0, avgPerDay: 0, successRate: null, utilization: 0, rating: "LOW" },
      { id: "busy", name: "Busy Driver", phone: null, vehicleType: "Truck", delivered7d: 8, delivered30d: 30, avgPerDay: 1.1, successRate: 90, utilization: 100, rating: "HIGH" },
    ],
  },
  idle: { idleCount: 0, totalDrivers: 2, idleRatePct: 0, estimatedWaste: 0, drivers: [], insight: "No idle fleet detected." },
  forecast: {
    history: [{ month: "Jun 2026", count: 50 }],
    currentLoad: 50,
    currentCapacity: 160,
    capacityUsedPct: 31,
    activeDrivers: 1,
    monthlyGrowthRate: 0,
    monthsUntilCapacity: null,
    forecast: [{ month: "Feb 2027", projected: 50, capacityPct: 31 }],
    driversNeeded3mo: 0,
    insight: "Capacity is comfortable.",
  },
  branches: { branchCount: 0, branches: [], imbalanceScore: 0, insight: "No branches." },
  repositioning: { count: 0, recommendations: [], insight: "Nothing to reposition." },
};

describe("FleetIntelligence — rendering a rate that has no data", () => {
  beforeEach(() => {
    // The page does setReport(res?.data ?? res), so the report is one level in.
    vi.mocked(api.get).mockResolvedValue({ data: REPORT } as never);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <FleetIntelligence />
      </MemoryRouter>,
    );

  it("shows 'no data yet' for a driver with no shipments instead of 100%", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Idle Driver")).toBeTruthy());

    expect(screen.getByText(/no data yet/i)).toBeTruthy();
    // The old behaviour printed a perfect score for a driver who did nothing.
    expect(screen.queryByText(/100% success/i)).toBeNull();
  });

  it("shows 'new' for a zone with no baseline instead of +100%", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Soweto")).toBeTruthy());

    expect(screen.getAllByText(/^new$/i).length).toBeGreaterThan(0);
  });

  it("still renders real percentages when there is a baseline", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Sandton")).toBeTruthy());

    expect(screen.getByText(/90% success/i)).toBeTruthy();
    expect(screen.getByText(/\+100%/)).toBeTruthy();
  });

  it("does not render a bare '%' where a rate is missing", async () => {
    // What the unguarded template actually produces. React DROPS a null child
    // rather than stringifying it, so `{zone.growthPct}%` renders "%" — not
    // "null%". A bare percent sign is quieter than "null%" but no less wrong,
    // and nothing in tsc or vitest objects to it. This is the reason a backend
    // that correctly returns null still needs a test at the screen.
    renderPage();
    await waitFor(() => expect(screen.getByText("Soweto")).toBeTruthy());

    expect(screen.queryByText(/^\s*%\s*$/)).toBeNull();
    expect(screen.queryByText(/^\s*%\s*success\s*$/)).toBeNull();
  });
});
