import React, { useEffect, useState } from "react";
import { apiGet } from "../../api/client";

import { isTenantAdminFullAccess, canTenantAdminSeeNavItem, canTenantAdminAccessRoute, isHiddenOwnerPath } from '../../lib/tenantAdminFullAccess';
type AnyRow = Record<string, any>;

export default function AdminCollections() {
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        // If your backend has a different route, adjust here.
        const data = await apiGet<any>("/collections");
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        if (!cancelled) setRows(items);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="p-6">
      <div className="text-xl font-semibold">Admin â€¢ Collections</div>
      <div className="text-sm text-gray-500">Stable build view</div>

      <div className="mt-4 rounded-2xl border bg-white shadow-sm">
        <div className="p-4 text-sm">
          {loading ? "Loading..." : `Loaded: ${rows.length}`}
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">ID</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, idx) => (
                <tr key={r.id ?? idx} className="border-t">
                  <td className="p-3">{String(r.id ?? "-")}</td>
                  <td className="p-3">{String(r.name ?? r.reference ?? "-")}</td>
                  <td className="p-3">{String(r.status ?? "-")}</td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr className="border-t">
                  <td className="p-3 text-gray-500" colSpan={3}>No rows</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

