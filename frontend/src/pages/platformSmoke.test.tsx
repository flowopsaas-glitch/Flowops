import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

/**
 * Platform smoke (round 74 audit) — "world class, no cracks".
 *
 * 1. Tenant Dashboard: renders against production-shaped TransformInterceptor
 *    envelopes ({ data, statusCode, message }) with zero console errors — the
 *    exact surface the user reported as "dashboard showed an error".
 * 2. Round-73 deliverables are VISIBLE in the UI (shutdown panel, Anx 18/22
 *    tabs, Clearinghouse section, Ad hoc slots tab).
 */

const h = vi.hoisted(() => {
  const errors: string[] = [];
  return {
    errors,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    auth: {
      booting: false,
      user: {
        id: 1,
        email: 'ops@tenant.co.za',
        role: 'ADMIN',
        companyId: 7,
        name: 'Ops User',
        company: { id: 7, name: 'Demo Logistics', currency: 'ZAR', plan: 'Pro', status: 'active' },
        permissions: { dashboard: true, shipments: true, invoices: true, driverDispatch: true },
      },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshMe: vi.fn(),
    },
  };
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: unknown }) => <div data-testid="map">{children as never}</div>,
  TileLayer: () => null, Marker: () => null, Popup: ({ children }: { children?: unknown }) => <>{children as never}</>, useMap: () => ({ setView: () => {} }),
}));
vi.mock('react-leaflet-cluster', () => ({ default: ({ children }: { children?: unknown }) => <>{children as never}</> }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet', () => {
  const Marker = function Marker() {} as unknown as { prototype: { options: { icon: unknown } } };
  Marker.prototype = { options: { icon: null } };
  return {
    default: {
      icon: () => ({}),
      Icon: { Default: { mergeOptions: () => {} } },
      divIcon: () => ({}),
      latLng: () => ({}),
      point: () => ({}),
      Marker,
    },
  };
});
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../hooks/useSocket', () => ({ useSocket: () => ({ socket: null, isConnected: false }) }));
vi.mock('../api/billingApi', () => ({ getEntitlements: vi.fn(async () => ({ features: {} })) }));
vi.mock('../api/client', () => ({
  api: { get: h.apiGet, post: h.apiPost },
  default: { get: h.apiGet, post: h.apiPost },
  getToken: () => 'test-token',
  clearClientSession: vi.fn(),
  isTenantMode: () => true,
  setToken: vi.fn(),
  setLoginMode: vi.fn(),
}));
vi.mock('../components/AiClawChat', () => ({ default: () => <div data-testid="ai-chat-stub" /> }));
vi.mock('../components/premium/CommandCenterHeader', () => ({ CommandCenterHeader: ({ title }: { title?: string }) => <div data-testid="cmd-header">{title}</div> }));
vi.mock('../components/premium/ForwardingControlTower', () => ({ ForwardingControlTower: () => <div data-testid="fwd-tower-stub" /> }));
vi.mock('../components/premium/TiltCard', () => ({ TiltCard: ({ children }: { children?: unknown }) => <div>{children as never}</div> }));
vi.mock('../components/premium/PerformanceTrends', () => ({ PerformanceTrends: () => <div data-testid="trends-stub" /> }));
vi.mock('../components/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../api/railApi', () => ({
  importRailTimetable: vi.fn(), listRailTimetableImports: vi.fn(async () => []), listRailTimetableRows: vi.fn(async () => ({ rows: [], total: 0 })),
}));

import Dashboard from './Dashboard';
import RailOccurrence from './RailOccurrence';
import RailCancellation from './RailCancellation';
import RailAccess from './RailAccess';
import RailTimetable from './RailTimetable';

/** Production envelope shape from the backend TransformInterceptor. */
const envelope = (data: unknown) => ({ data, statusCode: 200, message: '' });

const KPI_PAYLOAD = {
  period: 'last-30-days',
  onTimeDeliveryRate: { value: 94.2, delta: 1.8, unit: 'percent', goodDirection: 'up' },
  deliverySuccessRate: { value: 98.1, delta: -0.4, unit: 'percent', goodDirection: 'up' },
  revenuePerWaybill: { value: 1842.5, delta: 3.2, unit: 'currency', goodDirection: 'up' },
  avgDeliveryHours: { value: 26.4, delta: -2.1, unit: 'hours', goodDirection: 'down' },
  exceptionRate: { value: 1.9, delta: 0.2, unit: 'percent', goodDirection: 'down' },
  outstandingRevenue: { value: 204000, delta: -5.5, unit: 'currency', goodDirection: 'down' },
};

beforeEach(() => {
  h.errors.length = 0;
  h.apiGet.mockReset();
  h.apiPost.mockReset();
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    h.errors.push(args.map(String).join(' '));
  });
  h.apiGet.mockImplementation(async (url: string) => {
    if (url.includes('/dashboard/metrics')) {
      return envelope({ collections: '12', activeDrivers: '3', transit: '5', stock: '8', risks: '1', drivers: [] });
    }
    if (url.includes('/dashboard/kpis')) return envelope(KPI_PAYLOAD);
    if (url.includes('/dashboard/live-etas')) return envelope([]);
    return envelope({});
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Filter test-harness noise that is not a platform defect. */
const platformErrors = () =>
  h.errors.filter((e) => !e.includes('not wrapped in act') && !e.includes('React Router Future Flag'));

describe('platform smoke — tenant dashboard', () => {
  it('renders KPIs from TransformInterceptor envelopes with zero console errors', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // KPI cards render values decoded from the envelope (not the envelope itself)
    await waitFor(() => {
      expect(screen.getByText('94.2%')).toBeInTheDocument();
    });
    // en-ZA currency uses a non-breaking/narrow space between groups — match loosely
    expect(screen.getByText(/R\s*1[\s\u00a0\u202f]*843/)).toBeInTheDocument();
    expect(screen.getByText('26.4h')).toBeInTheDocument(); // 26.4h < 48 -> hours form

    // shell rendered with live metrics decoded
    expect(screen.getByTestId('cmd-header')).toBeInTheDocument();

    expect(platformErrors()).toEqual([]);
  });

  it('survives metric failures without crashing (errors are caught, page renders)', async () => {
    h.apiGet.mockImplementation(async (url: string) => {
      if (url.includes('/dashboard/live-etas')) return envelope([]);
      throw new Error('Network Error');
    });
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('cmd-header')).toBeInTheDocument();
    });
    // Page did not crash; error boundary not triggered
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('renders null-valued KPIs (fresh tenant with no data) without crashing', async () => {
    // Exact production shape: dashboard.service.ts sends value/delta = null when
    // the 30-day window has no data. This used to throw `null.toFixed` and
    // white-screen the tenant dashboard behind the ErrorBoundary.
    const emptyKpis = {
      period: 'last-30-days',
      onTimeDeliveryRate: { value: null, previous: null, delta: null, unit: 'percent', goodDirection: 'up', hasData: false },
      deliverySuccessRate: { value: null, previous: null, delta: null, unit: 'percent', goodDirection: 'up', hasData: false },
      revenuePerWaybill: { value: null, previous: null, delta: null, unit: 'currency', goodDirection: 'up', hasData: false },
      avgDeliveryHours: { value: null, previous: null, delta: null, unit: 'hours', goodDirection: 'down', hasData: false },
      exceptionRate: { value: null, previous: null, delta: null, unit: 'percent', goodDirection: 'down', hasData: false },
      outstandingRevenue: { value: 0, previous: null, delta: null, unit: 'currency', goodDirection: 'down', hasData: true },
    };
    h.apiGet.mockImplementation(async (url: string) => {
      if (url.includes('/dashboard/metrics')) {
        return envelope({ collections: '0', activeDrivers: '0', transit: '0', stock: '0', risks: '0', drivers: [] });
      }
      if (url.includes('/dashboard/kpis')) return envelope(emptyKpis);
      if (url.includes('/dashboard/live-etas')) return envelope([]);
      return envelope({});
    });
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    // The em-dash placeholder renders for null values — and nothing crashes.
    await waitFor(() => {
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.getAllByText('no data yet').length).toBeGreaterThan(0);
    expect(platformErrors()).toEqual([]);
  });
});

describe('platform smoke — round 73 deliverables are visible', () => {
  it('RailOccurrence shows the Annexure 18 roles tables and Annexure 22 loading profiles', async () => {
    render(<MemoryRouter><RailOccurrence /></MemoryRouter>);
    fireEvent.click(screen.getByText('Roles & costs (Annexure 18)'));
    await waitFor(() => {
      expect(screen.getByText(/Table 1\.1\.1\.1/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Joint occurrence investigation\*/)).toBeInTheDocument();
    expect(screen.getByText(/repair\/replacement of rolling stock/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Loading profiles (Annexure 22)'));
    await waitFor(() => {
      expect(screen.getAllByText(/RSE\/TE\/LPR\/0010/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Chrome')).toBeInTheDocument();
    expect(screen.getByText('2.7 ton/m3 to 2.95 ton/m3')).toBeInTheDocument();
    expect(platformErrors()).toEqual([]);
  });

  it('RailCancellation shows the Annexure 21 Clearinghouse section', () => {
    render(<MemoryRouter><RailCancellation /></MemoryRouter>);
    expect(screen.getByText(/Clearinghouse Process Narrative v5/)).toBeInTheDocument();
    expect(screen.getByText(/12h00 from Tuesday to Fridays/)).toBeInTheDocument();
    expect(screen.getByText(/older than 48 hours will not be open for dispute/)).toBeInTheDocument();
    expect(platformErrors()).toEqual([]);
  });

  it('RailAccess shows the Ad hoc slots tab with preserved step quirks', async () => {
    render(<MemoryRouter><RailAccess /></MemoryRouter>);
    fireEvent.click(screen.getByText('Ad hoc slots (32)'));
    await waitFor(() => {
      expect(screen.getAllByText(/21 days before execution/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/Assess Operational Risk of Ad hoc Request/)).toBeInTheDocument();
    expect(screen.getByText(/E-ANX32-01 \/ E-ANX32-02/)).toBeInTheDocument();
    expect(platformErrors()).toEqual([]);
  });

  it('RailTimetable shows the Annexure 1 shutdown panel with windows and sign-off', async () => {
    render(<MemoryRouter><RailTimetable /></MemoryRouter>);
    // Panel header is discoverable
    expect(screen.getByText(/2024\/25 Revised Shutdown Schedule/)).toBeInTheDocument();
    // Open the panel and expect the window chips + CEO sign-off
    const summary = screen.getByText(/2024\/25 Revised Shutdown Schedule/);
    fireEvent.click(summary);
    await waitFor(() => {
      expect(screen.getByText(/23 July -1 Aug 2024/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Russell Baatjies/)).toBeInTheDocument();
    expect(platformErrors()).toEqual([]);
  });
});
