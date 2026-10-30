import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SadcCorridors from './SadcCorridors';
import type { BorderPost, ReferenceProvenance, TradeCorridor } from '../../api/forwardingApi';

const h = vi.hoisted(() => ({
  getBorderPosts: vi.fn(),
  getCorridors: vi.fn(),
  walvisVsDurban: vi.fn(),
}));

vi.mock('../../api/forwardingApi', () => ({
  getBorderPosts: h.getBorderPosts,
  getCorridors: h.getCorridors,
  walvisVsDurban: h.walvisVsDurban,
}));

const PROVENANCE: ReferenceProvenance = {
  source: 'STATIC_REFERENCE',
  observed: false,
  measuredByFlowOps: false,
  compiledAsOf: null,
  basis:
    'Hand-compiled reference figures for Southern African border posts and trade corridors. ' +
    'Not measured by FlowOps, not supplied by a border authority, and not a live feed.',
};

const post = (over: Partial<BorderPost> = {}): BorderPost =>
  ({
    code: 'BEIT_BRIDGE',
    name: 'Beit Bridge',
    countries: ['ZA', 'ZW'],
    lat: -22.2167,
    lng: 30.0,
    avgWaitHours: 12,
    peakWaitHours: 48,
    operatingHours: '24/7',
    is24Hour: true,
    requiredDocs: ['passport', 'customs-declaration'],
    congestionLevel: 'CRITICAL',
    notes: 'Busiest SA border.',
    provenance: PROVENANCE,
    ...over,
  }) as BorderPost;

const corridor = (over: Partial<TradeCorridor> = {}): TradeCorridor =>
  ({
    code: 'NORTH_SOUTH',
    name: 'North-South Corridor',
    origin: 'Durban (ZA)',
    destination: 'Lusaka (ZM)',
    distanceKm: 2800,
    avgTransitDays: 5,
    borderPosts: ['BEIT_BRIDGE', 'CHIRUNDU'],
    countries: ['ZA', 'ZW', 'ZM'],
    fuelCostEstimate: 1700,
    tollCostEstimate: 200,
    riskLevel: 'HIGH',
    keyRisks: ['Beit Bridge (12h+ wait)'],
    alternativePort: 'Walvis Bay via Trans-Caprivi',
    provenance: PROVENANCE,
    ...over,
  }) as TradeCorridor;

const renderPage = () =>
  render(
    <MemoryRouter>
      <SadcCorridors />
    </MemoryRouter>,
  );

/**
 * The figures on this page are hand-compiled constants on the server. The page
 * used to say so in a sentence a developer wrote; it now prints the basis the
 * API sends, so the label cannot drift from the data, and every post carries a
 * REFERENCE marker next to its congestion band.
 */
describe('SadcCorridors labels reference data as reference data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getCorridors.mockResolvedValue([corridor()]);
    h.walvisVsDurban.mockResolvedValue(null);
  });

  it('prints the basis the API sent instead of a hardcoded claim', async () => {
    h.getBorderPosts.mockResolvedValue([post()]);
    renderPage();

    const note = await screen.findByTestId('provenance-note');
    await waitFor(() => expect(note.textContent).toContain('Hand-compiled reference figures'));
    expect(note.textContent).toContain('not a live feed');
    expect(screen.getByText(/SADC Corridor Reference/i)).toBeTruthy();
    expect(screen.queryByText(/SADC Corridor Intelligence/i)).toBeNull();
  });

  it('falls back to the pre-provenance wording when the API sends no basis', async () => {
    const { provenance: _ignored, ...legacy } = post();
    h.getBorderPosts.mockResolvedValue([legacy as BorderPost]);
    renderPage();

    const note = await screen.findByTestId('provenance-note');
    await waitFor(() => expect(note.textContent).toContain('Unverified static reference figures'));
    expect(note.textContent).toContain('Not live gate readings');
  });

  it('marks each border post congestion band as REFERENCE, longest wait first', async () => {
    h.getBorderPosts.mockResolvedValue([
      post({ code: 'NGOMA', name: 'Ngoma Bridge', avgWaitHours: 1, congestionLevel: 'LOW' }),
      post(),
    ]);
    renderPage();

    fireEvent.click(await screen.findByText('Border posts'));

    await waitFor(() => expect(screen.getAllByText('REFERENCE').length).toBe(2));
    // Beit Bridge (12h reference wait) is listed before Ngoma (1h).
    const names = screen.getAllByText(/Beit Bridge|Ngoma Bridge/).map((n) => n.textContent);
    expect(names[0]).toContain('Beit Bridge');
    expect(names[1]).toContain('Ngoma Bridge');
    expect(screen.getByText('CRITICAL')).toBeTruthy();
  });
});
