import { describe, expect, it } from "vitest";
import { capacityDb, capacityFYs, capacityRoutes } from "./railCapacityData";
import {
  CAPACITY_FACTOR,
  fyConsistency,
  fyConsistencyStatement,
  isClosedLine,
  routeHeadroom,
  sectionAllocated,
} from "./railCapacityAnalysis";

const num = (v: number | string) => (typeof v === "number" ? v : Number(v) || 0);

describe("route headroom", () => {
  it("covers every route in every fiscal year", () => {
    for (const fy of capacityFYs) {
      expect(routeHeadroom(fy).map((r) => r.route).sort()).toEqual([...capacityRoutes].sort());
    }
  });

  it("uses the bottleneck section, never the sum of sections, as the route ceiling", () => {
    for (const fy of capacityFYs) {
      for (const r of routeHeadroom(fy)) {
        const rows = capacityDb
          .filter((x) => x.fy === fy && x.route === r.route)
          .filter((x) => !isClosedLine(x));
        const min = Math.min(...rows.map((x) => num(x.theoreticalDaily)));
        expect(r.bottleneckTheoreticalDaily, `${r.route} ${fy}`).toBe(min);
        expect(r.routePracticalDaily).toBe(Math.round(CAPACITY_FACTOR * min));
        expect(r.routeWeeklyPractical).toBe(r.routePracticalDaily * 7);
        // The sum is strictly larger wherever a route has more than one section.
        if (rows.length > 1) {
          expect(r.summedTheoreticalDaily).toBeGreaterThan(r.bottleneckTheoreticalDaily);
        }
        // The ceiling is never larger than the arithmetic sum of its parts.
        expect(r.bottleneckTheoreticalDaily).toBeLessThanOrEqual(r.summedTheoreticalDaily);
      }
    }
  });

  it("names a real bottleneck section and keeps allocation within the ceiling", () => {
    for (const fy of capacityFYs) {
      for (const r of routeHeadroom(fy)) {
        expect(r.bottleneckSections.length).toBeGreaterThan(0);
        expect(r.sections).toBeGreaterThan(0);
        expect(r.bottleneckSpare).toBeGreaterThanOrEqual(0);
        expect(r.utilisationPct).toBeGreaterThanOrEqual(0);
        expect(r.utilisationPct).toBeLessThanOrEqual(100);
      }
    }
  });

  it("excludes sections the workbook marks as closed and says which", () => {
    const closed = capacityDb.filter(isClosedLine);
    expect(closed.length).toBeGreaterThan(0);
    const fy = closed[0].fy;
    const r = routeHeadroom(fy).find((x) => x.route === closed[0].route)!;
    expect(r.closedSections).toContain(closed[0].section);
    // An excluded section must not be the bottleneck the ceiling was taken from.
    expect(r.bottleneckSections).not.toContain(closed[0].section);
  });

  it("reads allocation as a weekly figure consistent with the weekly ceiling", () => {
    const row = capacityDb.find((r) => r.fy === "FY26/27")!;
    expect(sectionAllocated(row)).toBe(row.tocAllocated.reduce<number>((s, v) => s + num(v), 0));
  });

  it("sorts the constrained routes first", () => {
    const rows = routeHeadroom("FY26/27");
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].utilisationPct).toBeGreaterThanOrEqual(rows[i].utilisationPct);
    }
  });
});

describe("fiscal-year consistency", () => {
  it("reports one entry per year after the first, with no missing rows", () => {
    const diffs = fyConsistency();
    expect(diffs.map((d) => d.fy)).toEqual(capacityFYs.slice(1));
  });

  it("proves the allocation columns are a restatement, not a forecast", () => {
    // True for the 2026-10-23 revision (4). If a future revision differentiates allocation by
    // year, this fails deliberately — the page copy and the audit doc must be re-read, not patched.
    for (const d of fyConsistency()) {
      expect(d.allocationSections, `${d.fy} allocation changed`).toEqual([]);
      expect(d.lossSections, `${d.fy} loss columns changed`).toEqual([]);
    }
  });

  it("pins the only year-on-year capacity movement to the Durban corridor", () => {
    for (const d of fyConsistency()) {
      expect(d.theoreticalSections).toHaveLength(3);
      for (const label of d.theoreticalSections) {
        expect(label).toMatch(/Johannesburg to Durban/);
      }
    }
  });

  it("states the finding in words that match the computed counts", () => {
    const statement = fyConsistencyStatement();
    expect(statement).toMatch(/Theoretical capacity changes on 3 sections/);
    expect(statement).toMatch(/TOC allocation is identical in all five years/);
    expect(statement).toMatch(/do not read them as a committed allocation plan/);
  });
});
