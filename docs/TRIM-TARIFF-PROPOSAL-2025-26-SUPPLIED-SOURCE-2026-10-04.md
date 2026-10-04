# TRIM Tariff Proposal 2025/26 — supplied source record

**Date recorded:** 2026-10-04
**Supplied by:** Owner, pasted into session chat
**Document:** "Transnet Rail Infrastructure Manager (TRIM) Tariff Proposal 2025/26 Financial Year", dated 7 February 2025
**Publisher:** Transnet SOC Ltd / TRIM
**Status:** **PROPOSAL, not an approved tariff.** Recorded for structure and for the audit trail. Not loaded as live rates.

---

## 1. Is this the document that unblocks Annexure 40? No.

Three independent reasons, any one of which is disqualifying on its own.

### 1.1 It does not contain ancillary service rates at all

This is decisive. The document states, in its own §6:

> "Ancillary service rates will temporarily increase by CPI (4.6%) while TRIM completes its pricing rationale by **31 July 2025**. Rates will be harmonized across service providers."

So the ancillary rates are explicitly **deferred** in this document, pending a pricing rationale. It confirms the gap I flagged (EXC-043-01) rather than closing it — and it gives the date TRIM committed to closing it by: **31 July 2025**, which has passed. A later document must exist.

### 1.2 Wrong period for the V4 build

NS V4 (Gazette 55426, 21 Sept 2026) governs **FY2026/27 and FY2027/28**. This is the **FY2025/26** proposal. The standing period-separation rule is that an out-of-period source may supply **structure only — never thresholds, timers, rates or KPI targets.**

### 1.3 It is a proposal, not an approved tariff

The document's own recommendation reads "TRIM recommends Option 2 as the preferred balance." A recommendation is not a gazetted tariff. The only *approved* figures in it are the 2024/25 base column, which is two periods behind the build.

**Conclusion:** this cannot be wired into the calculator as V4 rates. It is recorded because it is highly valuable for **structure**, for **historical comparison**, and because it tells us exactly which document to ask for next.

---

## 2. What it IS good for

### 2.1 The access charge model — the structure the calculator needs

TRIM charges access as a **two-part tariff per commodity**:

```
access charge = (R / TrainKm × train kilometres) + (cents / GTK × gross tonne kilometres)
```

with **traction electricity treated separately** as a direct pass-through per IRERC rules, excluded from shared network access fees and allocated on Electric GTKs.

That three-part shape — TrainKm component, GTK component, electricity pass-through — is the model to build. The *values* must come from the V4-era tariff.

### 2.2 Traction electricity E-Rates, verified

Computed from the supplied electricity cost and Electric GTK figures. All seven tie out to the published E-Rate except one, which is out by 0.02c:

| Corridor | Electricity (Rm) | Elec GTK (M) | Computed | Published | |
|---|---|---|---|---|---|
| Coal Exports (NorthCor) | 967 | 59,295 | 1.6308c | 1.63c | OK |
| OreCor (Iron Ore) | 625 | 52,612 | 1.1879c | 1.19c | OK |
| Mineral Exports | 1,245 | 27,662 | 4.5008c | 4.50c | OK |
| Other General Traffic | 645 | 10,289 | 6.2688c | 6.27c | OK |
| Intermodal & Motor Vehicles | 452 | 6,512 | 6.9410c | 6.94c | OK |
| OreCor (Manganese) | 49 | 4,106 | 1.1934c | 1.19c | OK |
| Grain & Tankers | 148 | 2,520 | **5.8730c** | 5.89c | **out by 0.02c** |
| **Total** | **4,131** | **162,996** | | | both totals tie |

The Grain variance is immaterial (0.3%) and consistent with rounding in the published figure.

### 2.3 The road-vs-rail benchmark

Net Tonne Kilometre comparison against the next best alternative — directly relevant to competitive positioning:

| Commodity | Avg distance | Rail R/NTK | Road R/NTK | Road premium |
|---|---|---|---|---|
| Containers | 507 km | R0.43 | R1.23 | +186.04% |
| Magnetite | 574 km | R0.59 | R1.32 | +124.90% |
| Chrome Ore | 614 km | R0.77 | R1.42 | +85.55% |
| Ferrochrome | 565 km | R0.82 | R1.24 | +51.66% |
| Rock Phosphate | 672 km | R0.68 | R0.84 | +24.21% (domestic 59.90%) |

Recomputing from the rounded rates gives +186.05%, +123.73%, +84.42%, +51.22% and +23.53% — the published premiums run slightly higher, consistent with being computed from unrounded rates. Immaterial; noted for completeness.

Rail retains a large cost advantage on every commodity shown, which is the headroom argument for tariff adjustment.

### 2.4 Volumes, Opex and Capex — all tie out

- **Volume forecast** 180.6 Mt: 62.8 + 57.0 + 34.0 + 14.7 + 5.3 + 4.4 + 2.4 = **180.6** ✓
- **Opex** R17,877m: the nine line items sum exactly ✓
- **Capex** R9,361m: 6,612 + 872 + 279 + 1,599 = 9,362 (R1m rounding)
- **Income statement**, all three options: Revenue − Opex = EBITDA ✓; EBITDA − D&A = EBIT ✓
- **Funding deficit** = EBITDA − finance costs − capex, all three options ✓
- **Loan balances** all three imply the same opening balance of **R35,884m** ✓

The financial model is internally consistent. The rate table is not — see §3.

---

## 3. Defects found in the supplied content

### 3.1 Option 2 and Option 3 have identical rates but differ by R3,478m in revenue

Seven of the ten rate lines are **byte-identical** between Option 2 (CPI+) and Option 3 (High Road):

| Commodity | Option 2 | Option 3 | |
|---|---|---|---|
| OreCor Iron Ore | R680 / 3.58c | R680 / 3.58c | identical |
| OreCor Manganese | R680 / 5.55c | R680 / 5.55c | identical |
| Coal Exports | R262 / 6.11c | R262 / 6.11c | identical |
| Mineral Exports | R120 / 9.13c | R120 / 9.13c | identical |
| Metro & Passenger <12 | R52 / 0c | R52 / 0c | identical |
| Passenger >12 | R68 / 0c | R68 / 0c | identical |
| Loose Locomotives | R13 / 0c | R13 / 0c | identical |

Only three differ: Intermodal GTK (4.61c → 26c), Grain (R60/7.28c → R120/25c), Other General (9.94c → 18c).

Yet access fee income is stated as **R22,739m (Option 2)** against **R26,217m (Option 3)** — a difference of **R3,478m**. Identical rates on seven lines, with the three that do differ covering only Intermodal (5.3 Mt), Grain (2.4 Mt) and Other General (14.7 Mt), cannot plausibly generate R3,478m.

**The rate table as supplied is incomplete or the columns are misaligned.** Recorded as an exception; not resolved, because guessing the missing lines would be inventing rates.

### 3.2 Option 2 is called a "CPI+ adjustment" but contains increases of 300%

CPI is stated as **4.6%**. The actual movements:

| Commodity | 2024/25 base | Option 2 | Change | |
|---|---|---|---|---|
| OreCor Iron Ore | R650 | R680 | +4.6% | matches CPI |
| Coal Exports | R250 | R262 | +4.8% | ≈ CPI |
| Passenger >12 | R65 | R68 | +4.6% | matches CPI |
| Metro <12 | R50 | R52 | +4.0% | ≈ CPI |
| Loose Locomotives | R12 | R13 | +8.3% | above CPI |
| **Intermodal & Motor Vehicles** | R30 | **R120** | **+300%** | |
| **Mineral Exports** | R30 | **R120** | **+300%** | |
| **Grain & Tankers** | R30 | R60 | **+100%** | |
| **Other General Traffic** | R30 | R60 | **+100%** | |

The document's own framing is that "grain, intermodal, automotive, and general cargo tariffs are smoothed" toward cost reflectivity. Describing a quadrupling as a CPI+ adjustment is a material characterisation problem: **any operator in those four categories seeing "CPI+ 4.6%" would budget for a 4.6% increase and face 300%.**

This is worth raising with TRIM directly. It is not a coding matter.

### 3.3 Two immaterial rounding variances

- Capex sub-items sum to R9,362m against a stated R9,361m (R1m).
- Support Projects sub-items sum to R1,598m against a stated R1,599m (R1m).

---

## 4. Exceptions raised

| ID | Exception | Effect |
|---|---|---|
| EXC-T25-01 | Ancillary rates explicitly deferred to a 31 July 2025 pricing rationale | EXC-043-01 remains open; money path still blocked |
| EXC-T25-02 | Document is FY2025/26; NS V4 governs FY2026/27–27/28 | Structure only — no rates, timers or targets taken from it |
| EXC-T25-03 | Proposal, not an approved tariff | Not loaded as live rates |
| EXC-T25-04 | Option 2 and 3 rate lines identical but revenue differs R3,478m | Rate table incomplete or misaligned; not reconstructed |
| EXC-T25-05 | "CPI+ 4.6%" option contains 300% increases for four categories | Characterisation defect; raise with TRIM |
| EXC-T25-06 | Grain E-Rate published 5.89c vs computed 5.873c | Immaterial rounding |

---

## 5. What this tells us to ask for next

The 31 July 2025 ancillary pricing rationale has a date on it, so it exists or is overdue. In priority order:

1. **The TRIM ancillary services pricing rationale** (promised 31 July 2025) — this is the document that unblocks the money path.
2. **The FY2026/27 approved tariff** — the V4-era equivalent of this proposal, which supplies the rates the calculator may actually use.
3. **Confirmation of which option was approved** for 2025/26, so the 2024/25 base and the trajectory into V4 are known.
4. **The missing Option 2 / Option 3 rate lines** that reconcile the R3,478m revenue difference.
