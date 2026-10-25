import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  getTariffStatus: vi.fn(),
  getAncillaryServices: vi.fn(),
  listCalculations: vi.fn(),
  listConsignments: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../../api/railTariffApi", () => ({
  getTariffStatus: h.getTariffStatus,
  getAncillaryServices: h.getAncillaryServices,
  listCalculations: h.listCalculations,
}));
vi.mock("../../api/railApi", () => ({ listConsignments: h.listConsignments }));
vi.mock("../../components/toast-context", () => ({ useToast: () => ({ showToast: h.showToast }) }));

import TariffPanel from "./TariffPanel";

beforeEach(() => {
  h.getTariffStatus.mockResolvedValue({
    constants: { infrastructureEscalationPct: 8.5, electricityEscalationPct: 4.42, dieselBasePricePerLitreZar: 25.5, source: "test fixture" },
    corridors: [],
    summary: { corridors: 0, withVerifiedRate: 0, ancillaryLines: 0, ancillaryPublished: 0, ancillaryTbd: 0, ancillaryNotPublished: 0 },
    fromCatalogFallback: true,
    message: "No verified tariff rates loaded.",
  });
  h.getAncillaryServices.mockResolvedValue([]);
  h.listCalculations.mockResolvedValue([]);
  h.listConsignments.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TariffPanel data availability", () => {
  it("distinguishes a failed saved-calculation request from a true empty list and retries", async () => {
    h.listCalculations.mockRejectedValueOnce(new Error("calculation endpoint unavailable"));
    render(<TariffPanel canWrite={false} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Tariff data unavailable: calculation endpoint unavailable/);
    expect(screen.queryByText("No calculations saved yet.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("No calculations saved yet.")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(h.listCalculations).toHaveBeenCalledTimes(2);
  });
});
