import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { clearSession } from "../../lib/session";
import { api } from "../../api/client";

function navButtonClass(active: boolean) {
  return active
    ? "inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg"
    : "inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10";
}

/** Small badge showing count of unresolved platform alerts. Fades if 0. */
function AlertBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    api.get("/owner/alerts").then((res: any) => {
      const items = (res?.data ?? res);
      setCount(Array.isArray(items) ? items.filter((a: any) => !a.resolved).length : 0);
    }).catch(() => setCount(null));
  }, []);

  if (!count) return null;
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Small badge showing count of pending approval requests. */
function ApprovalBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    api.get("/owner/approval-requests").then((res: any) => {
      const items = res?.data ?? res;
      const arr = Array.isArray(items) ? items : Array.isArray(items?.data) ? items.data : [];
      setCount(arr.filter((r: any) => r.status === "PENDING").length);
    }).catch(() => setCount(null));
  }, []);

  if (!count) return null;
  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-white">
      {count}
    </span>
  );
}

export default function OwnerLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    try {
      // Atomic logout via lib/session.ts — clears the canonical token AND
      // the seven legacy owner-token keys this component used to remove
      // individually (flowops_owner_token, flowops.owner.accessToken, ...).
      clearSession();
    } catch {
      /* ignore */
    }

    navigate("/login", { replace: true });
  }

  const onDashboard = location.pathname.startsWith("/owner/dashboard");
  const onTenants = location.pathname.startsWith("/owner/tenants");
  const onOps = location.pathname.startsWith("/owner/ops");
  const onAudit = location.pathname.startsWith("/owner/audit");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0d2a63_0%,_#07142d_45%,_#030816_100%)] text-white">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between px-5 py-4 md:px-8">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/90">
              Hidden FlowOps Owner Layer
            </div>
            <div className="mt-1 text-3xl font-black tracking-tight">
              Super Owner Console
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/owner/dashboard")}
              className={navButtonClass(onDashboard)}
            >
              Dashboard
              <AlertBadge />
            </button>

            <button
              type="button"
              onClick={() => navigate("/owner/tenants")}
              className={navButtonClass(onTenants)}
            >
              Tenants
              <ApprovalBadge />
            </button>

            <button
              type="button"
              onClick={() => navigate("/owner/ops")}
              className={navButtonClass(onOps)}
            >
              Ops Map
            </button>

            <button
              type="button"
              onClick={() => navigate("/owner/audit")}
              className={navButtonClass(onAudit)}
            >
              Audit
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-200 hover:bg-red-500/15"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1700px] px-5 py-6 md:px-8">
        <Outlet />
      </div>
    </div>
  );
}
