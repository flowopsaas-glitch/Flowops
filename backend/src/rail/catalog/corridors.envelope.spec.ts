/**
 * The six corridors' technical envelope, loaded from Network Statement Volume 4
 * (18 September 2026), Chapter 2 §2.8–2.13.
 *
 * This spec is a GOLDEN TABLE. Every number below was transcribed from the document and
 * nothing else may be substituted for it. If a value is edited here or in the catalog, the
 * two must be changed together — which is the point: a limit is a safety number, and a
 * silently "tidied" axle load is an overweight train.
 *
 * What the document does NOT state stays null and is asserted to stay null (see the
 * vehicle-profile and ruling-gradient cases at the bottom).
 */
import { RailGauge, RailElectrification } from '@prisma/client';
import { CORRIDOR_CATALOG } from './corridors.catalog';
import {
  RAIL_AXLE_LOAD_CLASSES_T, RAIL_ELECTRIFICATION_VALUES, RAIL_GAUGE_VALUES,
  CorridorEnvelopeException, validateReferenceEntry,
} from '../rail-reference';

const byCode = (code: string) => CORRIDOR_CATALOG.find((c) => c.code === code)!;

/** NS V4 §2.8.1.3: all six corridors are declared Cape gauge (the NS writes "1 065mm"). */
const CAPE: RailGauge = 'CAPE_1067MM';

describe('Network Statement V4 Chapter 2 — corridor technical envelope', () => {
  it('admits every axle load the Network Statement states, and no others', () => {
    // 20 / 26 / 30 were already known; 16.5 (Cape §2.11.1.6) and 18.5 (North §2.8.1.6,
    // North-East §2.10.1.6) are stated by the document too, so the value set had to grow.
    expect([...RAIL_AXLE_LOAD_CLASSES_T].sort((a, b) => a - b)).toEqual([16.5, 18.5, 20, 26, 30]);
  });

  it('loads all six corridors with a cited source, none left SOURCE_PENDING', () => {
    expect(CORRIDOR_CATALOG).toHaveLength(6);
    for (const c of CORRIDOR_CATALOG) {
      expect(`${c.code} cites NS: ${/Network Statement/i.test(c.sourceRef ?? '')}`).toBe(`${c.code} cites NS: true`);
      expect(`${c.code} cites section: ${/§2\.(8|9|10|11|12|13)/.test(c.sourceRef ?? '')}`).toBe(`${c.code} cites section: true`);
      expect(`${c.code}: ${c.dataStatus}`).toBe(`${c.code}: PARTIAL`);
    }
  });

  it('does not claim VERIFIED, because the vehicle profile was never supplied', () => {
    // §2.x.1.4 defers the loading gauge to Annexures 2 and 3, which are not in this
    // repository. Without a vehicle profile no corridor can honestly be VERIFIED.
    for (const c of CORRIDOR_CATALOG) {
      expect(c.vehicleProfile).toBeNull();
      expect(c.dataStatus).not.toBe('VERIFIED');
    }
  });

  describe('North — §2.8', () => {
    it('is Cape gauge, 20 t general, ~2000 m, diesel + 25 kV AC + 3 kV DC', () => {
      expect(byCode('COR-NORTH')).toMatchObject({
        gauge: CAPE,
        maxAxleLoadTonnes: 20,
        maxTrainLengthM: 2000,
      });
      expect([...byCode('COR-NORTH').electrification].sort()).toEqual(
        ['AC_25KV', 'DC_3KV', 'DIESEL'].sort(),
      );
    });

    it('records the 26 t upgrade and the 18.5 t downgrade as section exceptions', () => {
      // "…20 tonnes per axle EXCEPT from Blackhill via Ogies and Ermelo to Richard's Bay as
      //  well as Trichardt to Ermelo at 26 tonnes per axle and Empangeni – Nkwalini with
      //  18.5 tons per axle load."
      const ex = byCode('COR-NORTH').envelopeExceptions ?? [];
      const loads = ex.filter((e) => e.kind === 'AXLE_LOAD');
      expect(loads.map((e) => e.tonnes).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([18.5, 26]);
      for (const e of loads) expect(e.sections.length).toBeGreaterThan(10);
      // The named sections belong on the exception, not in prose — a machine has to be able
      // to read which stretches are 26 t and which are 18.5 t, not a human reading notes.
      expect(loads.map((e) => e.sections).join(' | ')).toMatch(/Blackhill/i);
      expect(loads.map((e) => e.sections).join(' | ')).toMatch(/Nkwalini/i);
    });
  });

  describe('Ore — §2.9', () => {
    it('is the 30 t / 50 kV AC heavy-haul corridor', () => {
      expect(byCode('COR-ORE')).toMatchObject({
        gauge: CAPE, maxAxleLoadTonnes: 30, electrification: ['AC_50KV'],
      });
    });

    it('carries the Sishen–Saldanha condition, because 30 t is NOT a through rate', () => {
      // "The 30 tons per axle is only applicable to trains that are loaded on the defined
      //  line between Sishen and Saldanha and any traffic originating from connected
      //  networks on other corridors is limited to the axle weight for the sections of
      //  line traversed on that corridor."
      expect(byCode('COR-ORE').notes).toMatch(/Sishen/i);
      expect(byCode('COR-ORE').notes).toMatch(/Saldanha/i);
    });

    it('states no train length, and so records none', () => {
      // §2.9.1.5 gives 375 wagons but no metre figure — unlike the other five corridors.
      expect(byCode('COR-ORE').maxTrainLengthM).toBeNull();
    });
  });

  describe('North-East — §2.10', () => {
    it('is 20 t general with an 18.5 t branch-line exception', () => {
      expect(byCode('COR-NORTH-EAST')).toMatchObject({
        gauge: CAPE, maxAxleLoadTonnes: 20, maxTrainLengthM: 1600,
      });
      const loads = (byCode('COR-NORTH-EAST').envelopeExceptions ?? []).filter((e) => e.kind === 'AXLE_LOAD');
      expect(loads.map((e) => e.tonnes)).toEqual([18.5]);
    });
  });

  describe('Cape — §2.11', () => {
    it('is 20 t upper with a 16.5 t lower bound recorded', () => {
      // "…a maximum permissible weight of between 16.5 and 20 Tonnes per axle."
      expect(byCode('COR-CAPE')).toMatchObject({ gauge: CAPE, maxAxleLoadTonnes: 20 });
      const loads = (byCode('COR-CAPE').envelopeExceptions ?? []).filter((e) => e.kind === 'AXLE_LOAD');
      expect(loads.map((e) => e.tonnes)).toEqual([16.5]);
    });

    it('records the 610 mm narrow-gauge branches, which a single gauge column cannot hold', () => {
      // "…operate to cape gauge of 1 065mm predominantly, with branch lines between
      //  Humewood Road (Gqeberha) to Gamtoos to Avontuur and Patensie use narrow track
      //  gauge of 610mm."
      const gaugeEx = (byCode('COR-CAPE').envelopeExceptions ?? []).filter((e) => e.kind === 'GAUGE');
      expect(gaugeEx.map((e) => e.gauge)).toEqual(['NARROW_610MM']);
      expect(gaugeEx[0].sections).toMatch(/Avontuur|Patensie|Gamtoos/);
    });
  });

  describe('Central — §2.12 and Container — §2.13', () => {
    it('are both 20 t, 3 kV DC with diesel, ~1200 m', () => {
      for (const code of ['COR-CENTRAL', 'COR-CONTAINER']) {
        const c = byCode(code);
        expect(c).toMatchObject({ gauge: CAPE, maxAxleLoadTonnes: 20, maxTrainLengthM: 1200 });
        expect([...c.electrification].sort()).toEqual(['DC_3KV', 'DIESEL'].sort());
      }
    });

    it('flags the Container wagon count the document states, without inventing a correction', () => {
      // §2.13.1.5 reads "1050 Rail Wagons. approximately 1200m train length", which cannot
      // both be true. We record the length (corroborated by Central's 105 wagons ≈ 1200 m)
      // and keep the published wagon count visible rather than silently fixing it.
      expect(byCode('COR-CONTAINER').notes).toMatch(/1050/);
    });
  });

  describe('the envelope checker still accepts every loaded corridor', () => {
    it('reports no validation problems for any of the six', () => {
      for (const c of CORRIDOR_CATALOG) {
        const problems = validateReferenceEntry(c);
        expect(`${c.code}: ${problems.join('; ')}`).toBe(`${c.code}: `);
      }
    });

    it('rejects an exception the document never states', () => {
      const bad = {
        ...byCode('COR-CENTRAL'),
        envelopeExceptions: [{ kind: 'AXLE_LOAD' as const, sections: 'everywhere', tonnes: 22 }],
      };
      expect(validateReferenceEntry(bad).join(' ')).toMatch(/22/);
    });

    it('rejects an exception with an unknown kind or a value that does not match its kind', () => {
      const base = byCode('COR-CENTRAL');
      const cases: CorridorEnvelopeException[] = [
        { kind: 'VOLTAGE' as never, sections: 'x' },
        { kind: 'AXLE_LOAD', sections: '' },
        { kind: 'GAUGE', sections: 'x', tonnes: 20 } as never,
        { kind: 'AXLE_LOAD', sections: 'x', tonnes: 1000 },
      ];
      for (const e of cases) {
        const p = validateReferenceEntry({ ...base, envelopeExceptions: [e] });
        expect(`${JSON.stringify(e)} -> ${p.length} problems`).toMatch(/-> [1-9]/);
      }
    });
  });

  describe('what the document does not say stays empty', () => {
    it('records no ruling gradient, because Annexure 5 was not supplied', () => {
      for (const c of CORRIDOR_CATALOG) {
        expect((c as unknown as Record<string, unknown>).rulingGradientPerMille ?? null).toBeNull();
      }
    });

    it('uses only vocabulary the Prisma enums actually define', () => {
      for (const c of CORRIDOR_CATALOG) {
        expect(RAIL_GAUGE_VALUES).toContain(c.gauge!);
        for (const t of c.electrification) expect(RAIL_ELECTRIFICATION_VALUES).toContain(t as RailElectrification);
        if (c.maxAxleLoadTonnes !== null) expect(RAIL_AXLE_LOAD_CLASSES_T).toContain(c.maxAxleLoadTonnes);
        for (const e of c.envelopeExceptions ?? []) {
          if (e.gauge) expect(RAIL_GAUGE_VALUES).toContain(e.gauge);
          if (e.tonnes) expect(RAIL_AXLE_LOAD_CLASSES_T).toContain(e.tonnes);
        }
      }
    });
  });
});
