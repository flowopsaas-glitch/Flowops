import { describe, expect, it } from "vitest";
import {
  capacityDb,
  capacityFYs,
  capacityRoutes,
  capacitySource,
  workbookSnapshot,
} from "../data/railCapacityData";
import { registerRoutes, registerSource, registerRoutesAnomaly } from "../data/railRegisterData";

/**
 * Verification of the annexure-33 pairs uploaded on 2026-11-03.
 *
 * Round 1 — `Annexure 33 Capacity Statement (2).xlsm` + `Annexure 33_Network Register June 2026 F (2).pdf`:
 * both were byte-identical to copies already in `sources/`, so the tests below do not re-prove that
 * ingest; they lock in the properties the audit checked, plus the ampersand decision, so a future
 * re-import cannot silently reintroduce the escaping artifact.
 *
 * Round 2 — `(4)` of each: the register was again a byte-identical duplicate, but the Capacity
 * Statement was a genuine later revision (2026-10-23). It populated allocation columns for all five
 * fiscal years and revised twelve theoretical-capacity cells. The revision block at the end of this
 * file pins that delta so a regression to the sparser 2026-07-03 state cannot pass unnoticed.
 */

describe("Annexure 33b Capacity Statement — ingest integrity", () => {
  it("holds every Capacity_DB data row (1 header + 1,035 data rows in the workbook)", () => {
    expect(capacitySource.capacityDbRows).toBe(1035);
    expect(capacityDb).toHaveLength(1035);
  });

  it("covers 10 routes x 5 fiscal years", () => {
    expect(capacityRoutes).toHaveLength(10);
    expect(new Set(capacityDb.map((r) => r.fy)).size).toBe(5);
  });

  it("has a unique key for every row, so React keys and filters stay stable", () => {
    const keys = new Set(capacityDb.map((r) => r.key));
    expect(keys.size).toBe(capacityDb.length);
  });

  it("derives every row key from its own fy + route + order fields", () => {
    for (const row of capacityDb) {
      expect(row.key).toBe(`${row.fy}|${row.route}|${row.order}`);
    }
  });

  it("keeps each route selectable, i.e. every dropdown value matches real rows", () => {
    for (const route of capacityRoutes) {
      const rows = capacityDb.filter((r) => r.route === route);
      expect(rows.length, `route "${route}" must have Capacity_DB rows`).toBeGreaterThan(0);
    }
    // And no route exists in the data that the dropdown cannot reach.
    for (const route of new Set(capacityDb.map((r) => r.route))) {
      expect(capacityRoutes, `"${route}" must be selectable`).toContain(route);
    }
  });

  it("carries 15 TOC allocation columns on every row", () => {
    for (const row of capacityDb) {
      expect(row.tocAllocated).toHaveLength(15);
    }
  });

  it("never leaks the workbook's XML-escaping artifact into a rendered string", () => {
    // React renders a JS string literally, so "&amp;" would reach the screen as those 5 characters.
    for (const route of capacityRoutes) {
      expect(route).not.toContain("&amp;");
    }
    for (const row of capacityDb) {
      expect(row.route).not.toContain("&amp;");
      expect(row.key).not.toContain("&amp;");
    }
  });

  it("spells the coal export route the way the Network Register prints it", () => {
    const coal = capacityRoutes.find((r) => r.toLowerCase().includes("lephalale"));
    expect(coal).toBe("General Freight & Export Coal: Lephalale to Richards Bay");
  });
});

describe("Annexure 33 Capacity Statement — 2026-10-23 revision (4)", () => {
  const fys = ["FY26/27", "FY27/28", "FY28/29", "FY29/30", "FY30/31"];

  const isZero = (v: number | string) => Number(v) === 0;

  const hasAllocations = (fy: string) =>
    capacityDb.filter(
      (r) => r.fy === fy && (!isZero(r.lostTSR) || !isZero(r.lostMA) || r.tocAllocated.some((t) => !isZero(t))),
    ).length;

  it("stamps the module with the revised workbook's hash and keeps the superseded one on record", () => {
    expect(capacitySource.sha256).toBe(
      "d0505e84faa324f07cad03768c07c5a4fc35e9413556c863d3d15ac6b4364c80",
    );
    expect(capacitySource.revision.modified).toBe("2026-10-23");
    expect(capacitySource.revision.supersedes.sha256).toBe(
      "2d3f591515a339b57fb17e695796dcbe2cc7522ce39c4c329dcb70f325a3515b",
    );
  });

  it("populates allocation columns for all five fiscal years (retires E-33B-01)", () => {
    // The superseded revision carried allocations for FY26/27 only. The revision brings every FY to
    // the same 184-of-207 coverage that FY26/27 already had — no more, no less.
    for (const fy of fys) {
      expect(hasAllocations(fy), `${fy} must carry allocation data`).toBe(184);
    }
    expect(capacityFYs).toEqual(fys);
  });

  it("applies the twelve revised theoretical-capacity cells across FY27/28-FY30/31", () => {
    const route = "General Freight: Vereeniging/Danskraal to East London";
    const expected: Record<string, number> = {
      "37": 19, // BETHLEHEM (E) - ARLINGTON (E)
      "38": 27, // ARLINGTON (I) - GUNHILL (I)
      "39": 12, // GUNHILL SOUTH (I) - KROONSTAD (E)
    };
    for (const fy of ["FY27/28", "FY28/29", "FY29/30", "FY30/31"]) {
      for (const [order, value] of Object.entries(expected)) {
        const row = capacityDb.find((r) => r.key === `${fy}|${route}|${order}`);
        expect(row, `${fy} section ${order} must exist`).toBeDefined();
        expect(Number(row!.theoreticalDaily), `${fy} section ${order}`).toBe(value);
      }
    }
  });

  it("leaves exactly three sections varying across fiscal years, all on Johannesburg-Durban", () => {
    const bySection = new Map<string, Map<string, number | string>>();
    for (const row of capacityDb) {
      const key = `${row.route}|${row.section}`;
      if (!bySection.has(key)) bySection.set(key, new Map());
      bySection.get(key)!.set(row.fy, row.theoreticalDaily);
    }
    const varying = [...bySection.entries()].filter(([, values]) => new Set(values.values()).size > 1);
    expect(varying).toHaveLength(3);
    for (const [key] of varying) {
      expect(key.startsWith("General Freight: Johannesburg to Durban")).toBe(true);
    }
    // The three East London sections that used to step up in FY27/28 are now flat.
    const eastLondon = [...bySection.entries()].filter(([k]) => k.includes("Vereeniging/Danskraal"));
    for (const [, values] of eastLondon) {
      expect(new Set(values.values()).size, "East London capacity is now flat across FYs").toBe(1);
    }
  });

  it("reports the workbook's newly-populated bottleneck cell and saved selection", () => {
    expect(workbookSnapshot.selectedFY).toBe("FY26/27");
    expect(workbookSnapshot.routeSpareCapacity).toBe("35");
    expect(workbookSnapshot.bottleneckSections).toBe("CATO RIDGE (E) - BOOTH (I)");
    expect(workbookSnapshot.rows.length).toBe(41); // 1 header + 40 sections
    expect(workbookSnapshot.rows[0][0]).toBe("Section Sequencing");
  });

  it("holds no XML-escaping artifact anywhere in the snapshot grid", () => {
    for (const row of workbookSnapshot.rows) {
      for (const cell of row) {
        expect(cell).not.toContain("&amp;");
      }
    }
  });
});

describe("Annexure 33 Network Register — ingest integrity", () => {
  it("holds the register's declared identity", () => {
    expect(registerSource.version).toBe("v0.3");
    expect(registerSource.docDate).toBe("26 June 2026");
    expect(registerSource.pages).toBe(8);
    expect(registerSource.applicability).toBe("Applicable for the 2026/27 timetable");
  });

  it("reproduces the E-33REG-01 route anomaly verbatim rather than silently fixing it", () => {
    // The register prints Musina twice (routes 9 and 10) and omits Vereeniging/Danskraal.
    expect(registerRoutes).toHaveLength(10);
    const musina = registerRoutes.filter((r) => r.includes("Musina - Pyramid South/Hoedspruit"));
    expect(musina).toHaveLength(2);
    expect(registerRoutes.some((r) => r.includes("Vereeniging/Danskraal to East London"))).toBe(false);
    expect(registerRoutesAnomaly).toMatch(/E-33REG-01/);
  });

  it("records that the appended data file carrying N1/N2 line class is still outstanding", () => {
    // Register content 3 (line classification) lives in a separate file the PDF does not contain.
    expect(registerSource.note).toBeTruthy();
  });
});
