import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

/**
 * General Average page.
 *
 * The UI gate — "Release" is disabled until security is lodged — is a courtesy.
 * The gate that matters is in the service, which refuses the release outright.
 * These tests pin the courtesy so the two cannot drift apart: if the button
 * ever lights up for unsecured cargo, the desk is being told a release is
 * available when the server is about to refuse it.
 */

const h = vi.hoisted(() => ({
  events: [] as Row[],
  detail: null as Row | null,
  candidates: { candidates: [] as Row[], matchedOn: "voyage" } as Row,
  posted: [] as { url: string; body?: unknown }[],
  showToast: vi.fn(),
}));

type Row = Record<string, any>;

vi.mock("../../api/client", () => {
  const get = vi.fn(async (url: string) => {
    if (url === "/general-average/events") return h.events;
    if (url.endsWith("/candidates")) return h.candidates;
    if (url.startsWith("/general-average/events/")) return h.detail;
    return [];
  });
  const post = vi.fn(async (url: string, body?: unknown) => {
    h.posted.push({ url, body });
    return h.detail;
  });
  return { api: { get, post }, getToken: () => "t", getApiBaseUrl: () => "/api/v1" };
});

// The real provider memoises showToast with useCallback(..., []), so it is
// referentially stable. Returning a fresh vi.fn() per call here would make
// every useCallback keyed on it unstable and re-run the load effect forever.
vi.mock("../../components/toast-context", () => ({
  useToast: () => ({ showToast: h.showToast }),
}));

import GeneralAveragePage from "./GeneralAverage";

const ev = (over: Row = {}): Row => ({
  id: "ev-1",
  vesselName: "MV Kestrel",
  voyageNumber: "026W",
  occurredAt: "2026-02-01T00:00:00.000Z",
  nature: "Engine room fire",
  status: "DECLARED",
  currency: "USD",
  totalExpenditure: 700,
  totalSacrifice: 500,
  createdAt: "2026-02-01T00:00:00.000Z",
  contributors: [],
  ...over,
});

const contrib = (over: Row = {}): Row => ({
  id: "c-1",
  eventId: "ev-1",
  shipmentFileId: "sf-1",
  contributoryValue: 1000,
  valueBasis: "CIF",
  adjustedValue: null,
  sharePct: 50,
  estimatedContribution: 600,
  assessedContribution: null,
  securityType: null,
  securityAmount: null,
  securityLodgedAt: null,
  releasedAt: null,
  balanceDue: null,
  shipmentFile: { id: "sf-1", fileNumber: "F-1001", consigneeName: "Acme Imports" },
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <GeneralAveragePage />
    </MemoryRouter>,
  );

describe("GeneralAverage page", () => {
  beforeEach(() => {
    h.events = [];
    h.detail = null;
    h.candidates = { candidates: [], matchedOn: "voyage" };
    h.posted = [];
  });

  it("explains the liability when nothing has been declared", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/No general average declared/i)).toBeTruthy());
    // The surprise cargo owners hit: undamaged goods still owe a contribution.
    expect(screen.getByText(/arrived undamaged/i)).toBeTruthy();
  });

  it("lists events with their status", async () => {
    h.events = [ev()];
    renderPage();
    await waitFor(() => expect(screen.getByText("MV Kestrel")).toBeTruthy());
    expect(screen.getByText("Declared")).toBeTruthy();
  });

  it("keeps Release disabled while no security is lodged", async () => {
    h.events = [ev()];
    h.detail = ev({ contributors: [contrib()] });
    renderPage();

    await waitFor(() => expect(screen.getByText("MV Kestrel")).toBeTruthy());
    await userEvent.click(screen.getByText("MV Kestrel"));

    await waitFor(() => expect(screen.getByText("F-1001")).toBeTruthy());
    const release = screen.getByTitle(/security must be lodged/i);
    expect((release as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/not yet released/i)).toBeTruthy();
  });

  it("enables Release once security is on record, and posts the release", async () => {
    const user = userEvent.setup();
    h.events = [ev()];
    h.detail = ev({
      contributors: [
        contrib({
          securityType: "AVERAGE_BOND",
          securityAmount: 600,
          securityLodgedAt: "2026-02-05T00:00:00.000Z",
        }),
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("MV Kestrel")).toBeTruthy());
    await user.click(screen.getByText("MV Kestrel"));
    await waitFor(() => expect(screen.getByText("F-1001")).toBeTruthy());

    const release = screen.getByTitle("Record release");
    expect((release as HTMLButtonElement).disabled).toBe(false);
    await user.click(release);

    await waitFor(() =>
      expect(h.posted.some((p) => p.url.endsWith("/contributors/c-1/release"))).toBe(true),
    );
  });

  it("offers Lodge security for an unsecured cargo interest", async () => {
    const user = userEvent.setup();
    h.events = [ev()];
    h.detail = ev({ contributors: [contrib()] });
    renderPage();

    await waitFor(() => expect(screen.getByText("MV Kestrel")).toBeTruthy());
    await user.click(screen.getByText("MV Kestrel"));
    await waitFor(() => expect(screen.getByText("F-1001")).toBeTruthy());

    expect(screen.getByText(/Lodge security/i)).toBeTruthy();
  });

  it("shows the GA fund as expenditure plus sacrifice", async () => {
    const user = userEvent.setup();
    h.events = [ev()];
    h.detail = ev({ contributors: [contrib()] });
    renderPage();

    await waitFor(() => expect(screen.getByText("MV Kestrel")).toBeTruthy());
    await user.click(screen.getByText("MV Kestrel"));
    await waitFor(() => expect(screen.getByText("F-1001")).toBeTruthy());

    // 700 + 500, and the contributor's 50% share of it is 600.
    expect(screen.getByText(/1,200/)).toBeTruthy();
    expect(screen.getByText("50.00%")).toBeTruthy();
    expect(screen.getByText(/600/)).toBeTruthy();
  });

  it("flags a non-CIF candidate for review instead of converting it", async () => {
    const user = userEvent.setup();
    h.events = [ev()];
    h.detail = ev({ contributors: [contrib()] });
    h.candidates = {
      matchedOn: "imo",
      candidates: [
        {
          shipmentFileId: "sf-9",
          fileNumber: "F-1009",
          consigneeName: "Beta Traders",
          pod: "Durban",
          incoterm: "FOB",
          suggestedValue: 500,
          basis: "CIF",
          needsReview: true,
        },
      ],
    };
    renderPage();

    await waitFor(() => expect(screen.getByText("MV Kestrel")).toBeTruthy());
    await user.click(screen.getByText("MV Kestrel"));
    await waitFor(() => expect(screen.getByText("F-1001")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getByText(/F-1009/)).toBeTruthy());

    expect(screen.getByText(/Not CIF/i)).toBeTruthy();
    expect(screen.getByText(/not converted for you/i)).toBeTruthy();
  });

  it("separates amounts still owed from amounts refundable", async () => {
    const user = userEvent.setup();
    h.events = [ev({ status: "ADJUSTED" })];
    h.detail = ev({
      status: "ADJUSTED",
      contributors: [
        contrib({ id: "c-1", assessedContribution: 800, securityAmount: 600, balanceDue: 200 }),
        contrib({ id: "c-2", shipmentFileId: "sf-2", shipmentFile: { id: "sf-2", fileNumber: "F-1002", consigneeName: "Beta" }, assessedContribution: 200, securityAmount: 350, balanceDue: -150 }),
      ],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("MV Kestrel")).toBeTruthy());
    await user.click(screen.getByText("MV Kestrel"));
    await waitFor(() => expect(screen.getByText(/F-1001/)).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /award & settlement/i }));

    // Exact match: the tab reads "Award & settlement" and would also match /Settlement/i.
    await waitFor(() => expect(screen.getByText("Settlement", { exact: true })).toBeTruthy());
    // The h3 sits directly inside the settlement card, so closest("div") is the
    // card itself. Going up another level would swallow the award card, whose
    // inputs also contain 200.
    const settlement = screen.getByText("Settlement", { exact: true }).closest("div")!;
    expect(within(settlement).getByText("Still owed")).toBeTruthy();
    expect(within(settlement).getByText("Refundable")).toBeTruthy();
    // Assessed 800 vs 600 secured -> 200 owed; 200 vs 350 secured -> 150 back.
    expect(within(settlement).getByText(/200(\.00)?$/)).toBeTruthy();
    expect(within(settlement).getByText(/150(\.00)?$/)).toBeTruthy();
  });
});
