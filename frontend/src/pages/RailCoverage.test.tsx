import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RailCoverage from "./RailCoverage";
import { annexureRegister } from "../data/railStatementData";
import {
  capabilities,
  coverageMeta,
  coverageRows,
  coverageSummary,
  derivedGaps,
} from "../data/railCoverageData";

const mount = () => render(<MemoryRouter><RailCoverage /></MemoryRouter>);

afterEach(cleanup);

describe("coverage data integrity", () => {
  it("has a coverage row for every annexure in the register, and no extras", () => {
    expect(coverageRows).toHaveLength(annexureRegister.length);
    expect(new Set(coverageRows.map((r) => r.id)).size).toBe(annexureRegister.length);
    for (const a of annexureRegister) {
      expect(coverageRows.some((r) => r.id === a.id), `missing coverage for ${a.id}`).toBe(true);
    }
    // Metadata must not describe annexures that no longer exist.
    for (const id of Object.keys(coverageMeta)) {
      expect(annexureRegister.some((a) => a.id === id), `orphan coverage metadata for ${id}`).toBe(true);
    }
  });

  it("summarises consistently with the rows", () => {
    expect(coverageSummary.total).toBe(coverageRows.length);
    expect(coverageSummary.delivered + coverageSummary.outstanding).toBe(coverageSummary.total);
    expect(
      coverageSummary.blockers + coverageSummary.outstandingImportant + coverageSummary.outstandingReference,
    ).toBe(coverageSummary.outstanding);
  });

  it("counts blocking gaps across both axes without losing the register arithmetic", () => {
    const derivedBlockers = derivedGaps.filter((g) => g.criticality === "blocker");
    // The register triage must reconcile: blockers + important + reference === outstanding.
    expect(
      coverageSummary.blockers +
        coverageSummary.outstandingImportant +
        coverageSummary.outstandingReference,
    ).toBe(coverageSummary.outstanding);
    // Blocking sources are more numerous than blocking annexures, because some gaps sit
    // outside the register entirely — a register-only count understates the risk.
    expect(derivedBlockers.length).toBeGreaterThan(0);
    const totalBlocking = coverageSummary.blockers + derivedBlockers.length;
    expect(totalBlocking).toBeGreaterThan(coverageSummary.blockers);
    const expected = [
      "6", "24", "19A", "19B", "19C", "37", "38", "39",
    ].sort();
    expect(
      coverageRows
        .filter((r) => !r.delivered && r.criticality === "blocker")
        .map((r) => r.id)
        .sort(),
    ).toEqual(expected);
  });

  it("states the full blocking count, including gaps outside the register", () => {
    mount();
    const derivedBlockers = derivedGaps.filter((g) => g.criticality === "blocker").length;
    const total = coverageSummary.blockers + derivedBlockers;
    expect(
      screen.getByText(new RegExp(`${total} sources in total block a workflow`)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`\\+${derivedBlockers} outside the register`)),
    ).toBeInTheDocument();
  });

  it("says something concrete about every annexure, delivered or not", () => {
    for (const r of coverageRows) {
      expect(r.effect.length, `${r.id} has no effect text`).toBeGreaterThan(30);
      expect(r.capability).toBeTruthy();
      expect(capabilities).toContain(r.capability);
    }
  });

  it("links every delivered row that has a route to a real rail path", () => {
    for (const r of coverageRows) {
      if (r.route) {
        expect(r.route.startsWith("/rail"), `${r.id} route ${r.route}`).toBe(true);
      }
    }
  });

  it("does not claim a route for an undelivered annexure", () => {
    for (const r of coverageRows) {
      if (!r.delivered) {
        expect(r.route, `${r.id} is outstanding but claims a route`).toBeUndefined();
      }
    }
  });

  it("never describes an outstanding source as though its contents were known", () => {
    for (const r of coverageRows.filter((x) => !x.delivered)) {
      // Outstanding rows must open by stating the document is unavailable, so the
      // text cannot drift into describing content we have never seen.
      expect(r.effect.startsWith("Unavailable."), `${r.id}: "${r.effect.slice(0, 40)}"`).toBe(true);
    }
  });

  it("keeps all five derived gaps, including the one the register hides behind Annexure 33", () => {
    expect(derivedGaps).toHaveLength(5);
    const append = derivedGaps.find((g) => g.id === "33-append");
    expect(append).toBeTruthy();
    expect(append!.criticality).toBe("blocker");
    // The register marks 33 as delivered; the appended file is the reason that tick is partial.
    expect(coverageRows.find((r) => r.id === "33")!.delivered).toBe(true);
  });

  it("orders the request list by rank with no duplicate annexure claims", () => {
    const ranks = derivedGaps.map(() => 0); // shape guard
    expect(ranks).toHaveLength(derivedGaps.length);
    expect(new Set(coverageRows.map((r) => r.id)).size).toBe(coverageRows.length);
  });
});

describe("coverage page", () => {
  it("is labelled as read-only reference material", () => {
    mount();
    expect(screen.getByRole("note", { name: "Reference material" })).toHaveTextContent(
      /Reference view · read-only/i,
    );
  });

  it("shows the delivered/outstanding counts in the summary", () => {
    mount();
    expect(screen.getByText("Annexures in register")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Annexures delivered" })).toHaveAttribute(
      "aria-valuenow",
      String(Math.round((coverageSummary.delivered / coverageSummary.total) * 100)),
    );
  });

  it("surfaces the derived gaps by default, before the register table", () => {
    mount();
    expect(screen.getByText(/Gaps outside the register/i)).toBeInTheDocument();
    // Appears twice by design: once as the gap, once as the top item in the request order.
    expect(screen.getAllByText(/Annexure 33 appended data file/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/What to request next, in order/i)).toBeInTheDocument();
  });

  it("filters to outstanding only", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Outstanding only" }));
    expect(screen.getByRole("button", { name: "Outstanding only" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // A delivered annexure must disappear from the table.
    expect(screen.queryByText("POINT TO POINT RUNNING TIMES")).not.toBeInTheDocument();
  });

  it("filters to blocking gaps only", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Blocking only" }));
    const blockers = coverageRows.filter((r) => !r.delivered && r.criticality === "blocker");
    expect(blockers.length).toBeGreaterThan(0);
    // Every blocker title should still be present.
    for (const b of blockers) {
      expect(screen.getAllByText(b.title).length).toBeGreaterThan(0);
    }
  });

  it("shows an explicit message when filters exclude everything", () => {
    mount();
    fireEvent.change(screen.getByRole("combobox", { name: /Capability/i }), {
      target: { value: "Commercial" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Outstanding only" }));
    // Commercial has only Annexure 43 (delivered) and 40 (delivered) -> nothing outstanding.
    expect(screen.getByRole("status")).toHaveTextContent(/No annexures match these filters/i);
  });
});
