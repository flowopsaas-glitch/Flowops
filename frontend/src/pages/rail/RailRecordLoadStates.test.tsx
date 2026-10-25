import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  listChanges: vi.fn(),
  listOccurrences: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../../api/railChangeApi", () => ({
  listChanges: h.listChanges,
  listOccurrences: h.listOccurrences,
  allocateParty: vi.fn(),
  changeAction: vi.fn(),
  getCancellationCodes: vi.fn(),
  proposeAlternative: vi.fn(),
  closeOccurrence: vi.fn(),
  createOccurrence: vi.fn(),
  filePreliminaryReport: vi.fn(),
  notifyOccurrence: vi.fn(),
  startInvestigation: vi.fn(),
}));
vi.mock("../../components/toast-context", () => ({ useToast: () => ({ showToast: h.showToast }) }));

import ChangeRequestsSection from "./ChangeRequestsSection";
import OccurrencesSection from "./OccurrencesSection";

beforeEach(() => {
  h.listChanges.mockResolvedValue([]);
  h.listOccurrences.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChangeRequestsSection load state", () => {
  it("keeps a list-load failure distinct from an empty record set and can retry", async () => {
    h.listChanges.mockRejectedValueOnce(new Error("change API unavailable"));
    render(<ChangeRequestsSection canWrite={false} canSign={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Change-request records unavailable: change API unavailable/);
    expect(screen.queryByText("No cancellations or reschedules logged.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("No cancellations or reschedules logged.")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(h.listChanges).toHaveBeenCalledTimes(2);
  });
});

describe("OccurrencesSection load state", () => {
  it("does not render a false empty-occurrences row after a failed request and can retry", async () => {
    h.listOccurrences.mockRejectedValueOnce(new Error("occurrence API unavailable"));
    render(<OccurrencesSection canWrite={false} canSign={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Occurrence records unavailable: occurrence API unavailable/);
    expect(screen.queryByText("No occurrences reported.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("No occurrences reported.")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(h.listOccurrences).toHaveBeenCalledTimes(2);
  });
});
