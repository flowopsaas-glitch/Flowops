import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => {
  const mob = (state: string, label: string, daysRemaining: number | null, mobilizeBy: string | null = null) => ({ state, label, daysRemaining, mobilizeBy });
  const app = (over: Record<string, unknown> = {}) => ({
    id: 'a1', applicationNumber: 'SA-2026-00001', status: 'DRAFT', corridorCode: 'COR-ORE', isDangerousGoods: false,
    requestedFrom: '2026-11-01T00:00:00.000Z', requestedUntil: '2027-11-01T00:00:00.000Z', createdAt: '2026-10-02T00:00:00.000Z',
    mobilisation: mob('NOT_ALLOCATED', 'Not allocated', null), ...over,
  });
  const evaluation = (ok: boolean, blockers: string[] = []) => ({
    stage: 'SUBMIT', ok, required: [], satisfied: [], missing: [], expired: [], revoked: [], pendingReview: [], notYetValid: [], expiringSoon: [], blockers,
  });
  const envelope = (status: string, extra: Record<string, unknown> = {}) => ({
    status, corridorCode: 'COR-ORE', corridorVerified: false, violations: [], warnings: [], unverified: [], subjectsChecked: 1, checkedAt: '2026-10-02T00:00:00Z',
    source: 'CONSIGNMENT', consignment: { id: 'c1', consignmentNumber: 'RAIL-2026-00007', corridor: 'Ore', wagons: 2 },
    corridor: { code: 'COR-ORE', name: 'Ore', dataStatus: 'SOURCE_PENDING' }, corridorQuery: 'Ore', ...extra,
  });
  const state = {
    rsr: { level: 'OK', validUntil: '2027-05-01T00:00:00.000Z', daysRemaining: 211, referenceNumber: 'RSR-1', message: 'RSR Safety Permit valid for 211 more day(s).' } as Record<string, unknown>,
    reference: {
      corridors: { expected: 6, loaded: 6, verified: 0 }, yards: { expected: 11, loaded: 0, verified: 0 }, fromCatalogFallback: true,
      message: 'Corridor limits and the transfer-yard list have not been loaded from a cited source.',
    } as Record<string, unknown>,
    apps: [] as unknown[],
    docs: [] as unknown[],
    readiness: null as unknown,
    envelopeResult: envelope('UNVERIFIED', { unverified: ["The Ore corridor's reference data is not VERIFIED (SOURCE_PENDING); limits cannot be relied on."] }) as unknown,
  };
  return { mob, app, evaluation, envelope, state };
});

vi.mock('../../components/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api/railApi', () => ({
  listConsignments: vi.fn().mockResolvedValue([{ id: 'c1', consignmentNumber: 'RAIL-2026-00007', commodity: 'Manganese', status: 'PLANNED' }]),
}));
vi.mock('../../api/railSlotApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/railSlotApi')>()),
  getSlotOverview: vi.fn(async () => ({
    generatedAt: '', applications: { total: h.state.apps.length, byStatus: {}, byMobilisationState: {}, needingAttention: [] },
    compliance: { rsrPermit: h.state.rsr, submit: h.evaluation(true), operate: h.evaluation(false) }, reference: h.state.reference,
  })),
  getCompliance: vi.fn(async () => ({
    rsrPermit: h.state.rsr, submit: h.evaluation(true), submitWithDangerousGoods: h.evaluation(false), operate: h.evaluation(false), documents: h.state.docs,
  })),
  listSlotApplications: vi.fn(async () => h.state.apps),
  getSlotApplication: vi.fn(async (id: string) => h.state.apps.find((a) => (a as { id: string }).id === id)),
  getSlotReadiness: vi.fn(async () => h.state.readiness),
  getSelfScreeningForm: vi.fn(async () => ({
    version: 'Second Draft, 12 March 2024',
    questions: ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'].map((no) => ({ no, key: `k${no}`, assessment: `Question ${no} text` })),
  })),
  getCorridors: vi.fn(async () => [
    { code: 'COR-ORE', name: 'Ore', aliases: [], workbookRoutes: [], gauge: null, electrification: [], maxAxleLoadTonnes: null, vehicleProfile: null, maxTrainLengthM: null, dataStatus: 'SOURCE_PENDING', sourceRef: null, notes: null, fromCatalog: true },
  ]),
  checkEnvelope: vi.fn(async () => h.state.envelopeResult),
}));

import SlotCompliancePanel from './SlotCompliancePanel';
import { getCompliance, listSlotApplications } from '../../api/railSlotApi';

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'd1', docType: 'RSR_PERMIT', status: 'VALID', effectiveStatus: 'VALID', daysRemaining: 211, validFrom: '2026-01-01T00:00:00Z', validUntil: '2027-05-01T00:00:00Z', referenceNumber: 'RSR-1', ...over,
});
const btn = (name: RegExp) => screen.queryByRole('button', { name });
const mount = async (canWrite = true, canSign = true) => {
  render(<SlotCompliancePanel canWrite={canWrite} canSign={canSign} />);
  await screen.findByTestId('slot-compliance-panel');
};

beforeEach(() => {
  h.state.rsr = { level: 'OK', validUntil: '2027-05-01T00:00:00.000Z', daysRemaining: 211, referenceNumber: 'RSR-1', message: 'RSR Safety Permit valid for 211 more day(s).' };
  h.state.apps = [];
  h.state.docs = [];
  h.state.readiness = null;
});

describe('RSR permit expiry guard', () => {
  it('an EXPIRED permit shows a red banner and says submission is blocked', async () => {
    h.state.rsr = { level: 'EXPIRED', validUntil: '2026-09-29T00:00:00.000Z', daysRemaining: -3, referenceNumber: 'RSR-1', message: 'The RSR Safety Permit expired on 2026-09-29.' };
    await mount();
    const banner = screen.getAllByRole('status')[0];
    expect(banner.textContent).toMatch(/RSR Safety Permit — EXPIRED/);
    expect(banner.textContent).toMatch(/expired 3 days ago/);
    expect(banner.textContent).toMatch(/Submitting a slot application is blocked/);
    expect(banner.className).toMatch(/rose/);
  });
  it('a missing permit is blocked too', async () => {
    h.state.rsr = { level: 'MISSING', validUntil: null, daysRemaining: null, referenceNumber: null, message: 'No RSR Safety Permit is on file.' };
    await mount();
    expect(screen.getAllByRole('status')[0].textContent).toMatch(/blocked/);
  });
  it('an expiring permit warns in amber but does NOT claim a block', async () => {
    h.state.rsr = { level: 'WARNING', validUntil: '2026-10-14T00:00:00.000Z', daysRemaining: 12, referenceNumber: 'RSR-1', message: 'RSR Safety Permit expires in 12 day(s).' };
    await mount();
    const banner = screen.getAllByRole('status')[0];
    expect(banner.className).toMatch(/amber/);
    expect(banner.textContent).toMatch(/12 days left/);
    expect(banner.textContent).not.toMatch(/blocked/);
  });
  it('a healthy permit is green', async () => {
    await mount();
    expect(screen.getAllByRole('status')[0].className).toMatch(/emerald/);
  });
});

describe('reference data honesty', () => {
  it('warns that corridor limits and the yard list are not loaded: 0/6 verified, 0/11 yards', async () => {
    await mount();
    const warn = screen.getAllByRole('status').find((b) => /Reference data incomplete/.test(b.textContent ?? ''))!;
    expect(warn.textContent).toMatch(/0\/6 corridors verified, 0\/11 transfer yards loaded/);
    expect(warn.textContent).toMatch(/not been loaded from a cited source/);
  });
  it('shows no warning once everything is loaded and verified', async () => {
    h.state.reference = { corridors: { expected: 6, loaded: 6, verified: 6 }, yards: { expected: 11, loaded: 11, verified: 11 }, fromCatalogFallback: false, message: 'ok' };
    await mount();
    expect(screen.queryByText(/Reference data incomplete/)).toBeNull();
  });
});

describe('documents register', () => {
  it('treats absent status buckets as zero rather than rendering NaN', async () => {
    await mount();
    expect(screen.getByText('Awaiting assessment').parentElement?.textContent).toMatch(/Awaiting assessment0$/);
  });

  it('does not interpret a failed compliance request as eight missing documents', async () => {
    vi.mocked(getCompliance).mockRejectedValueOnce(new Error('compliance API unavailable'));
    await mount();
    expect(screen.getByRole('alert')).toHaveTextContent(/Compliance documents unavailable: compliance API unavailable/);
    expect(screen.queryByText('NOT ON FILE')).toBeNull();
  });

  it('lists all eight document types, marking absent ones NOT ON FILE', async () => {
    await mount();
    for (const label of ['RSR Safety Permit', 'Insurance', 'Rolling-stock certification', 'Train-crew certification', 'Dangerous-goods authorisation', 'Interface agreement', 'Access contract (RAA)', 'Security deposit / guarantee']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getAllByText('NOT ON FILE')).toHaveLength(8);
  });
  it('shows the server-computed status and days left, with expired in red', async () => {
    h.state.docs = [doc({ docType: 'INSURANCE', id: 'd2', effectiveStatus: 'EXPIRED', status: 'VALID', daysRemaining: -4, validUntil: '2026-09-28T00:00:00Z' }), doc()];
    await mount();
    const row = screen.getByText('Insurance').closest('tr')!;
    expect(within(row).getByText('EXPIRED').className).toMatch(/rose/);
    expect(row.textContent).toMatch(/expired 4 days ago/);
    expect(within(screen.getByText('RSR Safety Permit').closest('tr')!).getByText('VALID').className).toMatch(/emerald/);
  });
  it('an authorised representative can verify a pending document and revoke a live one', async () => {
    h.state.docs = [doc({ status: 'PENDING_REVIEW', effectiveStatus: 'PENDING_REVIEW' })];
    await mount(true, true);
    const row = screen.getByText('RSR Safety Permit').closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Verify' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Revoke' })).toBeTruthy();
  });
  it('a dispatcher (can write, cannot sign) can record documents but not verify or revoke them', async () => {
    h.state.docs = [doc({ status: 'PENDING_REVIEW', effectiveStatus: 'PENDING_REVIEW' })];
    await mount(true, false);
    const row = screen.getByText('RSR Safety Permit').closest('tr')!;
    expect(within(row).queryByRole('button', { name: 'Verify' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Revoke' })).toBeNull();
    expect(within(row).getByRole('button', { name: /Add renewal/ })).toBeTruthy();
  });
  it('a read-only viewer sees the register but no controls at all', async () => {
    h.state.docs = [doc({ status: 'PENDING_REVIEW', effectiveStatus: 'PENDING_REVIEW' })];
    await mount(false, false);
    expect(btn(/Verify/)).toBeNull();
    expect(btn(/Revoke/)).toBeNull();
    expect(btn(/^Add/)).toBeNull();
    expect(btn(/New application/)).toBeNull();
  });
});

describe('slot applications and the 60-day mobilisation countdown badge', () => {
  it('surfaces a failed applications request instead of saying there are no applications', async () => {
    vi.mocked(listSlotApplications).mockRejectedValueOnce(new Error('application API unavailable'));
    await mount();
    expect(screen.getByText(/Application records unavailable: application API unavailable/)).toBeTruthy();
    expect(screen.queryByText('No slot applications yet.')).toBeNull();
  });

  it('shows the server-computed countdown, amber when due soon, red when flagged', async () => {
    h.state.apps = [
      h.app({ id: 'a1', applicationNumber: 'SA-ON', status: 'ALLOCATED', mobilisation: h.mob('ON_TRACK', '47 day(s) to mobilise', 47, '2026-11-18T00:00:00Z') }),
      h.app({ id: 'a2', applicationNumber: 'SA-DUE', status: 'ALLOCATED', mobilisation: h.mob('DUE_SOON', '6 day(s) to mobilise', 6, '2026-10-08T00:00:00Z') }),
      h.app({ id: 'a3', applicationNumber: 'SA-FLAG', status: 'ALLOCATED', mobilisation: h.mob('FORFEITURE_FLAGGED', 'Forfeiture flagged — unoperated', -9) }),
      h.app({ id: 'a4', applicationNumber: 'SA-RUN', status: 'ALLOCATED', mobilisation: h.mob('OPERATED', 'Operating', 30) }),
      h.app({ id: 'a5', applicationNumber: 'SA-NEW', status: 'DRAFT' }),
    ];
    await mount();
    const badge = (n: string) => within(screen.getByText(n).closest('tr')!);
    expect(badge('SA-ON').getByText('47 day(s) to mobilise').className).toMatch(/emerald/);
    expect(badge('SA-DUE').getByText('6 day(s) to mobilise').className).toMatch(/amber/);
    expect(badge('SA-FLAG').getByText('Forfeiture flagged — unoperated').className).toMatch(/rose/);
    expect(badge('SA-RUN').getByText('Operating').className).toMatch(/sky/);
    expect(badge('SA-NEW').queryByText(/mobilise/)).toBeNull(); // no clock before allocation
  });
  it('the badge explains itself on hover: mobilise-by date = allocation + 60 days', async () => {
    h.state.apps = [h.app({ status: 'ALLOCATED', mobilisation: h.mob('ON_TRACK', '47 day(s) to mobilise', 47, '2026-11-18T00:00:00Z') })];
    await mount();
    expect(screen.getByText('47 day(s) to mobilise').getAttribute('title')).toBe('Mobilise by 2026-11-18 (allocation + 60 days)');
  });
  it('writers get "New application"; readers do not', async () => {
    await mount(true, true);
    expect(btn(/New application/)).toBeTruthy();
  });
});

describe('application drawer', () => {
  const draft = () => h.app({ id: 'a1', status: 'DRAFT' });

  it('lists the submission blockers and keeps Submit disabled while any remain', async () => {
    h.state.apps = [draft()];
    h.state.readiness = {
      ready: false, status: 'DRAFT', notes: [], selfScreening: { complete: false, unanswered: ['i'], flagged: [], missingRemarks: [] },
      compliance: h.evaluation(false), envelope: h.envelope('UNVERIFIED'),
      blockers: ['Compliance — RSR_PERMIT: EXPIRED on 2026-09-29.', 'Annexure 25 self-screening is incomplete (unanswered: i).'],
    };
    await mount(true, true);
    fireEvent.click(screen.getByText('SA-2026-00001'));
    const r = await screen.findByTestId('readiness');
    expect(r.textContent).toMatch(/2 blockers — cannot be submitted yet/);
    expect(r.textContent).toMatch(/RSR_PERMIT: EXPIRED on 2026-09-29/);
    const submit = await screen.findByRole('button', { name: 'Submit application' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Submit when every gate passes — and an UNVERIFIED envelope is shown, never presented as a pass', async () => {
    h.state.apps = [draft()];
    h.state.readiness = {
      ready: true, status: 'DRAFT', blockers: [], notes: ['The corridor envelope could not be verified — submission is allowed, but FlowOps has not confirmed that the rolling stock fits.'],
      selfScreening: { complete: true, unanswered: [], flagged: [], missingRemarks: [] }, compliance: h.evaluation(true), envelope: h.envelope('UNVERIFIED', { unverified: ['x'] }),
    };
    await mount(true, true);
    fireEvent.click(screen.getByText('SA-2026-00001'));
    const r = await screen.findByTestId('readiness');
    expect(r.textContent).toMatch(/All hard gates pass/);
    expect(r.textContent).toMatch(/has not confirmed that the rolling stock fits/);
    expect(within(r).getByText('Unverified — fit not confirmed').className).toMatch(/amber/);
    expect((await screen.findByRole('button', { name: 'Submit application' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a non-signatory is never offered Submit', async () => {
    h.state.apps = [draft()];
    h.state.readiness = { ready: true, status: 'DRAFT', blockers: [], notes: [], selfScreening: { complete: true, unanswered: [], flagged: [], missingRemarks: [] }, compliance: h.evaluation(true), envelope: h.envelope('COMPATIBLE') };
    await mount(true, false);
    fireEvent.click(screen.getByText('SA-2026-00001'));
    await screen.findByTestId('readiness');
    expect(btn(/Submit application/)).toBeNull();
  });

  it('renders all seven Annexure 25 questions, with remarks required for a No', async () => {
    h.state.apps = [draft()];
    h.state.readiness = { ready: false, status: 'DRAFT', blockers: ['x'], notes: [], selfScreening: { complete: false, unanswered: [], flagged: [], missingRemarks: [] }, compliance: h.evaluation(false), envelope: h.envelope('UNVERIFIED') };
    await mount(true, true);
    fireEvent.click(screen.getByText('SA-2026-00001'));
    await screen.findByText('Question vii text');
    expect(screen.getAllByRole('radio')).toHaveLength(14);
    expect(screen.queryByLabelText('Question ii remarks')).toBeNull();
    fireEvent.click(screen.getByLabelText('Question ii NO'));
    expect(await screen.findByLabelText('Question ii remarks')).toBeTruthy();
    expect(screen.getByText(/Form version: Second Draft, 12 March 2024/)).toBeTruthy();
  });

  it('an ALLOCATED slot offers first-operation, linking and expiry — and a flagged one says so', async () => {
    h.state.apps = [h.app({ status: 'ALLOCATED', allocatedAt: '2026-07-01T00:00:00Z', mobilizeBy: '2026-08-30T00:00:00Z', forfeitureFlaggedAt: '2026-08-31T00:00:00Z',
      mobilisation: h.mob('FORFEITURE_FLAGGED', 'Forfeiture flagged — unoperated', -33) })];
    await mount(true, true);
    fireEvent.click(screen.getByText('SA-2026-00001'));
    expect(await screen.findByText('Flagged for forfeiture')).toBeTruthy();
    for (const n of [/Mark first operation/, /Link consignment/, /Mark expired/]) expect(await screen.findByRole('button', { name: n })).toBeTruthy();
  });

  it('a read-only viewer can open an application but gets no action buttons', async () => {
    h.state.apps = [h.app({ status: 'UNDER_ASSESSMENT' })];
    await mount(false, false);
    fireEvent.click(screen.getByText('SA-2026-00001'));
    await screen.findByRole('dialog', { name: /Slot application SA-2026-00001/ });
    expect(screen.queryByLabelText('Actions')).toBeNull();
  });
});

describe('envelope checker', () => {
  const runCheck = async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('Consignment'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: /Run check/ }));
    return screen.findByTestId('envelope-result');
  };

  it('reports UNVERIFIED in words when a corridor\'s limits are not loaded', async () => {
    h.state.envelopeResult = h.envelope('UNVERIFIED', { unverified: ["The Ore corridor's reference data is not VERIFIED (SOURCE_PENDING); limits cannot be relied on."] });
    const result = await runCheck();
    expect(within(result).getByText('Unverified — fit not confirmed').className).toMatch(/amber/);
    expect(result.textContent).toMatch(/not VERIFIED/);
    expect(result.textContent).toMatch(/data not verified/);
  });

  it('reports INCOMPATIBLE with the offending wagon and the excess', async () => {
    h.state.envelopeResult = h.envelope('INCOMPATIBLE', {
      corridorVerified: true, corridor: { code: 'COR-ORE', name: 'Ore', dataStatus: 'VERIFIED' },
      violations: [{ code: 'AXLE_LOAD_EXCEEDED', severity: 'VIOLATION', subject: 'HEAVY-2', message: 'HEAVY-2: axle load 28.75 t exceeds the Ore corridor limit of 26 t by 2.75 t.' }],
    });
    const result = await runCheck();
    expect(within(result).getByText('Incompatible — rejected').className).toMatch(/rose/);
    expect(result.textContent).toMatch(/HEAVY-2: axle load 28.75 t exceeds/);
    expect(result.textContent).toMatch(/verified data/);
  });

  it('reports COMPATIBLE in green only when nothing is unverified', async () => {
    h.state.envelopeResult = h.envelope('COMPATIBLE', { corridorVerified: true, corridor: { code: 'COR-ORE', name: 'Ore', dataStatus: 'VERIFIED' } });
    const result = await runCheck();
    expect(within(result).getByText('Compatible').className).toMatch(/emerald/);
  });

  it('Run check stays disabled until there is something to check', async () => {
    await mount();
    expect((screen.getByRole('button', { name: /Run check/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Consignment'), { target: { value: 'c1' } });
    await waitFor(() => expect((screen.getByRole('button', { name: /Run check/ }) as HTMLButtonElement).disabled).toBe(false));
  });
});
