import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { SADC_REFERENCE_PROVENANCE, SadcCorridorService } from './sadc-corridor.service';

/**
 * The border-post and corridor figures in `sadc-corridor.service.ts` are
 * hand-compiled constants. They used to be described - in the service header,
 * in the Swagger summaries and by omission in the payloads - as real-time
 * border congestion and wait-time intelligence, and seven tenant routes served
 * `congestionLevel: 'CRITICAL'` with nothing to say it was not a reading.
 *
 * These tests hold the label on: every response says what it is, the source no
 * longer claims observation, and no freshness stamp is invented.
 */
const svc = new SadcCorridorService({} as any);

/** Strip the provenance blocks so the remaining payload can be scanned for claims. */
const withoutProvenance = (value: unknown): string =>
  JSON.stringify(value, (key, val) => (key === 'provenance' ? undefined : val)) ?? '';

const CLAIMS_OBSERVATION = /real-?time|\blive\b|current congestion|as observed|gate reading/i;

const expectProvenance = (block: unknown) => {
  expect(block).toEqual(SADC_REFERENCE_PROVENANCE);
  const p = block as Record<string, unknown>;
  expect(p.source).toBe('STATIC_REFERENCE');
  expect(p.observed).toBe(false);
  expect(p.measuredByFlowOps).toBe(false);
  // A review date that nobody recorded must not be invented.
  expect(p.compiledAsOf).toBeNull();
  expect(typeof p.basis).toBe('string');
  expect((p.basis as string).length).toBeGreaterThan(40);
};

describe('SADC corridor data is labelled as reference, not as observation', () => {
  describe('border posts', () => {
    it('still returns an array (the API client checks Array.isArray) with every row labelled', () => {
      const posts = svc.getAllBorderPosts();

      expect(Array.isArray(posts)).toBe(true);
      expect(posts.length).toBe(9);
      for (const post of posts) {
        expectProvenance(post.provenance);
        // The reference figures themselves are unchanged.
        expect(typeof post.avgWaitHours).toBe('number');
        expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(post.congestionLevel);
        expect(typeof post.lat).toBe('number');
        expect(post.requiredDocs.length).toBeGreaterThan(0);
      }
    });

    it('labels a single post, and returns null (not a labelled stub) for an unknown code', () => {
      const post = svc.getBorderPost('beit_bridge');
      expect(post?.name).toBe('Beit Bridge');
      expectProvenance(post?.provenance);

      expect(svc.getBorderPost('NOT_A_POST')).toBeNull();
    });

    it('labels the country-pair lookup', () => {
      const posts = svc.getBorderPostsBetween('ZA', 'ZW');
      expect(posts.map((p) => p.code)).toEqual(['BEIT_BRIDGE']);
      expectProvenance(posts[0].provenance);
    });
  });

  describe('corridors', () => {
    it('labels every corridor and keeps the array shape', () => {
      const corridors = svc.getAllCorridors();

      expect(Array.isArray(corridors)).toBe(true);
      expect(corridors.length).toBe(7);
      for (const corridor of corridors) {
        expectProvenance(corridor.provenance);
        expect(typeof corridor.avgTransitDays).toBe('number');
        expect(corridor.borderPosts.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('labels one corridor by code', () => {
      const corridor = svc.getCorridor('north_south');
      expect(corridor?.name).toBe('North-South Corridor');
      expectProvenance(corridor?.provenance);
      expect(svc.getCorridor('NOPE')).toBeNull();
    });
  });

  describe('derived comparisons', () => {
    it('labels the corridor comparison on the envelope and on every ranked row', () => {
      const res = svc.compareCorridors('Durban', 'Lusaka');

      expectProvenance(res.provenance);
      expect(res.corridors.length).toBeGreaterThan(0);
      for (const row of res.corridors) {
        expectProvenance(row.provenance);
        expect(typeof row.totalBorderWaitHours).toBe('number');
        expect(typeof row.estimatedTotalDays).toBe('number');
      }
      // "Best" means best on the reference table, so it must be one of them.
      expect(res.corridors.map((c) => c.code)).toContain(res.bestOption);
    });

    it('labels the Walvis Bay vs Durban comparison', () => {
      const res = svc.walvisBayVsDurban('Lusaka');

      expectProvenance(res.provenance);
      expect(typeof res.savingsDays).toBe('number');
      expect(typeof res.savingsCost).toBe('number');
      expect(res.walvisBay.borderWait).toBeGreaterThan(0);
    });

    it('labels the document list, including for a corridor it does not know', () => {
      const docs = svc.getRequiredDocuments('north_south');
      expectProvenance(docs.provenance);
      expect(docs.documents).toContain('sad500');
      expect(docs.documents).toContain('zim-form47');
      expect(Object.keys(docs.borderDocs).length).toBe(2);

      const unknown = svc.getRequiredDocuments('NOT_A_CORRIDOR');
      expectProvenance(unknown.provenance);
      expect(unknown.documents).toEqual([]);
    });
  });

  describe('no payload claims to be observed', () => {
    it('every response, minus its provenance block, is free of live-data wording', () => {
      const payloads: unknown[] = [
        svc.getAllBorderPosts(),
        svc.getBorderPost('KASUMBALESA'),
        svc.getBorderPostsBetween('ZM', 'CD'),
        svc.getAllCorridors(),
        svc.getCorridor('MAPUTO_CORRIDOR'),
        svc.compareCorridors('Walvis Bay', 'Gaborone'),
        svc.walvisBayVsDurban('Lubumbashi'),
        svc.getRequiredDocuments('TRANS_KALAHARI'),
      ];

      for (const payload of payloads) {
        expect(withoutProvenance(payload)).not.toMatch(CLAIMS_OBSERVATION);
      }
    });
  });

  describe('the source stopped claiming what it cannot support', () => {
    const serviceSource = fs.readFileSync(path.join(__dirname, 'sadc-corridor.service.ts'), 'utf8');
    const controllerSource = fs.readFileSync(path.join(__dirname, 'forwarding.controller.ts'), 'utf8');

    it('the service header no longer advertises real-time congestion or wait-time intelligence', () => {
      for (const claim of [
        'Real-time border congestion levels',
        'Border post wait-time intelligence',
        'Real operational data',
        'World-class trade corridor intelligence',
        'with current congestion levels',
      ]) {
        expect(serviceSource).not.toContain(claim);
      }
      expect(serviceSource).toContain('STATIC_REFERENCE');
    });

    it('all seven SADC route summaries call the figures reference data', () => {
      const sadcRoutes = controllerSource
        .split('\n')
        .filter((line) => line.includes('sadc/') || line.includes('walvis-vs-durban'));
      expect(sadcRoutes.length).toBe(7);

      const summaries = [...controllerSource.matchAll(/summary:\s*\n?\s*'([^']+)'/g)]
        .map((m) => m[1])
        .filter((text) => /border post|corridor|Walvis Bay|Documents a corridor/i.test(text));
      expect(summaries.length).toBeGreaterThanOrEqual(7);
      for (const summary of summaries) {
        expect(summary.toLowerCase()).toMatch(/reference|static|typically/);
      }
    });
  });
});
