import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RailCapacity from "./RailCapacity";
import { capacityDb, capacityFYs, capacityRoutes } from "../data/railCapacityData";
import { routeHeadroom } from "../data/railCapacityAnalysis";

/**
 * Behavioural tests for `/rail/slots` against the 2026-10-23 revision of the Capacity Statement.
 *
 * The data-level checks live in `RailAnnexure33Verification.test.ts`; these cover what the page
 * actually renders, in particular that the retired E-33B-01 sparse-cell banner can no longer
 * appear and that every fiscal year offers real allocation data.
 */

const mount = () => render(<MemoryRouter><RailCapacity /></MemoryRouter>);

afterEach(cleanup);

const routeLabel = (route: string) => route;

describe("Slots & Capacity page — 2026-10-23 revision", () => {
  it("no longer shows the retired E-33B-01 sparse-cell warning", () => {
    mount();
    // If the flag text were still rendered it would appear as the banner heading.
    expect(screen.queryByText(/source sparse cells/i)).toBeNull();
    expect(screen.queryByText(/FY26\/27 only/i)).toBeNull();
  });

  it("offers every fiscal year in the selector, none of them allocation-starved", () => {
    mount();
    const fySelect = screen.getByLabelText(/Financial year/i) as HTMLSelectElement;
    expect([...fySelect.options].map((o) => o.value)).toEqual(capacityFYs);

    for (const fy of capacityFYs) {
      fireEvent.change(fySelect, { target: { value: fy } });
      // The workbook now populates allocations for all five years, so no FY may warn.
      expect(screen.queryByText(/No allocation data for/i), fy).toBeNull();
    }
  });

  it("carries allocation data on 184 of 207 rows in every fiscal year, uniformly", () => {
    // Same metric as the original survey's "184 of 207 rows carry an allocation/loss value" for
    // FY26/27 — the revision brought the other four FYs up to exactly that coverage.
    for (const fy of capacityFYs) {
      const rows = capacityDb.filter((r) => r.fy === fy);
      expect(rows, fy).toHaveLength(207);
      const carrying = rows.filter(
        (r) =>
          Number(r.lostTSR) !== 0 ||
          Number(r.lostMA) !== 0 ||
          Number(r.infraRecovery) !== 0 ||
          Number(r.unusedFromTOCs) !== 0 ||
          r.tocAllocated.some((t) => Number(t) !== 0),
      );
      expect(carrying.length, `${fy} must carry allocation data on 184 rows`).toBe(184);
    }
  });

  it("shows route ceilings per route, tightest first, and never presents a section sum as capacity", () => {
    mount();
    const table = screen.getByRole("table", { name: "Route ceiling" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(capacityRoutes.length);

    const expected = routeHeadroom("FY26/27");
    // Tightest route must lead, and the row must carry the bottleneck section rather than a total.
    expect(within(rows[0]).getByText(expected[0].route)).toBeInTheDocument();
    expect(within(rows[0]).getByText(expected[0].bottleneckSections.join(" · "))).toBeInTheDocument();

    expect(screen.getByText(/not route capacity/i)).toBeInTheDocument();
    expect(screen.getByText(/narrowest\s+section/i)).toBeInTheDocument();
  });

  it("states that the five years are a restatement, not a forecast", () => {
    mount();
    expect(screen.getByText(/TOC allocation is identical in all five years/i)).toBeInTheDocument();
    expect(screen.getByText(/Theoretical capacity changes on 3 sections/i)).toBeInTheDocument();
  });

  it("moves the network view with the selected fiscal year", () => {
    mount();
    const fySelect = screen.getByLabelText(/Financial year/i) as HTMLSelectElement;
    fireEvent.change(fySelect, { target: { value: "FY30/31" } });

    const table = screen.getByRole("table", { name: "Route ceiling" });
    const expected = routeHeadroom("FY30/31");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText(expected[0].route)).toBeInTheDocument();
    expect(screen.getByText(/FY30\/31 · tightest first/)).toBeInTheDocument();
  });

  it("keeps every route selectable and shows the revised East London sections", () => {
    mount();
    const routeSelect = screen.getByLabelText(/^Route$/i) as HTMLSelectElement;
    expect([...routeSelect.options].map((o) => o.value)).toEqual(capacityRoutes);

    const eastLondon = capacityRoutes.find((r) => r.includes("Vereeniging/Danskraal"));
    expect(eastLondon).toBeDefined();
    fireEvent.change(routeSelect, { target: { value: eastLondon } });

    const table = screen.getByRole("table", { name: "Section capacity" });
    expect(within(table).getByText(/BETHLEHEM \(E\) - ARLINGTON \(E\)/)).toBeInTheDocument();
    expect(within(table).getByText(/GUNHILL SOUTH \(I\) - KROONSTAD \(E\)/)).toBeInTheDocument();
  });

  it("prints the workbook's own bottleneck cell for the saved selection", () => {
    mount();
    // It appears both in the as-delivered snapshot card and, for the default selection, in the
    // derived bottleneck banner — both must name the same section.
    const hits = screen.getAllByText(/CATO RIDGE \(E\) - BOOTH \(I\)/);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("never renders a raw XML entity anywhere on the page", () => {
    mount();
    expect(document.body.textContent).not.toContain("&amp;");
  });

  it("scopes the ampersand route correctly in the dropdown", () => {
    mount();
    const coal = capacityRoutes.find((r) => r.includes("Export Coal"));
    expect(coal).toBeDefined();
    expect(routeLabel(coal!)).toContain(" & ");
    const option = screen.getByRole("option", { name: coal! });
    expect(option).toBeInTheDocument();
  });
});
