/**
 * A starter reference set of HS codes for South African imports.
 *
 * READ THIS BEFORE TRUSTING A NUMBER IN HERE.
 *
 * These rates are INDICATIVE starting points for the most commonly imported
 * consumer and commercial categories. They are not the tariff, and treating
 * them as the tariff is how a business under-quotes a landing cost and eats
 * the difference.
 *
 * What this dataset cannot know, and what changes the real answer:
 *
 *   - PREFERENTIAL ORIGIN. SADC, EU (SADC-EU EPA), AfCFTA, EFTA and SACU
 *     arrangements can take the same line to 0%. Origin is decided by the
 *     rules of origin for that agreement, not by where the ship sailed from.
 *   - REBATES AND PERMITS. Rebate items (schedule 3, 4, 5, 6) routinely zero
 *     a rate that looks ordinary in schedule 1.
 *   - ANTI-DUMPING AND SAFEGUARD DUTIES. Imposed on specific origins and
 *     specific exporters, sometimes for years, and invisible in the HS code.
 *   - VALUATION METHOD. SARS may reject the invoiced value and assess on a
 *     different basis.
 *   - THE ACTUAL TEN-DIGIT CODE. Duty is set at the ten-digit level. A
 *     four-digit heading like 8517 covers both duty-free phones and dutiable
 *     networking equipment.
 *
 * So every lookup result carries the same warning to the caller, and the
 * calculator accepts a rate override — which is what a professional will use
 * once they have confirmed the real line.
 *
 * To extend this: add entries, and add a test. The dataset is deliberately
 * small and honest rather than long and guessed.
 */

export type HsCodeEntry = {
  /** HS code as it appears on a commercial invoice. */
  code: string;
  description: string;
  /** INDICATIVE general (most-favoured-nation) rate, as a percentage. */
  indicativeRatePct: number;
  /** Broad category, for grouping and filtering. */
  category: string;
  /** Why the rate is what it is — shown so the user can sanity-check it. */
  note?: string;
};

export const HS_CODES: HsCodeEntry[] = [
  // ── Electronics ────────────────────────────────────────────────────────
  {
    code: '8517.12',
    description: 'Telephones for cellular networks; smartphones',
    indicativeRatePct: 0,
    category: 'Electronics',
    note: 'Cellular phones are duty-free under the ITA. VAT still applies.',
  },
  {
    code: '8471.30',
    description: 'Portable automatic data processing machines; laptops',
    indicativeRatePct: 0,
    category: 'Electronics',
    note: 'Laptops and tablets are duty-free under the ITA. VAT still applies.',
  },
  {
    code: '8471.50',
    description: 'Processing units other than portable; desktop towers, servers',
    indicativeRatePct: 0,
    category: 'Electronics',
    note: 'Generally duty-free under the ITA. Check the exact ten-digit line.',
  },
  {
    code: '8517.62',
    description: 'Machines for reception/transmission of voice, images or data; networking equipment',
    indicativeRatePct: 0,
    category: 'Electronics',
    note: 'Many lines are duty-free under the ITA, but this heading is broad — confirm the ten-digit code.',
  },
  {
    code: '8528.72',
    description: 'Reception apparatus for television; monitors and displays',
    indicativeRatePct: 10,
    category: 'Electronics',
    note: 'Varies materially by screen type and size.',
  },

  // ── Vehicles and parts ─────────────────────────────────────────────────
  {
    code: '8703.23',
    description: 'Motor cars, spark-ignition, 1500–3000cc',
    indicativeRatePct: 25,
    category: 'Vehicles',
    note: 'Passenger vehicles also attract ad valorem excise based on value, which is NOT included here.',
  },
  {
    code: '8704.21',
    description: 'Goods vehicles, compression-ignition, GVW not exceeding 5 tonnes',
    indicativeRatePct: 20,
    category: 'Vehicles',
    note: 'Commercial vehicle rates differ from passenger rates.',
  },
  {
    code: '8708.99',
    description: 'Parts and accessories of motor vehicles, n.e.s.',
    indicativeRatePct: 20,
    category: 'Vehicles',
    note: 'Some parts lines are rebated for local manufacture — check schedule.',
  },

  // ── Machinery and industrial ───────────────────────────────────────────
  {
    code: '8429.52',
    description: 'Mechanical shovels, excavators and shovel loaders',
    indicativeRatePct: 0,
    category: 'Machinery',
    note: 'Many capital goods lines are duty-free or rebated.',
  },
  {
    code: '8431.49',
    description: 'Parts of boring or sinking machinery',
    indicativeRatePct: 0,
    category: 'Machinery',
    note: '',
  },
  {
    code: '8504.40',
    description: 'Static converters; inverters, rectifiers, UPS',
    indicativeRatePct: 15,
    category: 'Machinery',
    note: 'Some renewable-energy lines are rebated.',
  },

  // ── Clothing and textiles ──────────────────────────────────────────────
  {
    code: '6109.10',
    description: 'T-shirts, singlets and tank tops, of cotton, knitted',
    indicativeRatePct: 40,
    category: 'Clothing & Textiles',
    note: 'Clothing carries some of the highest general rates and is frequently subject to anti-dumping measures.',
  },
  {
    code: '6203.42',
    description: 'Men’s or boys’ trousers, of cotton',
    indicativeRatePct: 40,
    category: 'Clothing & Textiles',
    note: '',
  },
  {
    code: '6403.99',
    description: 'Footwear with outer soles of rubber/plastic and uppers of leather',
    indicativeRatePct: 30,
    category: 'Clothing & Textiles',
    note: 'Footwear has specific rates and an additional specific duty on some lines.',
  },

  // ── Furniture ──────────────────────────────────────────────────────────
  {
    code: '9403.60',
    description: 'Other wooden furniture',
    indicativeRatePct: 20,
    category: 'Furniture',
    note: '',
  },
  {
    code: '9401.71',
    description: 'Seats with metal frames, upholstered',
    indicativeRatePct: 20,
    category: 'Furniture',
    note: '',
  },

  // ── Food and agriculture ───────────────────────────────────────────────
  {
    code: '0901.11',
    description: 'Coffee, not roasted, not decaffeinated',
    indicativeRatePct: 0,
    category: 'Food & Agriculture',
    note: 'Raw agricultural inputs are frequently duty-free.',
  },
  {
    code: '1001.99',
    description: 'Wheat and meslin, other',
    indicativeRatePct: 0,
    category: 'Food & Agriculture',
    note: 'Subject to variable safeguard tariffs — check current notice.',
  },

  // ── Chemicals and plastics ─────────────────────────────────────────────
  {
    code: '3901.10',
    description: 'Polyethylene with a specific gravity of less than 0.94',
    indicativeRatePct: 5,
    category: 'Chemicals & Plastics',
    note: '',
  },
  {
    code: '3923.30',
    description: 'Carboys, bottles, flasks and similar articles, of plastics',
    indicativeRatePct: 15,
    category: 'Chemicals & Plastics',
    note: '',
  },
];

/** The warning attached to every lookup result. Never suppress it. */
export const HS_DISCLAIMER =
  'Indicative only. The binding rate depends on the full ten-digit code, ' +
  'preferential origin (SADC / EU / AfCFTA), rebate provisions and any ' +
  'anti-dumping or safeguard duty in force. Confirm with SARS or a licensed ' +
  'customs broker before quoting.';

/**
 * Search the reference set.
 *
 * Matches on code prefix or description text, so "8517" finds 8517.12 and
 * "laptop" finds the portable ADP line. Deliberately forgiving: someone
 * halfway through typing a code should still get an answer.
 */
export function searchHsCodes(query: string, limit = 25): HsCodeEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return HS_CODES.slice(0, limit);

  const startsWith: HsCodeEntry[] = [];
  const contains: HsCodeEntry[] = [];

  for (const entry of HS_CODES) {
    const code = entry.code.toLowerCase().replace(/\./g, '');
    const qCode = q.replace(/\./g, '');
    const haystack = `${entry.code} ${entry.description} ${entry.category}`.toLowerCase();

    if (code.startsWith(qCode) || entry.description.toLowerCase().startsWith(q)) {
      startsWith.push(entry);
    } else if (haystack.includes(q)) {
      contains.push(entry);
    }
    if (startsWith.length >= limit) break;
  }

  return [...startsWith, ...contains].slice(0, limit);
}

/** Exact lookup, including when the caller omits or adds the dot. */
export function findHsCode(code: string): HsCodeEntry | undefined {
  const wanted = code.trim().replace(/\./g, '').toLowerCase();
  return HS_CODES.find((e) => e.code.replace(/\./g, '').toLowerCase() === wanted);
}
