import React, { useEffect, useMemo, useState } from "react";
import { FLOWOPS_API_URL } from "../lib/env";

type PortalCompany = {
  id: number;
  name: string;
  portalBrandName?: string | null;
  portalPrimaryColor?: string | null;
  portalLogoUrl?: string | null;
  portalWhatsappNo?: string | null;
};

type PortalClient = {
  id: number;
  name: string;
} | null;

type PortalResponse = {
  id: string;
  token: string;
  companyId: number;
  clientId?: number | null;
  company: PortalCompany;
  client: PortalClient;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

const API_BASE = FLOWOPS_API_URL;

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
}

export default function BookingPortal() {
  const token = useMemo(() => getTokenFromUrl(), []);
  const [portal, setPortal] = useState<PortalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMsg, setSubmitMsg] = useState("");

  const [form, setForm] = useState({
    requestType: "BOOKING",
    requesterName: "",
    requesterEmail: "",
    requesterPhone: "",
    companyName: "",
    reference: "",
    notes: "",
    collectionAddress: "",
    deliveryAddress: "",
    collectionDate: "",
    deliveryDate: "",
    parcelCount: 1,
    totalWeightKg: "",
    serviceLevel: "",
    payerSide: "SENDER",
    contractCode: "",
    uploadedDocUrl: "",
  });

  useEffect(() => {
    async function loadPortal() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`${API_BASE}/booking-portal/public/${token}`);
        if (!res.ok) {
          throw new Error("Failed to load booking portal");
        }

        const data = await res.json();
        setPortal(data);

        setForm((prev) => ({
          ...prev,
          companyName: data.client?.name || data.company?.name || "",
        }));
      } catch (err: any) {
        setError(err?.message || "Could not load portal");
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      loadPortal();
    } else {
      setLoading(false);
      setError("Missing portal token in URL");
    }
  }, [token]);

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSubmitState("submitting");
      setSubmitMsg("");

      const payload = {
        ...form,
        parcelCount: Number(form.parcelCount || 1),
        totalWeightKg: form.totalWeightKg ? Number(form.totalWeightKg) : undefined,
        clientId: portal?.client?.id,
        collectionDate: form.collectionDate || undefined,
        deliveryDate: form.deliveryDate || undefined,
      };

      const res = await fetch(`${API_BASE}/booking-portal/public/${token}/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Failed to submit booking request");
      }

      setSubmitState("success");
      setSubmitMsg(
        `Request submitted successfully. Status: ${data.status}. AI risk: ${data.aiRiskScore ?? "N/A"}`
      );

      setForm((prev) => ({
        ...prev,
        reference: "",
        notes: "",
        collectionAddress: "",
        deliveryAddress: "",
        collectionDate: "",
        deliveryDate: "",
        parcelCount: 1,
        totalWeightKg: "",
        serviceLevel: "",
        contractCode: "",
        uploadedDocUrl: "",
      }));
    } catch (err: any) {
      setSubmitState("error");
      setSubmitMsg(err?.message || "Submission failed");
    }
  }

  const brandColor = portal?.company?.portalPrimaryColor || "#2563eb";
  const brandName = portal?.company?.portalBrandName || portal?.company?.name || "FlowOps Portal";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        Loading booking portal...
      </div>
    );
  }

  if (error || !portal) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-2xl font-bold">Portal unavailable</h1>
          <p className="mt-3 text-white/70">{error || "This portal could not be loaded."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div
          className="rounded-3xl border border-white/10 p-6 shadow-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
          }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-white/50">
                Tenant Booking Portal
              </div>
              <h1 className="mt-2 text-3xl font-extrabold">{brandName}</h1>
              <p className="mt-2 text-white/70">
                Submit a quote, booking, or collection request directly into operations.
              </p>
              {portal.client?.name ? (
                <p className="mt-2 text-sm text-white/60">
                  Client: <span className="font-semibold text-white">{portal.client.name}</span>
                </p>
              ) : null}
            </div>

            <div
              className="rounded-2xl px-5 py-4 text-sm font-semibold text-white"
              style={{ backgroundColor: brandColor }}
            >
              AI-ready intake enabled
            </div>
          </div>
        </div>

        <form
          onSubmit={submitRequest}
          className="mt-8 grid gap-6 rounded-3xl border border-white/10 bg-white/5 p-6"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Request Type</span>
              <select
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.requestType}
                onChange={(e) => setField("requestType", e.target.value)}
              >
                <option value="QUOTE">Quote</option>
                <option value="BOOKING">Booking</option>
                <option value="COLLECTION">Collection</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Reference</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.reference}
                onChange={(e) => setField("reference", e.target.value)}
                placeholder="Customer reference / PO / internal ref"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Requester Name</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.requesterName}
                onChange={(e) => setField("requesterName", e.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Requester Email</span>
              <input
                type="email"
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.requesterEmail}
                onChange={(e) => setField("requesterEmail", e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Requester Phone</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.requesterPhone}
                onChange={(e) => setField("requesterPhone", e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Contract Code</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.contractCode}
                onChange={(e) => setField("contractCode", e.target.value)}
                placeholder="e.g. Q94"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm text-white/70">Collection Address</span>
              <textarea
                className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.collectionAddress}
                onChange={(e) => setField("collectionAddress", e.target.value)}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm text-white/70">Delivery Address</span>
              <textarea
                className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.deliveryAddress}
                onChange={(e) => setField("deliveryAddress", e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Collection Date</span>
              <input
                type="datetime-local"
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.collectionDate}
                onChange={(e) => setField("collectionDate", e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Delivery Date</span>
              <input
                type="datetime-local"
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.deliveryDate}
                onChange={(e) => setField("deliveryDate", e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Parcel Count</span>
              <input
                type="number"
                min={1}
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.parcelCount}
                onChange={(e) => setField("parcelCount", Number(e.target.value))}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Total Weight (kg)</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.totalWeightKg}
                onChange={(e) => setField("totalWeightKg", e.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Service Level</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.serviceLevel}
                onChange={(e) => setField("serviceLevel", e.target.value)}
                placeholder="Same Day / Next Day / Economy"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/70">Charge Side</span>
              <select
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.payerSide}
                onChange={(e) => setField("payerSide", e.target.value)}
              >
                <option value="SENDER">Sender</option>
                <option value="RECEIVER">Receiver</option>
                <option value="THIRD_PARTY">Third Party</option>
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm text-white/70">Notes</span>
              <textarea
                className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3"
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Special handling, site notes, access info, AI review hints"
              />
            </label>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-white/60">
              This request is submitted directly into the tenant courier’s FlowOps intake queue.
            </div>

            <button
              type="submit"
              disabled={submitState === "submitting"}
              className="rounded-2xl px-6 py-3 font-bold text-white"
              style={{ backgroundColor: brandColor }}
            >
              {submitState === "submitting" ? "Submitting..." : "Submit Request"}
            </button>
          </div>

          {submitMsg ? (
            <div
              className={`rounded-2xl p-4 text-sm ${
                submitState === "success"
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border border-red-500/30 bg-red-500/10 text-red-200"
              }`}
            >
              {submitMsg}
            </div>
          ) : null}

          {portal.company.portalWhatsappNo ? (
            <a
              href={`https://wa.me/${portal.company.portalWhatsappNo.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-white/80 underline"
            >
              Need help? Continue on WhatsApp
            </a>
          ) : null}
        </form>
      </div>
    </div>
  );
}
