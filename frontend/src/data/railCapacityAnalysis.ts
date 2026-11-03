/**
 * Derived analysis over the Annexure 33b Capacity_DB.
 *
 * The workbook stores one row per *section*, with a theoretical daily capacity in trains. The page
 * used to present the sum of those rows, which is arithmetically correct but misleading as a
 * capacity measure: a train path occupies one slot on every section it traverses, so a route's
 * ceiling is its **bottleneck** section, not the sum of them. A 30-section route would otherwise
 * appear to have thirty times the capacity it can actually pass.
 *
 * Everything here is derived, and every derivation is stated in the UI. Nothing is written back to
 * `railCapacityData.ts`, which is generated and must stay verbatim.
 */

import { capacityDb, capacitySource, capacityFYs, type CapacityRow } from "./railCapacityData";

const num = (v: number | string): number => (typeof v === "number" ? v : Number(v) || 0);

/** The workbook's own capacity factor (0.65), read from the source manifest rather than repeated. */
export const CAPACITY_FACTOR = Number(capacitySource.capacityFactor);

/** Sections the workbook marks as closed carry a theoretical figure that no train can use. */
export function isClosedLine(row: CapacityRow): boolean {
  return /line\s*closed/i.test(row.depot);
}

export interface RouteHeadroom {
  route: string;
  /** Open sections used for the calculation. */
  sections: number;
  /** Sections excluded because the workbook marks the line closed. */
  closedSections: string[];
  /** Section(s) holding the minimum theoretical daily capacity; more than one only on a tie. */
  bottleneckSections: string[];
  bottleneckDepot: string;
  /** Route ceiling: the bottleneck section's theoretical daily capacity. */
  bottleneckTheoreticalDaily: number;
  /** round(0.65 x bottleneck) — the route's practical daily ceiling. */
  routePracticalDaily: number;
  routeWeeklyPractical: number;
  /** Weekly TOC allocation recorded on the bottleneck section (not a sum across sections). */
  bottleneckAllocated: number;
  /** Weekly practical ceiling minus allocation on the bottleneck section. */
  bottleneckSpare: number;
  /** Allocation on the bottleneck section as a percentage of its weekly practical ceiling. */
  utilisationPct: number;
  /** Sum of every section's theoretical daily capacity — shown only to contrast with the ceiling. */
  summedTheoreticalDaily: number;
  /** Minimum over *all* sections, closed ones included — the ceiling if closures were disregarded. */
  allSectionsCeiling: number;
  /** True when counting the closed sections would lower the ceiling (it does not, in this file). */
  closedSectionsBind: boolean;
}

const byOrder = (a: CapacityRow, b: CapacityRow) => Number(a.order) - Number(b.order) || a.key.localeCompare(b.key);

/** Weekly TOC allocation recorded on one section. */
export function sectionAllocated(row: CapacityRow): number {
  return row.tocAllocated.reduce<number>((sum, v) => sum + num(v), 0);
}

/**
 * Route headroom for one financial year, tightest first.
 *
 * A route's capacity is its narrowest open section. Sections marked "Line Closed" are excluded and
 * named, because a theoretical figure on a closed line cannot be sold.
 */
export function routeHeadroom(fy: string, rows: CapacityRow[] = capacityDb): RouteHeadroom[] {
  const routes = Array.from(new Set(rows.filter((r) => r.fy === fy).map((r) => r.route)));
  const out: RouteHeadroom[] = [];

  for (const route of routes) {
    const all = rows.filter((r) => r.fy === fy && r.route === route).sort(byOrder);
    const closed = all.filter(isClosedLine);
    const open = all.filter((r) => !isClosedLine(r));
    // A route whose every section is marked closed has no sellable capacity; fall back to the full
    // set so the row still reports the source figures rather than vanishing.
    const considered = open.length > 0 ? open : all;
    const minTheoretical = Math.min(...considered.map((r) => num(r.theoreticalDaily)));
    const bottleneckRows = considered.filter((r) => num(r.theoreticalDaily) === minTheoretical);

    const routePracticalDaily = Math.round(CAPACITY_FACTOR * minTheoretical);
    const routeWeeklyPractical = routePracticalDaily * 7;
    // On a tie, the allocation that binds is the largest one recorded on a tied section.
    const bottleneckAllocated = Math.max(...bottleneckRows.map(sectionAllocated));
    const bottleneckSpare = routeWeeklyPractical - bottleneckAllocated;

    out.push({
      route,
      sections: considered.length,
      closedSections: closed.map((r) => r.section || "(blank in source)"),
      bottleneckSections: bottleneckRows.map((r) => r.section || "(blank in source)"),
      bottleneckDepot: bottleneckRows[0].depot,
      bottleneckTheoreticalDaily: minTheoretical,
      routePracticalDaily,
      routeWeeklyPractical,
      bottleneckAllocated,
      bottleneckSpare,
      utilisationPct: routeWeeklyPractical === 0 ? 0 : Math.round((bottleneckAllocated / routeWeeklyPractical) * 100),
      summedTheoreticalDaily: all.reduce((sum, r) => sum + num(r.theoreticalDaily), 0),
      allSectionsCeiling: Math.min(...all.map((r) => num(r.theoreticalDaily))),
      closedSectionsBind: Math.min(...all.map((r) => num(r.theoreticalDaily))) < minTheoretical,
    });
  }

  return out.sort((a, b) => b.utilisationPct - a.utilisationPct || a.route.localeCompare(b.route));
}

export interface FyConsistency {
  fy: string;
  /** Sections whose theoretical daily capacity differs from the first fiscal year. */
  theoreticalSections: string[];
  /** Sections whose TOC allocation differs from the first fiscal year. */
  allocationSections: string[];
  /** Sections whose TSR/MA/infrastructure-recovery/unused figures differ from the first year. */
  lossSections: string[];
}

const comparableKeys = (fy: string, rows: CapacityRow[]) =>
  new Map(rows.filter((r) => r.fy === fy).map((r) => [r.key.replace(`${fy}|`, ""), r]));

/**
 * How much the workbook actually varies between fiscal years.
 *
 * The revision populates allocation columns for all five years, which reads as a five-year forecast.
 * It is worth stating precisely what moves: if the allocation columns are identical year to year,
 * the later years are a restatement, not a plan, and no page should imply otherwise.
 */
export function fyConsistency(rows: CapacityRow[] = capacityDb): FyConsistency[] {
  const baseFy = capacityFYs[0];
  const base = comparableKeys(baseFy, rows);

  return capacityFYs.slice(1).map((fy) => {
    const year = comparableKeys(fy, rows);
    const theoreticalSections: string[] = [];
    const allocationSections: string[] = [];
    const lossSections: string[] = [];

    for (const [key, a] of base) {
      const b = year.get(key);
      if (!b) continue;
      const label = `${b.section || "(blank in source)"} (${b.route})`;
      if (num(a.theoreticalDaily) !== num(b.theoreticalDaily)) theoreticalSections.push(label);
      if (a.tocAllocated.some((v, i) => num(v) !== num(b.tocAllocated[i] ?? 0))) allocationSections.push(label);
      if (
        num(a.lostTSR) !== num(b.lostTSR) ||
        num(a.lostMA) !== num(b.lostMA) ||
        num(a.infraRecovery) !== num(b.infraRecovery) ||
        num(a.unusedFromTOCs) !== num(b.unusedFromTOCs)
      ) {
        lossSections.push(label);
      }
    }

    return { fy, theoreticalSections, allocationSections, lossSections };
  });
}

/** A single sentence describing how the workbook varies by year — computed, never transcribed. */
export function fyConsistencyStatement(rows: CapacityRow[] = capacityDb): string {
  const diffs = fyConsistency(rows);
  const theoretical = Array.from(new Set(diffs.flatMap((d) => d.theoreticalSections)));
  const allocations = Array.from(new Set(diffs.flatMap((d) => d.allocationSections)));
  const losses = Array.from(new Set(diffs.flatMap((d) => d.lossSections)));

  const parts: string[] = [];
  parts.push(
    theoretical.length === 0
      ? "Theoretical capacity is identical in all five years."
      : `Theoretical capacity changes on ${theoretical.length} section${theoretical.length === 1 ? "" : "s"} (${theoretical.join("; ")}).`,
  );
  parts.push(
    allocations.length === 0
      ? "TOC allocation is identical in all five years — the later years restate the first, so do not read them as a committed allocation plan."
      : `TOC allocation changes on ${allocations.length} section${allocations.length === 1 ? "" : "s"}.`,
  );
  parts.push(
    losses.length === 0
      ? "TSR, maintenance and recovery figures are likewise unchanged year to year."
      : `TSR/maintenance/recovery figures change on ${losses.length} section${losses.length === 1 ? "" : "s"}.`,
  );
  return parts.join(" ");
}
