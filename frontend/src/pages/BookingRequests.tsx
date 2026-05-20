import React, { useEffect, useState } from "react";

type BookingRequest = {
  id: string;
  requestType: string;
  status: string;
  requesterName: string;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  reference?: string | null;
  collectionAddress?: string | null;
  deliveryAddress?: string | null;
  parcelCount?: number | null;
  totalWeightKg?: number | null;
  serviceLevel?: string | null;
  payerSide?: string | null;
  contractCode?: string | null;
  aiRiskScore?: number | null;
  aiConfidence?: number | null;
  aiReviewReason?: string | null;
  createdAt: string;
  client?: {
    id: number;
    name: string;
  } | null;
};

const API_BASE =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, "") ||
  "http://localhost:3000/api";

export default function BookingRequests() {
  const [rows, setRows] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // temporary hardcoded company for first pass
  const companyId = 1;

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`${API_BASE}/booking-portal/companies/${companyId}/requests`);
        if (!res.ok) throw new Error("Failed to load booking requests");

        const data = await res.json();
        setRows(data);
      } catch (err: any) {
        setError(err?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="p-6 text-white">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Booking Requests</h1>
          <p className="mt-2 text-white/70">
            Tenant intake queue for quote, booking, and collection requests.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm text-white/60">
          AI-reviewed requests are shown here before dispatch conversion.
        </div>
      </div>

      {loading ? (
        <div className="mt-6 text-white/70">Loading booking requests...</div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
          No booking requests yet.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full bg-slate-950/40 text-sm">
              <thead className="bg-white/5 text-left text-white/70">
                <tr>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requester</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Contract</th>
                  <th className="px-4 py-3">AI Risk</th>
                  <th className="px-4 py-3">Service</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="px-4 py-3 text-white/70">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-semibold">{row.requestType}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{row.requesterName}</div>
                      <div className="text-xs text-white/60">{row.requesterEmail || row.requesterPhone || "-"}</div>
                    </td>
                    <td className="px-4 py-3">{row.client?.name || "-"}</td>
                    <td className="px-4 py-3">{row.reference || "-"}</td>
                    <td className="px-4 py-3">{row.contractCode || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{row.aiRiskScore ?? "-"}</div>
                      <div className="text-xs text-white/50">{row.aiReviewReason || "-"}</div>
                    </td>
                    <td className="px-4 py-3">{row.serviceLevel || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
