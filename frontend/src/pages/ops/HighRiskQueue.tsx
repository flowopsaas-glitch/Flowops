// src/pages/ops/HighRiskQueue.tsx
import React from "react";

export default function HighRiskQueue() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-extrabold text-white">High Risk Queue</h1>
      <p className="mt-2 text-white/70">
        Shipments flagged by rules/AI for review before dispatch.
      </p>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-white/70">
        Coming next: explainable risk reasons + approve/reject audit trail.
      </div>
    </div>
  );
}
