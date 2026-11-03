#!/usr/bin/env python3
"""
Regenerate frontend/src/data/railCapacityData.ts from the Annexure 33b Capacity Statement workbook.

Usage:  python3 scripts/regenerate-rail-capacity.py <path-to.xlsm>

Why this exists: the module is a verbatim projection of the Capacity_DB sheet, and the workbook has
now been revised (the 2026-10-23 upload fills all five fiscal years where the 2026-07-03 upload
carried FY26/27 only). Hand-patching 1,035 rows is unsafe, so the projection is regenerated and the
previous file is diffed for review.

Cell fidelity rules
  - Numbers are emitted as JS numbers when they round-trip exactly, otherwise as quoted strings so
    the source's full float precision is preserved rather than silently truncated.
  - The xlsm's shared strings store the coal route as "General Freight &amp; Export Coal: ..." — an
    XML-escaping artifact, not authored text. It is decoded to "&" (see E-AMP-01 and the 33 Network
    Register, which prints the same route with a plain "&").
"""
import json
import re
import sys
import zipfile

SHEET_NAMES = {1: "Capacity Statement", 2: "Capacity_DB", 3: "Lists"}

COL = {
    "A": "key", "B": "fy", "C": "route", "D": "order", "E": "section", "F": "depot",
    "G": "theoreticalDaily", "H": "lostTSR", "I": "lostMA", "J": "infraRecovery",
    "K": "unusedFromTOCs",
}
TOC_COLS = list("LMNOPQRSTUVWXYZ")  # TOC 1..15


def decode(s: str) -> str:
    return s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')


def load_sheet(z: zipfile.ZipFile, idx: int) -> dict:
    shared = []
    try:
        ss = z.read("xl/sharedStrings.xml").decode("utf8", "ignore")
        shared = [decode(re.sub(r"<[^>]+>", "", s)) for s in re.findall(r"<si>(.*?)</si>", ss, re.S)]
    except KeyError:
        pass
    xml = z.read(f"xl/worksheets/sheet{idx}.xml").decode("utf8", "ignore")
    cells = {}
    for m in re.finditer(r'<c r="([A-Z]+\d+)"([^>]*?)(?:/>|>(.*?)</c>)', xml, re.S):
        ref, attrs, body = m.group(1), m.group(2), m.group(3) or ""
        v = re.search(r"<v>([^<]*)</v>", body)
        if not v:
            continue
        val = v.group(1)
        if 't="s"' in attrs:
            try:
                val = shared[int(val)]
            except (IndexError, ValueError):
                pass
        cells[ref] = val
    return cells


def js_literal(raw: str):
    """Emit the source value without losing precision."""
    if raw is None or raw == "":
        return "0"
    try:
        f = float(raw)
    except ValueError:
        return json.dumps(decode(str(raw)))
    if f == int(f) and abs(f) < 1e15:
        return str(int(f))
    # Preserve the workbook's exact decimal string rather than a lossy float.
    return json.dumps(raw)


def main(path: str) -> int:
    z = zipfile.ZipFile(path)
    db = load_sheet(z, 2)

    # group cells by row index
    rows: dict[int, dict[str, str]] = {}
    for ref, val in db.items():
        m = re.fullmatch(r"([A-Z]+)(\d+)", ref)
        if not m:
            continue
        rows.setdefault(int(m.group(2)), {})[m.group(1)] = val

    data_rows = []
    for ridx in sorted(rows):
        r = rows[ridx]
        # The header row carries the literal "Key"/"Year" labels in A/B; it is not data.
        if r.get("A", "").strip().lower() == "key" or r.get("B", "").strip().lower() == "year":
            continue
        if "A" not in r or "B" not in r or "C" not in r:
            continue
        data_rows.append((ridx, r))

    # sanity: every row must carry the identity columns
    for ridx, r in data_rows:
        for c in "ABCDEF":
            if c not in r:
                raise SystemExit(f"row {ridx} missing column {c}")

    routes = sorted({r["C"] for _, r in data_rows})
    fys = sorted({r["B"] for _, r in data_rows})

    def row_line(r: dict[str, str]) -> str:
        toc = ", ".join(js_literal(r.get(c)) for c in TOC_COLS)
        key = f'{r["B"]}|{r["C"]}|{r["D"]}'
        return (
            f'  {{ key: {json.dumps(key)}, fy: {json.dumps(r["B"])}, '
            f'route: {json.dumps(r["C"])}, order: {json.dumps(r["D"])}, '
            f'section: {json.dumps(r["E"])}, depot: {json.dumps(r["F"])}, '
            f'theoreticalDaily: {js_literal(r.get("G"))}, '
            f'lostTSR: {js_literal(r.get("H"))}, lostMA: {js_literal(r.get("I"))}, '
            f'infraRecovery: {js_literal(r.get("J"))}, '
            f'unusedFromTOCs: {js_literal(r.get("K"))}, '
            f'tocAllocated: [{toc}] }},'
        )

    body = "\n".join(row_line(r) for _, r in data_rows)

    # ---- Capacity Statement (sheet 1): as-delivered view ----
    s1 = load_sheet(z, 1)

    def g(ref):
        return s1.get(ref, "")

    # Selection block, verbatim from the sheet (labels in A, values in B):
    #   A1 Selected FY              B1
    #   A2 Selected Route           B2
    #   A3 Capacity Factor          B3
    #   A4 Route Spare Capacity     B4
    #   A5 Bottleneck Section(s)    B5
    #   A6 hidden-TOC note
    sel_fy = g("B1")
    sel_route = g("B2")
    cap_factor = g("B3")
    route_spare = g("B4")
    bottleneck = g("B5")

    # The visible grid starts at the header row (which carries "Section Sequencing").
    grid_rows: dict[int, dict[str, str]] = {}
    for ref, val in s1.items():
        m = re.fullmatch(r"([A-Z]+)(\d+)", ref)
        if m:
            grid_rows.setdefault(int(m.group(2)), {})[m.group(1)] = val
    header_idx = None
    for ridx in sorted(grid_rows):
        if "Section Sequencing" in str(grid_rows[ridx].get("A", "")):
            header_idx = ridx
            break
    if header_idx is None:
        raise SystemExit("could not locate the Capacity Statement header row")

    cols = [c for c in (chr(x) for x in range(ord("A"), ord("A") + 29))]
    grid = []
    for ridx in range(header_idx, max(grid_rows) + 1):
        vals = [str(grid_rows.get(ridx, {}).get(c, "")) for c in cols]
        if any(v != "" for v in vals):
            grid.append(vals)

    out = f'''/** AUTO-GENERATED from {path} — verbatim cells. Do not hand-edit.
 * SHA-256 {sha256(path)}.
 *
 * REVISION NOTE (2026-11-03): this projection was regenerated from the workbook revised on
 * 2026-10-23 (last modified by Asheena Mathura). The superseded 2026-07-03 revision
 * (sources/Annexure 33 Capacity Statement (2).xlsm, SHA-256 2d3f5915…, modified by Thabo Manamela)
 * carried allocation data for FY26/27 only; this revision populates TSR/MA/infrastructure-recovery/
 * unused and all fifteen TOC columns for every one of the five fiscal years. See
 * docs/RAIL-SOURCE-AUDIT-2026-11-03.md §7 for the full diff, including the twelve revised
 * theoretical-capacity cells.
 *
 * AMPERSAND: the workbook's shared strings store the coal route as "…&amp;…" — an XML-escaping
 * artifact, not authored text. Decoded to "&" here (E-AMP-01; the Annexure 33 Network Register
 * prints the same route with a plain "&"). React renders JS strings literally, so preserving the
 * entity would show "&amp;" to users. */

export const capacitySource = {{
  file: {json.dumps(path)},
  sha256: {json.dumps(sha256(path))},
  sheets: ["Capacity Statement (sheetId 1, visible)", "Capacity_DB (sheetId 2, hidden)", "Lists (sheetId 3, hidden)"],
  capacityDbRows: {len(data_rows)},
  capacityFactor: "0.65",
  revision: {{
    modified: "2026-10-23",
    modifiedBy: "Asheena Mathura",
    supersedes: {{
      file: "sources/Annexure 33 Capacity Statement (2).xlsm",
      sha256: "2d3f591515a339b57fb17e695796dcbe2cc7522ce39c4c329dcb70f325a3515b",
      modified: "2026-07-03",
      modifiedBy: "Thabo Manamela (Transnet Freight Rail JHB)",
    }},
    allocationCoverage: "All {len(fys)} fiscal years ({", ".join(fys)})",
  }},
}};

/** Period discipline: FY26/27 + FY27/28 fall inside the Network Statement V4 governing period;
 * FY28/29-FY30/31 are forward projections inside the workbook — never substitute values across periods. */
export const capacityFYs = [{", ".join(json.dumps(f) for f in fys)}];
export const capacityFYNote: Record<string, string> = {{
{chr(10).join(f'  {json.dumps(f)}: {json.dumps(note(f))},' for f in fys)}
}};

export const capacityRoutes = [{", ".join(json.dumps(r) for r in routes)}];

export interface CapacityRow {{
  key: string; fy: string; route: string; order: string; section: string; depot: string;
  theoreticalDaily: number | string; lostTSR: number | string; lostMA: number | string;
  infraRecovery: number | string; unusedFromTOCs: number | string; tocAllocated: Array<number | string>;
}}

/** Capacity_DB rows verbatim ({len(data_rows)} rows = {len(routes)} routes x {len(fys)} FYs x sections).
 * Allocation columns (TSR/MA/infra/unused/TOC 1-15) are populated in this revision for every fiscal
 * year. The superseded 2026-07-03 revision carried FY26/27 only (the former E-33B-01 sparse-cell
 * caveat, now retired). */
export const capacityDb: CapacityRow[] = [
{body}
];

/** As-delivered 'Capacity Statement' sheet view (the workbook's saved selection state).
 * Regenerated from the 2026-10-23 revision; the saved selection moved from FY29/30 to {sel_fy}. */
export const workbookSnapshot = {{
  selectedFY: {json.dumps(sel_fy)},
  selectedRoute: {json.dumps(sel_route)},
  capacityFactor: {json.dumps(cap_factor)},
  routeSpareCapacity: {json.dumps(route_spare)},
  bottleneckSections: {json.dumps(bottleneck)},
  note: "Hidden TOC columns can be expanded to view detailed TOC allocations.",
  header: ["NB: Hidden TOC columns can be expanded to view detailed TOC allocations."],
  /** The visible grid exactly as stored (row 1 = the sheet's column headers). */
  rows: [
{chr(10).join("    " + json.dumps(r, ensure_ascii=False) + "," for r in grid)}
  ],
}};

export const derivedFormulas = {{
  practicalDaily: "round(0.65 x theoreticalDaily)",
  dailyAvailable: "practicalDaily - lostTSR - lostMA + infraRecovery + unusedFromTOCs",
  weeklyPractical: "practicalDaily x 7",
  weeklyAllocated: "sum(tocAllocated TOC 1..15)",
  weeklySpare: "weeklyPractical - weeklyAllocated",
}};
'''
    with open("frontend/src/data/railCapacityData.ts", "w") as fh:
        fh.write(out)
    print(f"wrote frontend/src/data/railCapacityData.ts — {len(data_rows)} rows, {len(routes)} routes, {len(fys)} FYs")
    return 0


def note(fy: str) -> str:
    if fy in ("FY26/27", "FY27/28"):
        return f"Network Statement V4 in-force year {1 if fy == 'FY26/27' else 2}"
    return "Workbook forward projection (outside V4 statement period)"


def sha256(path: str) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    sys.exit(main(sys.argv[1]))
