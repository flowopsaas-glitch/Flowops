import { describe, expect, it } from "vitest";
import { capacityDb, capacityRoutes, capacitySource } from "../data/railCapacityData";
import { registerRoutes, registerSource, registerRoutesAnomaly } from "../data/railRegisterData";

/**
 * Verification of the two files re-uploaded on 2026-11-03
 * (`Annexure 33 Capacity Statement (2).xlsm`, `Annexure 33_Network Register June 2026 F (2).pdf`).
 *
 * Both were byte-identical to the copies already held in `sources/`, so these tests do not
 * re-prove the ingest — they lock in the properties that the audit actually checked, plus the
 * ampersand decision, so a future re-import cannot silently reintroduce the escaping artifact.
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
