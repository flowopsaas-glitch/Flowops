import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const HOLD = {
  mode: "ROAD",
  ref: "FO-0001",
  epodId: "epod-1",
  counterparty: "Mbeki Traders",
  amount: 1250,
  reason: "Proof of delivery disputed — awaiting resolution",
  nextAction: "Investigate and resolve the dispute (cleared → billing flows; upheld → settle or credit)",
  since: null,
};

const ROWS = [
  { mode: "ROAD", ref: "FO-0001", counterparty: "Mbeki Traders", proof: "DISPUTED", money: "HELD", held: true, holdReason: "disputed", amount: 1250 },
  { mode: "SEA", ref: "SF-0001", counterparty: "Ocean Traders", proof: "VERIFIED", money: "INVOICED", held: false, holdReason: null, amount: 82000 },
];

describe("ProofPayments", () => {
  const g = globalThis as { fetch?: unknown };
  let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { get: vi.fn(), post: vi.fn() };
    g.fetch = vi.fn();
    vi.doMock("../api/client", () => ({ api }));
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.clearAllMocks();
  });

  function stubApi() {
    api.get.mockImplementation((path: string) =>
      path.includes("billing-holds")
        ? Promise.resolve({ holds: [HOLD] })
        : path.includes("proof-board")
          ? Promise.resolve({ rows: ROWS })
          : Promise.resolve({}),
    );
    api.post.mockResolvedValue({});
  }

  it("lists holds first with Clear / Uphold actions and the cross-lifecycle board", async () => {
    stubApi();
    const { default: Page } = await import("./ProofPayments");
    render(<MemoryRouter><Page /></MemoryRouter>);

    expect(screen.getByTestId("proof-payments")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("hold-count").textContent).toBe("1"));
    expect(screen.getByTestId("hold-row").textContent).toContain("Proof of delivery disputed");
    expect(screen.getAllByTestId("board-row").length).toBe(2);
    expect(screen.getAllByTestId("board-row")[1].textContent).toContain("SEA");
  });

  it("resolves a dispute through the ePOD money gate and reloads", async () => {
    stubApi();
    const { default: Page } = await import("./ProofPayments");
    render(<MemoryRouter><Page /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId("clear-FO-0001")).toBeTruthy());
    fireEvent.click(screen.getByTestId("clear-FO-0001"));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/epod/epod-1/resolve-dispute", {
        resolution: "CLEARED",
        resolvedBy: "billing-desk",
      }),
    );
  });

  it("shows the healthy state when nothing is held", async () => {
    api.get.mockImplementation((path: string) =>
      path.includes("billing-holds") ? Promise.resolve({ holds: [] }) : Promise.resolve({ rows: [] }),
    );
    const { default: Page } = await import("./ProofPayments");
    render(<MemoryRouter><Page /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("no-holds")).toBeTruthy());
  });
});
