import React, { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Plus,
  RefreshCw,
  Crown,
  Mail,
  MessageCircle,
  Search,
  CheckCircle2,
} from "lucide-react";
import {
  CompanyRecord,
  createCompany,
  createCompanyAdmin,
  getCompanies,
} from "../../api/companiesApi";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object" &&
    (error as { response?: { data?: unknown } }).response?.data
  ) {
    const data = (error as { response?: { data?: unknown } }).response?.data as
      | { message?: string | string[]; error?: string }
      | string;

    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      if (Array.isArray(data.message) && data.message.length > 0) {
        return data.message.join(", ");
      }
      if (typeof data.message === "string" && data.message.trim()) {
        return data.message;
      }
      if (typeof data.error === "string" && data.error.trim()) {
        return data.error;
      }
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong.";
}

export default function CompaniesManager() {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState("PRO");
  const [opsEmail, setOpsEmail] = useState("");
  const [quotesEmail, setQuotesEmail] = useState("");
  const [podsEmail, setPodsEmail] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [notificationsEmail, setNotificationsEmail] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");

  const [selectedCompanyId, setSelectedCompanyId] = useState<number | "">("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  async function loadCompanies() {
    setLoading(true);
    setPageError("");

    try {
      const rows = await getCompanies();
      setCompanies(rows);
      setSelectedCompanyId((current) => {
        if (typeof current === "number" && rows.some((r) => r.id === current)) {
          return current;
        }
        return rows[0]?.id ?? "";
      });
    } catch (error) {
      setCompanies([]);
      setPageError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  async function handleCreateCompany() {
    if (!name.trim()) return;

    setCreatingCompany(true);
    setPageError("");

    try {
      await createCompany({
        name: name.trim(),
        subscriptionPlan,
        enabledFeatures: [
          "collections",
          "quotes",
          "email_hub",
          "notifications",
          "clients",
          "invoices",
        ],
        supportEmail: supportEmail.trim() || undefined,
        opsEmail: opsEmail.trim() || undefined,
        quotesEmail: quotesEmail.trim() || undefined,
        podsEmail: podsEmail.trim() || undefined,
        notificationsEmail: notificationsEmail.trim() || undefined,
        whatsappNumber: whatsappNumber.trim() || undefined,
        onboardingComplete: false,
        onboardingStep: "general",
        isActive: true,
      });

      setName("");
      setOpsEmail("");
      setQuotesEmail("");
      setPodsEmail("");
      setSupportEmail("");
      setNotificationsEmail("");
      setWhatsappNumber("");
      setSubscriptionPlan("PRO");

      await loadCompanies();
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setCreatingCompany(false);
    }
  }

  async function handleCreateAdmin() {
    if (!selectedCompanyId || !adminEmail.trim() || !adminPassword.trim()) return;

    setCreatingAdmin(true);
    setPageError("");

    try {
      await createCompanyAdmin(Number(selectedCompanyId), {
        email: adminEmail.trim(),
        password: adminPassword.trim(),
        role: "COMPANY_ADMIN",
      });

      setAdminEmail("");
      setAdminPassword("");
      await loadCompanies();
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setCreatingAdmin(false);
    }
  }

  const visibleCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;

    return companies.filter((company) => {
      const allText = [
        company.name,
        company.subscriptionPlan,
        company.opsEmail,
        company.quotesEmail,
        company.supportEmail,
        company.notificationsEmail,
        company.whatsappNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return allText.includes(q);
    });
  }, [companies, search]);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.12),transparent_30%),linear-gradient(180deg,#07111f_0%,#0b1530_55%,#0e1b3f_100%)] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-[30px] border border-white/10 bg-white/6 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
                <Building2 className="h-3.5 w-3.5" />
                Platform tenant management
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                Companies Manager
              </h1>

              <p className="mt-2 max-w-4xl text-sm text-white/72">
                Create and manage courier tenants like Budget Couriers and GoGet Couriers,
                assign subscription plans, set communication channels, and create company admins.
              </p>
            </div>

            <button
              type="button"
              onClick={loadCompanies}
              disabled={loading}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ring-1 ring-white/15 transition",
                loading
                  ? "cursor-not-allowed bg-white/10 text-white/55"
                  : "bg-white/10 text-white hover:bg-white/15"
              )}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {pageError ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {pageError}
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
            <div className="flex items-center gap-2 text-lg font-extrabold text-white">
              <Plus className="h-5 w-5" />
              Create Company
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Input label="Company Name" value={name} onChange={setName} placeholder="Budget Couriers" />
              <Select
                label="Subscription Plan"
                value={subscriptionPlan}
                onChange={setSubscriptionPlan}
                options={["STARTER", "GROWTH", "PRO", "ENTERPRISE"]}
              />
              <Input label="Ops Email" value={opsEmail} onChange={setOpsEmail} placeholder="ops@company.com" />
              <Input label="Quotes Email" value={quotesEmail} onChange={setQuotesEmail} placeholder="quotes@company.com" />
              <Input label="POD Email" value={podsEmail} onChange={setPodsEmail} placeholder="pods@company.com" />
              <Input label="Support Email" value={supportEmail} onChange={setSupportEmail} placeholder="support@company.com" />
              <Input
                label="Notifications Email"
                value={notificationsEmail}
                onChange={setNotificationsEmail}
                placeholder="alerts@company.com"
              />
              <Input
                label="WhatsApp Number"
                value={whatsappNumber}
                onChange={setWhatsappNumber}
                placeholder="+27..."
              />
            </div>

            <button
              type="button"
              onClick={handleCreateCompany}
              disabled={creatingCompany || !name.trim()}
              className={cn(
                "mt-4 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold ring-1 ring-white/15 transition",
                creatingCompany || !name.trim()
                  ? "cursor-not-allowed bg-white/10 text-white/55"
                  : "bg-blue-500/80 text-white hover:bg-blue-500"
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              {creatingCompany ? "Creating..." : "Create Company"}
            </button>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
            <div className="flex items-center gap-2 text-lg font-extrabold text-white">
              <Crown className="h-5 w-5" />
              Create Company Admin
            </div>

            <div className="mt-4 grid gap-3">
              <Select
                label="Company"
                value={String(selectedCompanyId)}
                onChange={(value) => setSelectedCompanyId(value ? Number(value) : "")}
                options={companies.map((c) => ({ label: c.name, value: String(c.id) }))}
              />
              <Input
                label="Admin Email"
                value={adminEmail}
                onChange={setAdminEmail}
                placeholder="admin@budgetcouriers.co.za"
              />
              <Input
                label="Admin Password"
                value={adminPassword}
                onChange={setAdminPassword}
                placeholder="Create secure password"
                type="password"
              />
            </div>

            <button
              type="button"
              onClick={handleCreateAdmin}
              disabled={creatingAdmin || !selectedCompanyId || !adminEmail.trim() || !adminPassword.trim()}
              className={cn(
                "mt-4 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold ring-1 ring-white/15 transition",
                creatingAdmin || !selectedCompanyId || !adminEmail.trim() || !adminPassword.trim()
                  ? "cursor-not-allowed bg-white/10 text-white/55"
                  : "bg-fuchsia-500/80 text-white hover:bg-fuchsia-500"
              )}
            >
              <Crown className="h-4 w-4" />
              {creatingAdmin ? "Creating..." : "Create Company Admin"}
            </button>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-2xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-extrabold text-white">Tenant Companies</div>
              <div className="mt-1 text-sm text-white/70">
                Search and review communication channels, plans, and company admins.
              </div>
            </div>

            <div className="relative w-full md:w-[340px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies..."
                className="w-full rounded-2xl border border-white/10 bg-white/8 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/45 outline-none"
              />
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {visibleCompanies.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-white/65">
                No companies found.
              </div>
            ) : (
              visibleCompanies.map((company) => (
                <div
                  key={company.id}
                  className="rounded-[22px] border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-extrabold text-white">{company.name}</div>
                        <span className="rounded-full border border-blue-400/20 bg-blue-500/15 px-2.5 py-1 text-[10px] font-extrabold text-blue-200">
                          {company.subscriptionPlan || "STARTER"}
                        </span>
                        {company.isActive ? (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-extrabold text-emerald-200">
                            ACTIVE
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-white/72 md:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-white/55" />
                          Ops: {company.opsEmail || "—"}
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-white/55" />
                          Quotes: {company.quotesEmail || "—"}
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-white/55" />
                          PODs: {company.podsEmail || "—"}
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-white/55" />
                          WhatsApp: {company.whatsappNumber || "—"}
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-white/50">
                        Features: {company.enabledFeatures?.length ? company.enabledFeatures.join(", ") : "None set"}
                      </div>
                    </div>

                    <div className="min-w-[260px] rounded-2xl border border-white/10 bg-white/6 p-3">
                      <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">
                        Company Admins
                      </div>
                      <div className="mt-3 space-y-2">
                        {company.users?.filter((u) => u.role === "ADMIN" || u.role === "COMPANY_ADMIN").length ? (
                          company.users
                            ?.filter((u) => u.role === "ADMIN" || u.role === "COMPANY_ADMIN")
                            .map((user) => (
                              <div
                                key={user.id}
                                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80"
                              >
                                {user.email} · {user.role}
                              </div>
                            ))
                        ) : (
                          <div className="text-sm text-white/55">No company admins yet</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">
        {props.label}
      </div>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white placeholder:text-white/45 outline-none"
      />
    </div>
  );
}

function Select(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string> | Array<{ label: string; value: string }>;
}) {
  const normalized = props.options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option
  );

  return (
    <div>
      <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">
        {props.label}
      </div>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white outline-none"
      >
        <option value="">Select...</option>
        {normalized.map((option) => (
          <option key={option.value} value={option.value} className="bg-slate-900 text-white">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
