import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  importRailTimetable: vi.fn(),
  listRailTimetableImports: vi.fn(),
  listRailTimetableRows: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../api/railApi", () => ({
  importRailTimetable: h.importRailTimetable,
  listRailTimetableImports: h.listRailTimetableImports,
  listRailTimetableRows: h.listRailTimetableRows,
}));
vi.mock("../components/toast-context", () => ({
  useToast: () => ({ showToast: h.showToast }),
}));

import RailTimetable from "./RailTimetable";

const IMPORT = {
  id: "import-1",
  sourceName: "annexure-33a.tsv",
  rowCount: 1,
  importedAt: "2026-10-12T06:00:00.000Z",
  companyId: "tenant-1",
};

const mount = () => render(<MemoryRouter><RailTimetable /></MemoryRouter>);

beforeEach(() => {
  h.importRailTimetable.mockResolvedValue({ ...IMPORT, rowCount: 1 });
  h.listRailTimetableImports.mockResolvedValue([]);
  h.listRailTimetableRows.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RailTimetable upload and data states", () => {
  it("accepts only file types the backend supports", async () => {
    mount();
    await screen.findByText(/No timetable imports yet/i);
    const fileInput = screen.getByLabelText("Choose a tab-separated timetable file") as HTMLInputElement;
    expect(fileInput.accept).toContain(".txt");
    expect(fileInput.accept).toContain(".tsv");
    expect(fileInput.accept).not.toContain(".csv");
    expect(screen.getByText("Tab-separated .txt or .tsv only")).toBeTruthy();
  });

  it("shows an empty imports state only after a successful list request", async () => {
    h.listRailTimetableImports.mockRejectedValueOnce(new Error("service unavailable"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load timetable imports: service unavailable/);
    expect(screen.queryByText(/No timetable imports yet/i)).toBeNull();
  });

  it("shows a row-load error instead of an empty-search result and offers a retry", async () => {
    h.listRailTimetableImports.mockResolvedValue([IMPORT]);
    h.listRailTimetableRows.mockRejectedValue(new Error("row endpoint unavailable"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load timetable rows: row endpoint unavailable/);
    expect(screen.queryByText(/No schedule rows match this search/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("resets imports and row loading after an upload failure and exposes a truthful error", async () => {
    h.importRailTimetable.mockRejectedValueOnce(new Error("unsupported file format"));
    mount();
    await screen.findByText(/No timetable imports yet/i);
    const input = screen.getByLabelText("Choose a tab-separated timetable file");
    const file = new File(["not a timetable"], "bad.tsv", { type: "text/tab-separated-values" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not import timetable: unsupported file format/);
    await waitFor(() => expect(screen.getByText(/No timetable imports yet/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Import timetable" })).not.toBeDisabled();
    expect(screen.queryByText(/Loading timetable imports/i)).toBeNull();
    expect(screen.queryByText(/Loading timetable…/i)).toBeNull();
  });

  it("renders an explicit empty search result after a successful rows request", async () => {
    h.listRailTimetableImports.mockResolvedValue([IMPORT]);
    mount();
    expect(await screen.findByText(/No schedule rows match this search/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
