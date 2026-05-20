import React from "react";

export default function OperationsDashboard() {
  return (
    <div className="p-6">
      <div className="text-xl font-semibold">Operations Dashboard</div>
      <div className="text-sm text-gray-500">Stable build view</div>

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-gray-700">
          ✅ Removed socket hook for installer build stability.
        </div>
      </div>
    </div>
  );
}
