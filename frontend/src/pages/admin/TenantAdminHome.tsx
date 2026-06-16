import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

function ActionCard(props: { title: string; desc: string; to: string }) {
  return (
    <Link
      to={props.to}
      className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 transition hover:border-sky-400/40 hover:bg-white/[0.06]"
    >
      <div className="text-lg font-black text-white">{props.title}</div>
      <div className="mt-2 text-sm leading-6 text-white/70">{props.desc}</div>
      <div className="mt-4 text-xs font-bold uppercase tracking-[0.24em] text-sky-200/80">
        Open
      </div>
    </Link>
  );
}

export default function TenantAdminHome() {
  const { user, isAuthenticated, booting } = useAuth();

  if (booting) {
    return (
      <div className="min-h-screen bg-[#031633] text-white flex items-center justify-center">
        Loading tenant admin workspace...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const role = String(user?.role || "").toUpperCase();
  const allowed = ["TENANT_ADMIN", "COMPANY_ADMIN", "ADMIN"].includes(role);

  if (!allowed) {
    return (
      <div className="min-h-screen bg-[#031633] text-white px-6 py-10">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-white/10 bg-white/[0.04] p-8">
          <div className="text-[11px] uppercase tracking-[0.35em] text-sky-200/80">
            FlowOps Workspace
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            Tenant Admin Access Required
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70">
            This page is reserved for tenant manager accounts.
            Your current role is:
            <span className="ml-2 font-bold text-white">{role || "UNKNOWN"}</span>
          </p>

          <div className="mt-8">
            <Link
              to="/dashboard"
              className="inline-flex rounded-2xl bg-gradient-to-r from-sky-400 to-blue-500 px-5 py-3 text-sm font-extrabold text-slate-950"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#031633] text-white px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-[11px] uppercase tracking-[0.35em] text-sky-200/80">
            FlowOps Workspace
          </div>

          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                Tenant Admin Command Page
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">
                Open communications, collections, dispatch, notifications,
                billing, and tenant settings from one manager workspace.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white/70">
              <div className="font-semibold text-white">{user?.email || "Tenant Admin"}</div>
              <div className="mt-1">Role: {role}</div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <ActionCard
              title="Collections"
              desc="Book, assign, approve, and manage operational collection work."
              to="/collections"
            />
            <ActionCard
              title="WhatsApp"
              desc="Open the tenant WhatsApp communications workspace."
              to="/communications/whatsapp"
            />
            <ActionCard
              title="Email"
              desc="Open the shared email operations workspace."
              to="/communications/email"
            />
            <ActionCard
              title="Notifications"
              desc="Review workflow alerts and tenant activity signals."
              to="/notifications"
            />
            <ActionCard
              title="Driver Dispatch"
              desc="Create and assign dispatch jobs across your tenant fleet."
              to="/driver-dispatch"
            />
            <ActionCard
              title="Tenant Settings"
              desc="Manage branding, inboxes, permissions, and hardware settings."
              to="/settings"
            />
          </div>

          <div className="mt-8 rounded-[24px] border border-white/10 bg-slate-950/35 p-5 text-sm text-white/65">
            This page does not replace your dashboard.
            It gives tenant managers a direct admin landing page.
          </div>
        </div>
      </div>
    </div>
  );
}
