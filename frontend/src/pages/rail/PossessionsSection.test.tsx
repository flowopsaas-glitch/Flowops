import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  listPossessions: vi.fn(),
  getPossessionConflicts: vi.fn(),
  getCorridors: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../../api/railChangeApi", () => ({
  listPossessions: h.listPossessions,
  getPossessionConflicts: h.getPossessionConflicts,
  cancelPossession: vi.fn(),
  completePossession: vi.fn(),
  createPossession: vi.fn(),
}));
vi.mock("../../api/railSlotApi", () => ({ getCorridors: h.getCorridors }));
vi.mock("../../components/toast-context", () => ({ useToast: () => ({ showToast: h.showToast }) }));

import PossessionsSection from "./PossessionsSection";

beforeEach(() => {
  h.listPossessions.mockResolvedValue([]);
  h.getPossessionConflicts.mockResolvedValue({ conflicts: [], unscheduled: [], unresolved: [], consignmentsChecked: 0 });
  h.getCorridors.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PossessionsSection data availability", () => {
  it("reports a failed conflict scan and never presents it as all-clear", async () => {
    h.getPossessionConflicts.mockRejectedValueOnce(new Error("conflict endpoint unavailable"));
    render(<PossessionsSection canWrite={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Possession conflict scan unavailable: conflict endpoint unavailable/);
    expect(screen.getByRole("alert")).toHaveTextContent(/No all-clear status is implied/);
    expect(screen.getByText("No possession windows recorded.")).toBeTruthy();
  });

  it("does not call a failed possession-list request an empty list", async () => {
    h.listPossessions.mockRejectedValueOnce(new Error("possession endpoint unavailable"));
    render(<PossessionsSection canWrite={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Possession-window records unavailable: possession endpoint unavailable/);
    expect(screen.queryByText("No possession windows recorded.")).toBeNull();
  });

  it("can retry a failed possession-list request", async () => {
    h.listPossessions.mockRejectedValueOnce(new Error("temporary possession endpoint outage"));
    render(<PossessionsSection canWrite={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/temporary possession endpoint outage/);
    fireEvent.click(screen.getByRole("button", { name: "Refresh possession data" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByText("No possession windows recorded.")).toBeTruthy();
    expect(h.listPossessions).toHaveBeenCalledTimes(2);
  });

  it("renders a genuine empty state only after a successful conflict scan and list", async () => {
    render(<PossessionsSection canWrite={false} />);
    expect(await screen.findByText("No possession windows recorded.")).toBeTruthy();
    expect(screen.queryByText(/conflict scan unavailable/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
