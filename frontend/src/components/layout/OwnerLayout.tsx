import { Outlet, useLocation, useNavigate } from "react-router-dom";

function navButtonClass(active: boolean) {
  return active
    ? "rounded-2xl bg-gradient-to-r from-blue-400 to-indigo-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg"
    : "rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10";
}

export default function OwnerLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    try {
      localStorage.removeItem("flowops_owner_token");
      localStorage.removeItem("flowops_owner_profile");
      localStorage.removeItem("flowops_owner_access_token");
      localStorage.removeItem("flowops.owner.accessToken");
      localStorage.removeItem("flowops.owner.user");
      localStorage.removeItem("ownerAccessToken");
      localStorage.removeItem("flowops_login_mode");
    } catch {}

    navigate("/login", { replace: true });
  }

  const onDashboard = location.pathname.startsWith("/owner/dashboard");
  const onTenants = location.pathname.startsWith("/owner/tenants");

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
            </button>

            <button
              type="button"
              onClick={() => navigate("/owner/tenants")}
              className={navButtonClass(onTenants)}
            >
              Tenants
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
