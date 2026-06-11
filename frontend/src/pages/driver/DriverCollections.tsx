import React, { useEffect, useState } from "react";
import { apiGet } from "../../api/client";

type AnyRow = Record<string, any>;

export default function DriverCollections() {
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await apiGet<any>("/collections");
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        if (!cancelled) setRows(items);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-6">
      <div className="text-xl font-semibold">Driver • Collections</div>
      <div className="text-sm text-gray-500">Stable build view</div>

      <div className="mt-4 rounded-2xl border bg-white shadow-sm p-4 text-sm">
        {loading ? "Loading..." : `Loaded: ${rows.length}`}
      </div>
    </div>
  );
}
