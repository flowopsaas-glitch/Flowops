import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Star, CheckCircle2, Loader2, AlertTriangle, Package } from "lucide-react";
import api from "../api/client";

type RatingData = {
  trackingNumber: string;
  status: string;
  recipientName: string | null;
  company: { name: string; logoUrl: string | null; primaryColor: string; brandName: string };
};

export default function RatingPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<RatingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.get(`/waybills/rate/${token}`)
      .then((d: any) => setData(d?.data ?? d))
      .catch(() => setError("This rating link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!selected || !token) return;
    setSubmitting(true);
    try {
      await api.post(`/waybills/rate/${token}`, { rating: selected, note: note || undefined });
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message || "Failed to submit rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const primaryColor = data?.company?.primaryColor || "#3b82f6";
  const brandName = data?.company?.brandName || data?.company?.name || "FlowOps";
  const name = data?.recipientName?.split(/\s+/)[0] || "there";

  const starLabels = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];

  if (loading) return (
    <div className="min-h-screen bg-[#07111f] flex items-center justify-center">
      <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
    </div>
  );

  if (error && !data) return (
    <div className="min-h-screen bg-[#07111f] flex items-center justify-center px-4">
      <div className="max-w-sm text-center space-y-4">
        <div className="h-16 w-16 mx-auto rounded-3xl bg-rose-500/10 border border-rose-400/20 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-rose-400" />
        </div>
        <h1 className="text-xl font-black text-white">Link expired</h1>
        <p className="text-white/50 text-sm">{error}</p>
        <Link to="/track" className="inline-block text-sky-400 text-sm hover:underline">Track a parcel instead</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0d2a63_0%,_#07142d_45%,_#030816_100%)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          {data?.company?.logoUrl ? (
            <img src={data.company.logoUrl} alt={brandName} className="h-14 w-14 mx-auto rounded-2xl object-cover border border-white/10 mb-3" />
          ) : (
            <div className="h-14 w-14 mx-auto rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center mb-3">
              <Package className="h-7 w-7 text-sky-300" />
            </div>
          )}
          <h1 className="text-lg font-black text-white">{brandName}</h1>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] backdrop-blur-xl p-8">
          {submitted ? (
            /* Thank you screen */
            <div className="text-center space-y-5">
              <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white mb-2">Thank you, {name}!</h2>
                <p className="text-white/50">
                  Your {selected}-star rating has been recorded.{" "}
                  {selected >= 4 ? "We're glad your delivery went well! 🎉" : "We'll use your feedback to improve."}
                </p>
              </div>
              <div className="flex justify-center gap-1">
                {[1,2,3,4,5].map((s) => (
                  <Star key={s} className={`h-6 w-6 ${s <= selected ? "fill-amber-400 text-amber-400" : "text-white/20"}`} />
                ))}
              </div>
              <Link
                to="/track"
                className="inline-block text-sky-400 text-sm hover:underline"
              >
                Track another parcel
              </Link>
            </div>
          ) : (
            /* Rating form */
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-black text-white mb-1">
                  How was your delivery?
                </h2>
                <p className="text-sm text-white/50">
                  Parcel <span className="font-bold text-white/70">{data?.trackingNumber}</span>
                </p>
              </div>

              {/* Stars */}
              <div className="flex justify-center gap-2">
                {[1,2,3,4,5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelected(s)}
                    onMouseEnter={() => setHovered(s)}
                    onMouseLeave={() => setHovered(0)}
                    className="transition-transform hover:scale-110 active:scale-95"
                  >
                    <Star
                      className={`h-12 w-12 transition-colors ${
                        s <= (hovered || selected)
                          ? "fill-amber-400 text-amber-400"
                          : "text-white/20 hover:text-amber-300"
                      }`}
                    />
                  </button>
                ))}
              </div>

              {/* Label */}
              <div className="h-6 text-center">
                {(hovered || selected) > 0 && (
                  <span className="text-sm font-bold text-amber-400">
                    {starLabels[hovered || selected]}
                  </span>
                )}
              </div>

              {/* Note */}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Any additional feedback? (optional)"
                rows={3}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-sky-400/40 resize-none"
              />

              {error && (
                <p className="text-sm text-rose-300 text-center">{error}</p>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!selected || submitting}
                className="w-full rounded-2xl py-4 text-base font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: selected ? primaryColor : undefined, backgroundColor: selected ? undefined : "#1e293b" }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
                  </span>
                ) : (
                  `Submit ${selected ? `${selected}-star` : ""} rating`
                )}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-white/20 mt-6">
          Powered by {brandName} · Your feedback is private
        </p>
      </div>
    </div>
  );
}
