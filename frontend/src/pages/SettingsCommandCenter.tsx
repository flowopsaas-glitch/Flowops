import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FLOWOPS_API_URL } from "../lib/env";
import {
  Users,
  ShieldCheck,
  Building2,
  Monitor,
  Mail,
  MessageCircle,
  Brain,
  ReceiptText,
  Sparkles,
  PanelTop,
  Layers3,
  Cpu,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Activity,
  Database,
} from "lucide-react";

type CompanyPayload = {
  id?: number;
  name?: string | null;
  legalName?: string | null;
  tradingName?: string | null;
  subscriptionPlan?: string | null;
  portalBrandName?: string | null;
  portalSubdomain?: string | null;
  portalPrimaryColor?: string | null;
  portalLogoUrl?: string | null;
  logoUrl?: string | null;
  logoFileName?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  invoiceHeaderColor?: string | null;
  whatsappNumber?: string | null;
  supportEmail?: string | null;
  opsEmail?: string | null;
  quotesEmail?: string | null;
  podsEmail?: string | null;
  notificationsEmail?: string | null;
  hardwareDevices?: Array<any> | null;
  permissions?: string[] | Record<string, boolean> | null;
  enabledPermissions?: string[] | Record<string, boolean> | null;
  navPermissions?: string[] | Record<string, boolean> | null;
  modules?: string[] | Record<string, boolean> | null;
};

type StatusMeta = {
  label: string;
  tone: "good" | "warn" | "live";
};

type QuickCard = {
  title: string;
  subtitle: string;
  description: string;
  to: string;
  icon: React.ReactNode;
  accent: string;
  statusResolver: (company: CompanyPayload | null) => StatusMeta;
};

const API_BASE = FLOWOPS_API_URL;

function readToken(): string {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    ""
  );
}

async function readJsonSafe(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function countEnabled(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(Boolean).length;
  }
  return 0;
}

function hasBranding(company: CompanyPayload | null): boolean {
  if (!company) return false;

  return Boolean(
    company.logoUrl ||
      company.logoFileName ||
      company.brandPrimaryColor ||
      company.brandSecondaryColor ||
      company.invoiceHeaderColor ||
      company.portalBrandName ||
      company.portalPrimaryColor ||
      company.portalLogoUrl
  );
}

function hasCommunications(company: CompanyPayload | null): boolean {
  if (!company) return false;

  return Boolean(
    company.whatsappNumber ||
      company.supportEmail ||
      company.opsEmail ||
      company.quotesEmail ||
      company.podsEmail ||
      company.notificationsEmail
  );
}

function getPermissionCount(company: CompanyPayload | null): number {
  return (
    countEnabled(company?.enabledPermissions) ||
    countEnabled(company?.permissions) ||
    countEnabled(company?.navPermissions) ||
    countEnabled(company?.modules) ||
    0
  );
}

const cards: Array<{ section: string; items: QuickCard[] }> = [
  {
    section: "ADMIN & CONTROL",
    items: [
      {
        title: "Users & Passwords",
        subtitle: "Manage tenant accounts and password control.",
        description:
          "Create tenant users, reset passwords, activate or deactivate access, and manage operational user coverage.",
        to: "/admin/users-roles#users",
        icon: <Users size={18} />,
        accent: "rgba(115, 173, 255, 0.26)",
        statusResolver: () => ({ label: "Managed", tone: "good" }),
      },
      {
        title: "Roles & Access",
        subtitle: "Control what users can see and manage.",
        description:
          "Open tenant role controls and permission visibility while preserving your current security structure.",
        to: "/admin/users-roles#roles",
        icon: <ShieldCheck size={18} />,
        accent: "rgba(142, 164, 255, 0.24)",
        statusResolver: (company) => {
          const count = getPermissionCount(company);
          return count > 0
            ? { label: `${count} enabled`, tone: "good" }
            : { label: "Needs Setup", tone: "warn" };
        },
      },
      {
        title: "Branding & Identity",
        subtitle: "Branding, contact details, and portal styling.",
        description:
          "Update your brand name, logo, colours, and portal subdomain. Changes apply across the app and the customer-facing booking portal.",
        to: "/settings/branding",
        icon: <Building2 size={18} />,
        accent: "rgba(82, 196, 255, 0.22)",
        statusResolver: (company) =>
          hasBranding(company)
            ? { label: "Configured", tone: "good" }
            : { label: "Needs Setup", tone: "warn" },
      },
      {
        title: "Hardware & Devices",
        subtitle: "Track scanners, printers, and workstations.",
        description:
          "Open the full tenant company settings page to manage hardware registrations, AI device insights, and branch workstation setup.",
        to: "/settings/company-profile#hardware",
        icon: <Monitor size={18} />,
        accent: "rgba(124, 174, 255, 0.22)",
        statusResolver: (company) => {
          const count = Array.isArray(company?.hardwareDevices)
            ? company!.hardwareDevices!.length
            : 0;
          return count > 0
            ? { label: `${count} devices`, tone: "good" }
            : { label: "Needs Setup", tone: "warn" };
        },
      },
    ],
  },
  {
    section: "COMMUNICATIONS & AI",
    items: [
      {
        title: "Email Hub",
        subtitle: "Manage inbound and outbound operational flows.",
        description:
          "Jump into your tenant email communication workspace without changing the existing email module.",
        to: "/email",
        icon: <Mail size={18} />,
        accent: "rgba(120, 173, 255, 0.23)",
        statusResolver: (company) =>
          hasCommunications(company)
            ? { label: "Connected", tone: "good" }
            : { label: "Active", tone: "live" },
      },
      {
        title: "WhatsApp Hub",
        subtitle: "Control tenant messaging and workflows.",
        description:
          "Open the tenant WhatsApp area for messaging, customer updates, and response handling.",
        to: "/whatsapp",
        icon: <MessageCircle size={18} />,
        accent: "rgba(86, 204, 157, 0.18)",
        statusResolver: (company) =>
          company?.whatsappNumber
            ? { label: "Configured", tone: "good" }
            : { label: "Active", tone: "live" },
      },
      {
        title: "AI Supervision",
        subtitle: "AI-assisted intelligence and support tools.",
        description:
          "Open your AI operations area for billing intelligence, workflow support, and tenant guidance tools.",
        to: "/ai-control-tower",
        icon: <Brain size={18} />,
        accent: "rgba(146, 134, 255, 0.22)",
        statusResolver: () => ({ label: "AI Ready", tone: "live" }),
      },
      {
        title: "Billing & Commercial",
        subtitle: "Contract rules and month-end billing logic.",
        description:
          "Jump into pricing, billing, and commercial controls while preserving existing Q94 and contract-code architecture.",
        to: "/billing-batches",
        icon: <ReceiptText size={18} />,
        accent: "rgba(110, 178, 255, 0.23)",
        statusResolver: (company) => {
          const plan = String(company?.subscriptionPlan || "").trim();
          return plan
            ? { label: `Plan: ${plan}`, tone: "good" }
            : { label: "Live", tone: "live" };
        },
      },
    ],
  },
];

const pageStyle: React.CSSProperties = {
  minHeight: "100%",
  background:
    "radial-gradient(circle at top left, rgba(40,96,190,0.16), transparent 18%), radial-gradient(circle at top right, rgba(72,145,226,0.12), transparent 22%), linear-gradient(180deg, #05101d 0%, #030817 100%)",
  color: "#eaf1ff",
  padding: "22px 24px 46px",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.3em",
  color: "#8daada",
  marginBottom: 8,
};

const titleStyle: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  letterSpacing: "-0.04em",
  lineHeight: 1.05,
  color: "#f4f8ff",
  marginBottom: 18,
};

const heroStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 28,
  border: "1px solid rgba(122, 171, 255, 0.14)",
  background:
    "linear-gradient(135deg, rgba(7,23,45,0.98) 0%, rgba(9,56,92,0.88) 52%, rgba(7,21,40,0.98) 100%)",
  boxShadow:
    "0 28px 90px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -30px 80px rgba(0,0,0,0.12)",
  padding: "26px 26px 24px",
  display: "grid",
  gridTemplateColumns: "1.45fr 0.95fr",
  gap: 18,
  marginBottom: 20,
};

const heroGlowStyle: React.CSSProperties = {
  position: "absolute",
  right: -90,
  top: -70,
  width: 260,
  height: 260,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(101,182,255,0.22) 0%, rgba(101,182,255,0.04) 45%, transparent 72%)",
  pointerEvents: "none",
};

const heroGlowLeftStyle: React.CSSProperties = {
  position: "absolute",
  left: -80,
  bottom: -100,
  width: 260,
  height: 260,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(111,129,255,0.16) 0%, rgba(111,129,255,0.03) 48%, transparent 74%)",
  pointerEvents: "none",
};

const heroBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  borderRadius: 999,
  padding: "7px 12px",
  border: "1px solid rgba(116, 178, 255, 0.18)",
  background: "rgba(8, 22, 44, 0.45)",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.18em",
  color: "#9fd3ff",
  marginBottom: 16,
};

const heroHeadlineStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  lineHeight: 1.14,
  letterSpacing: "-0.03em",
  maxWidth: 610,
  marginBottom: 12,
};

const heroBodyStyle: React.CSSProperties = {
  color: "rgba(232, 241, 255, 0.84)",
  fontSize: 13,
  lineHeight: 1.65,
  maxWidth: 680,
  marginBottom: 18,
};

const heroFooterStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
};

const heroMiniPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  borderRadius: 999,
  padding: "8px 12px",
  background: "rgba(7, 18, 34, 0.48)",
  border: "1px solid rgba(125, 170, 255, 0.12)",
  fontSize: 11,
  color: "#dfe9fb",
};

const statGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
  alignSelf: "stretch",
};

const statCardStyle: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(129, 176, 255, 0.14)",
  background:
    "linear-gradient(180deg, rgba(6,15,29,0.56) 0%, rgba(10,24,43,0.58) 100%)",
  minHeight: 94,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.22em",
  fontWeight: 800,
  color: "#9bb6e7",
};

const statValueStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: "-0.03em",
  color: "#f4f8ff",
};

const sectionWrapStyle: React.CSSProperties = {
  marginTop: 18,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.24em",
  fontWeight: 900,
  color: "#8faedc",
  marginBottom: 10,
};

const gridFourStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
};

const cardBaseStyle: React.CSSProperties = {
  position: "relative",
  display: "block",
  overflow: "hidden",
  textDecoration: "none",
  color: "#eef4ff",
  borderRadius: 20,
  border: "1px solid rgba(126, 171, 255, 0.14)",
  background:
    "linear-gradient(180deg, rgba(53,77,118,0.62) 0%, rgba(36,54,89,0.76) 100%)",
  boxShadow: "0 20px 55px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)",
  padding: "16px 16px 15px",
  minHeight: 158,
  transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
};

const iconWrapStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 13,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(16, 34, 64, 0.72)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#dce7ff",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

function StatusPill({ label, tone }: StatusMeta) {
  const palette =
    tone === "good"
      ? {
          bg: "rgba(34, 197, 94, 0.12)",
          border: "rgba(34, 197, 94, 0.24)",
          color: "#a7f3d0",
          icon: <CheckCircle2 size={12} />,
        }
      : tone === "warn"
      ? {
          bg: "rgba(245, 158, 11, 0.12)",
          border: "rgba(245, 158, 11, 0.24)",
          color: "#fde68a",
          icon: <AlertCircle size={12} />,
        }
      : {
          bg: "rgba(59, 130, 246, 0.12)",
          border: "rgba(59, 130, 246, 0.24)",
          color: "#bfdbfe",
          icon: <Activity size={12} />,
        };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        padding: "6px 10px",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.08em",
      }}
    >
      {palette.icon}
      {label}
    </div>
  );
}

function QuickCard({ item, company }: { item: QuickCard; company: CompanyPayload | null }) {
  const status = item.statusResolver(company);

  return (
    <Link
      to={item.to}
      style={cardBaseStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 26px 70px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)";
        e.currentTarget.style.borderColor = "rgba(167, 199, 255, 0.24)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 20px 55px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)";
        e.currentTarget.style.borderColor = "rgba(126, 171, 255, 0.14)";
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at top right, ${item.accent} 0%, transparent 36%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={iconWrapStyle}>{item.icon}</div>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(9, 19, 36, 0.34)",
              color: "#e6efff",
            }}
          >
            <ChevronRight size={15} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <StatusPill {...status} />
        </div>

        <div
          style={{
            marginTop: 14,
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "#f3f7ff",
          }}
        >
          {item.title}
        </div>

        <div style={{ marginTop: 6, fontSize: 12, color: "#edf4ff" }}>{item.subtitle}</div>

        <div
          style={{
            marginTop: 11,
            fontSize: 11,
            lineHeight: 1.55,
            color: "rgba(230,240,255,0.82)",
            maxWidth: 420,
          }}
        >
          {item.description}
        </div>
      </div>
    </Link>
  );
}

export default function SettingsCommandCenter() {
  const [company, setCompany] = useState<CompanyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadCompany() {
      setLoading(true);
      setLoadError("");

      try {
        const token = readToken();
        const response = await fetch(`${API_BASE}/companies/my-company`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        const data = await readJsonSafe(response);

        if (!response.ok) {
          throw new Error(data?.message || "Unable to load tenant company.");
        }

        if (!mounted) return;
        setCompany(data || {});
      } catch (error: any) {
        if (!mounted) return;
        setLoadError(error?.message || "Unable to load tenant company.");
        setCompany(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCompany();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const tenantName =
      company?.tradingName ||
      company?.name ||
      company?.legalName ||
      "—";

    const portalBrand =
      company?.portalBrandName ||
      company?.portalSubdomain ||
      "—";

    const registeredDevices = Array.isArray(company?.hardwareDevices)
      ? String(company!.hardwareDevices!.length)
      : "0";

    const enabledModules = String(getPermissionCount(company));

    return {
      tenantName,
      portalBrand,
      registeredDevices,
      enabledModules,
    };
  }, [company]);

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div style={eyebrowStyle}>TENANT WORKSPACE</div>
        <div style={titleStyle}>Settings</div>

        <section style={heroStyle}>
          <div style={heroGlowStyle} />
          <div style={heroGlowLeftStyle} />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={heroBadgeStyle}>
              <Sparkles size={12} />
              SETTINGS COMMAND CENTER
            </div>

            <div style={heroHeadlineStyle}>
              World-class tenant branding, billing, portal, and hardware control.
            </div>

            <div style={heroBodyStyle}>
              Easy-access launchpad for tenant company management. Nothing is removed. Your existing settings,
              communication, hardware, billing, and user controls stay intact underneath this faster premium
              command-center layer.
            </div>

            <div style={heroFooterStyle}>
              <div style={heroMiniPillStyle}>
                <PanelTop size={14} />
                Faster admin navigation
              </div>
              <div style={heroMiniPillStyle}>
                <Layers3 size={14} />
                Non-destructive upgrade
              </div>
              <div style={heroMiniPillStyle}>
                <Cpu size={14} />
                AI-powered ops ready
              </div>
              <div style={heroMiniPillStyle}>
                <Database size={14} />
                Live backend linked
              </div>
            </div>

            {loadError ? (
              <div
                style={{
                  marginTop: 16,
                  borderRadius: 14,
                  border: "1px solid rgba(255, 99, 132, 0.18)",
                  background: "rgba(120, 16, 40, 0.16)",
                  color: "#ffd7e1",
                  padding: "12px 14px",
                  fontSize: 12,
                }}
              >
                {loadError}
              </div>
            ) : null}
          </div>

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={statGridStyle}>
              <div style={statCardStyle}>
                <div style={statLabelStyle}>TENANT NAME</div>
                <div style={statValueStyle}>{loading ? "..." : stats.tenantName}</div>
              </div>

              <div style={statCardStyle}>
                <div style={statLabelStyle}>PORTAL BRAND</div>
                <div style={statValueStyle}>{loading ? "..." : stats.portalBrand}</div>
              </div>

              <div style={statCardStyle}>
                <div style={statLabelStyle}>REGISTERED DEVICES</div>
                <div style={statValueStyle}>{loading ? "..." : stats.registeredDevices}</div>
              </div>

              <div style={statCardStyle}>
                <div style={statLabelStyle}>ENABLED MODULES</div>
                <div style={statValueStyle}>{loading ? "..." : stats.enabledModules}</div>
              </div>
            </div>
          </div>
        </section>

        {cards.map((group) => (
          <section key={group.section} style={sectionWrapStyle}>
            <div style={sectionTitleStyle}>{group.section}</div>
            <div style={gridFourStyle}>
              {group.items.map((item) => (
                <QuickCard key={item.title} item={item} company={company} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
