/**
 * Page numbers to render, with `…` gaps. Always includes first, last, and a
 * window around the current page, so the control stays a constant width.
 */
export function pageWindow(page: number, pageCount: number, span = 1): (number | 'gap')[] {
  const pages = new Set<number>([1, pageCount]);
  for (let p = page - span; p <= page + span; p += 1) {
    if (p >= 1 && p <= pageCount) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('gap');
    out.push(p);
    prev = p;
  }
  return out;
}
