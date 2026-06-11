import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api/client';

type User = {
  id: number;
  email: string;
  role: string;
};

type Client = { id: number; name: string };
type Courier = { id: number; name: string };

type Collection = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  companyId: number;

  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';

  approvedAt: string | null;
  approvedById: number | null;
  approvedBy?: User | null;

  rejectedAt: string | null;
  rejectedById: number | null;
  rejectedBy?: User | null;

  rejectionReason: string | null;

  createdById: number | null;
  createdBy?: User | null;

  clientId: number | null;
  client?: Client | null;

  courierId: number | null;
  courier?: Courier | null;
};

function fmt(dt: string | null | undefined) {
  if (!dt) return '';
  const d = new Date(dt);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function ApprovalMeta({ c }: { c: Collection }) {
  if (c.approvalStatus === 'APPROVED') {
    return (
      <div style={{ fontSize: 13 }}>
        <div><strong>Approved</strong></div>
        <div>By: {c.approvedBy?.email ?? c.approvedById ?? '—'}</div>
        <div>At: {fmt(c.approvedAt) || '—'}</div>
      </div>
    );
  }

  if (c.approvalStatus === 'REJECTED') {
    return (
      <div style={{ fontSize: 13 }}>
        <div><strong>Rejected</strong></div>
        <div>By: {c.rejectedBy?.email ?? c.rejectedById ?? '—'}</div>
        <div>At: {fmt(c.rejectedAt) || '—'}</div>
        <div>Reason: {c.rejectionReason ?? '—'}</div>
      </div>
    );
  }

  return (
    <div style={{ fontSize: 13 }}>
      <div><strong>Pending approval</strong></div>
    </div>
  );
}

export default function PendingApprovalsPage() {
  const [items, setItems] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const pendingCount = useMemo(() => items.length, [items]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Collection[]>('/collections/pending-approval');
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function approve(id: number) {
    setError(null);
    try {
      await apiFetch(`/collections/${id}/approve`, { method: 'POST' });
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Approve failed');
    }
  }

  async function reject(id: number, reason: string) {
    setError(null);
    try {
      await apiFetch(`/collections/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setRejectId(null);
      setRejectReason('');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Reject failed');
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 6 }}>Pending Approvals</h2>
      <div style={{ marginBottom: 12, opacity: 0.8 }}>
        Count: <strong>{pendingCount}</strong>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#ffe5e5', padding: 10, borderRadius: 8, marginBottom: 12 }}>
          <strong>Error:</strong> <span>{error}</span>
        </div>
      )}

      {items.length === 0 && !loading && (
        <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 10 }}>
          No pending approvals.
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((c) => (
          <div
            key={c.id}
            style={{
              border: '1px solid #ddd',
              borderRadius: 12,
              padding: 12,
              display: 'grid',
              gridTemplateColumns: '1fr 260px',
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <h3 style={{ margin: 0 }}>{c.name}</h3>
                <span style={{ fontSize: 12, opacity: 0.75 }}>#{c.id}</span>
              </div>

              <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 13, opacity: 0.85 }}>
                <div>Status: <strong>{c.status}</strong></div>
                <div>Approval: <strong>{c.approvalStatus}</strong></div>
                <div>Created: {fmt(c.createdAt)}</div>
              </div>

              <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
                <div>Client: <strong>{c.client?.name ?? (c.clientId ? `#${c.clientId}` : '—')}</strong></div>
                <div>Courier: <strong>{c.courier?.name ?? (c.courierId ? `#${c.courierId}` : '—')}</strong></div>
                <div>Created by: <strong>{c.createdBy?.email ?? (c.createdById ? `#${c.createdById}` : '—')}</strong></div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => approve(c.id)}>Approve</button>
                <button
                  onClick={() => {
                    setRejectId(c.id);
                    setRejectReason('');
                  }}
                >
                  Reject
                </button>
              </div>

              {rejectId === c.id && (
                <div style={{ marginTop: 10, padding: 10, border: '1px dashed #aaa', borderRadius: 10 }}>
                  <div style={{ marginBottom: 6, fontWeight: 600 }}>Reject reason (optional)</div>
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Missing required info"
                    style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ccc' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => reject(c.id, rejectReason)}>Confirm Reject</button>
                    <button
                      onClick={() => {
                        setRejectId(null);
                        setRejectReason('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ borderLeft: '1px solid #eee', paddingLeft: 12 }}>
              <ApprovalMeta c={c} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
