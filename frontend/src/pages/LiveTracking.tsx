import React, { useEffect, useMemo, useState } from "react";
import { getLiveShipments } from "@/api/shipmentsApi";
import { shipmentsCopilot } from "@/api/aiCopilotApi";

type AnyShipment = any;

export default function LiveTracking() {
  const [shipments, setShipments] = useState<AnyShipment[]>([]);
  const [loading, setLoading] = useState(false);

  const [question, setQuestion] = useState("");
  const [copilot, setCopilot] = useState<any>(null);
  const [asking, setAsking] = useState(false);

  const summary = useMemo(() => {
    return {
      total: shipments.length,
      atRisk: shipments.filter((s: any) => s?.ai?.risk >= 0.7).length,
    };
  }, [shipments]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        // Execute the API call
        const data: any = await getLiveShipments();
        
        // Safety check for data format
        const items = Array.isArray(data) 
          ? data 
          : (data && Array.isArray((data as any).items) ? (data as any).items : []);
          
        if (!cancelled) setShipments(items);
      } catch (error) {
        console.error("Failed to fetch shipments:", error);
        if (!cancelled) setShipments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function ask() {
    if (!question.trim()) return;
    try {
      setAsking(true);
      const res: any = await shipmentsCopilot({ question });
      setCopilot(res);
    } catch (error) {
      console.error("Copilot error:", error);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold">Live Tracking</div>
          <div className="text-sm text-gray-500">
            Total: {summary.total} • At-risk: {summary.atRisk}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask AI about shipments..."
            className="w-72 rounded-xl border px-3 py-2 text-sm"
          />
          <button
            onClick={ask}
            disabled={asking}
            className="rounded-xl bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {asking ? "Asking..." : "Ask"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white shadow-sm">
        <div className="p-4 text-sm">
          {loading ? "Loading..." : `Shipments loaded: ${shipments.length}`}
        </div>
      </div>

      {copilot && (
        <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm font-medium">AI Response</div>
          <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
            {String(copilot?.answer ?? copilot?.message ?? "OK")}
          </div>

          {Array.isArray(copilot?.recommendedActions) && copilot.recommendedActions.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-medium">Recommended actions</div>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
                {copilot.recommendedActions.slice(0, 8).map((a: any, i: number) => (
                  <li key={i}>{String(a)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
