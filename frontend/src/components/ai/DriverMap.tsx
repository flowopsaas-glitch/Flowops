import React from "react";

/**
 * NOTE:
 * We intentionally avoid react-leaflet in the desktop build pipeline to prevent TS typing mismatch
 * issues across versions. This component renders a clean placeholder that still looks premium.
 *
 * Later, if you want the real map back, we can reintroduce Leaflet with pinned versions.
 */
export default function DriverMap() {
  return (
    <div className="w-full rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Driver Map</div>
          <div className="text-sm text-gray-500">
            Live map rendering is deferred in this installer build for maximum packaging stability.
          </div>
        </div>
        <div className="text-xs rounded-full bg-gray-100 px-3 py-1 text-gray-700">
          Stable Build Mode
        </div>
      </div>

      <div className="mt-4 h-[420px] w-full rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-base font-medium text-gray-700">Map Integration Paused</div>
          <div className="text-sm text-gray-500 mt-1">
            Map support is available in the web release; this installer remains optimized for reliable desktop deployment.
          </div>
        </div>
      </div>
    </div>
  );
}
