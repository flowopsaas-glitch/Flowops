import {
  canTransitionManifest, evaluateManifestForIssue, isManifestEditable, ManifestLine, MANIFEST_TRANSITIONS,
} from './rail-manifest.rules';

const line = (over: Partial<ManifestLine> = {}): ManifestLine => ({
  position: 1, wagonNumber: 'SAR-064213', tareTonnes: 20, loadedTonnes: 60, isDangerousGoods: false, ...over,
});

describe('rail-manifest.rules — lifecycle', () => {
  it('allows the honest lifecycle and nothing else', () => {
    expect(canTransitionManifest('DRAFT', 'ISSUED')).toBe(true);
    expect(canTransitionManifest('ISSUED', 'DEPARTED')).toBe(true);
    expect(canTransitionManifest('DEPARTED', 'ARRIVED')).toBe(true);
    expect(canTransitionManifest('ARRIVED', 'CLOSED')).toBe(true);
    expect(canTransitionManifest('ISSUED', 'SUPERSEDED')).toBe(true);
    expect(canTransitionManifest('ISSUED', 'CANCELLED')).toBe(true);

    // No skipping, no rewriting history.
    expect(canTransitionManifest('DRAFT', 'DEPARTED')).toBe(false);
    expect(canTransitionManifest('DRAFT', 'CLOSED')).toBe(false);
    expect(canTransitionManifest('CLOSED', 'ISSUED')).toBe(false);
    expect(canTransitionManifest('SUPERSEDED', 'ISSUED')).toBe(false);
    expect(canTransitionManifest('CANCELLED', 'DEPARTED')).toBe(false);
  });

  it('only DRAFT is editable — an issued manifest is immutable', () => {
    expect(isManifestEditable('DRAFT')).toBe(true);
    for (const s of ['ISSUED', 'DEPARTED', 'ARRIVED', 'CLOSED', 'SUPERSEDED', 'CANCELLED'] as const) {
      expect(isManifestEditable(s)).toBe(false);
    }
    expect(MANIFEST_TRANSITIONS.CLOSED).toEqual([]);
  });
});

describe('rail-manifest.rules — issue gate', () => {
  const cleanConsignment = { isDangerousGoods: false, consignmentNumber: 'RAIL-2026-00007' };

  it('issues a clean consist with a transparent DG summary', () => {
    const r = evaluateManifestForIssue([line(), line({ position: 2, wagonNumber: 'SAR-064214' })], cleanConsignment);
    expect(r.ok).toBe(true);
    expect(r.dgSummary).toBe('No dangerous goods declared.');
  });

  it('refuses an empty manifest', () => {
    const r = evaluateManifestForIssue([], cleanConsignment);
    expect(r.ok).toBe(false);
    expect(r.blockers.join(' ')).toContain('at least one wagon');
  });

  it('refuses wagons without numbers and nonsense weights', () => {
    const r = evaluateManifestForIssue([
      line({ wagonNumber: '' }),
      line({ position: 2, wagonNumber: 'SAR-1', tareTonnes: -5 }),
      line({ position: 3, wagonNumber: 'SAR-2', loadedTonnes: Number.NaN }),
    ], cleanConsignment);
    expect(r.ok).toBe(false);
    expect(r.blockers.join(' ')).toContain('no wagon number');
    expect(r.blockers.join(' ')).toContain('tare tonnes cannot be negative');
    expect(r.blockers.join(' ')).toContain('loaded tonnes cannot be negative');
  });

  it('blocks issue when dangerous goods are incomplete — same engine as the dispatch gate', () => {
    const r = evaluateManifestForIssue(
      [line({ isDangerousGoods: true, unNumber: 'UN1234', imdgClass: '3' })], // placard/emergency/msds missing
      cleanConsignment,
    );
    expect(r.ok).toBe(false);
    expect(r.blockers.join(' ')).toContain('Dangerous goods incomplete');
    expect(r.dgSummary).toContain('missing');
  });

  it('allows dangerous goods once every mandatory field is present (consignment inheritance)', () => {
    const r = evaluateManifestForIssue(
      [line({ isDangerousGoods: true, unNumber: 'UN1234', imdgClass: '3' })],
      {
        isDangerousGoods: true, consignmentNumber: 'RAIL-2026-00008',
        unNumber: 'UN1234', imdgClass: '3', placardRef: 'PL-9',
        emergencyContact24h: '+27 82 000 0000', msdsDocumentUrl: 'https://safety/msds-1234.pdf',
      },
    );
    expect(r.ok).toBe(true);
    expect(r.dgSummary).toBe('Dangerous-goods details complete.');
  });
});
