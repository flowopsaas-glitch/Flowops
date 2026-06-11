import { useState, useEffect } from 'react';
import { Settings, User, Bell, Shield, Layers, Save } from 'lucide-react';
import Sidebar from '@/components/supertenant/Sidebar';
import TopBar from '@/components/supertenant/TopBar';

type Tab = 'profile' | 'notifications' | 'security' | 'platform';

export default function SuperAdminSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('platform');
  const [user, setUser] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Platform settings state
  const [platform, setPlatform] = useState({
    maintenanceMode: false,
    openSignup: true,
    analyticsTracking: true,
  });

  // Profile state
  const [profile, setProfile] = useState({
    name: '',
    email: '',
  });

  // Notification settings state
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    slackIntegration: false,
    tenantSignupAlert: true,
    billingAlerts: true,
    systemHealthAlerts: true,
  });

  // Security settings state
  const [security, setSecurity] = useState({
    twoFactor: false,
    sessionTimeout: 60,
    ipWhitelist: '',
  });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          setProfile({ name: data.name || '', email: data.email || '' });
        }
      } catch (e) {
        console.warn('Failed to fetch user:', e);
      }
    };
    fetchUser();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    // Simulate save (these would be real API calls in production)
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { id: 'profile' as Tab, label: 'Profile', icon: User },
    { id: 'notifications' as Tab, label: 'Notifications', icon: Bell },
    { id: 'security' as Tab, label: 'Security', icon: Shield },
    { id: 'platform' as Tab, label: 'Platform', icon: Layers },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0a0f1e' }}>
      <Sidebar />
      <TopBar user={user} />

      <main style={{ paddingLeft: '175px', paddingTop: '56px' }}>
        <div className="p-6 max-w-[900px]">
          {/* Page header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(108,158,255,0.15)' }}>
              <Settings size={20} style={{ color: '#6C9EFF' }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Settings</h1>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Manage platform and account preferences</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex rounded-xl p-1 mb-6"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: activeTab === tab.id ? 'rgba(108,158,255,0.15)' : 'transparent',
                  color: activeTab === tab.id ? '#6C9EFF' : 'rgba(255,255,255,0.5)',
                  border: activeTab === tab.id ? '1px solid rgba(108,158,255,0.3)' : '1px solid transparent',
                }}>
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="rounded-xl p-6"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>

            {/* ── Profile Tab ── */}
            {activeTab === 'profile' && (
              <div className="space-y-5">
                <h2 className="text-base font-bold text-white">Profile Settings</h2>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Display Name</label>
                  <input type="text" value={profile.name}
                    onChange={e => setProfile({ ...profile, name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none focus:ring-1 focus:ring-[#6C9EFF]"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Email</label>
                  <input type="email" value={profile.email}
                    onChange={e => setProfile({ ...profile, email: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none focus:ring-1 focus:ring-[#6C9EFF]"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
              </div>
            )}

            {/* ── Notifications Tab ── */}
            {activeTab === 'notifications' && (
              <div className="space-y-5">
                <h2 className="text-base font-bold text-white">Notification Preferences</h2>
                <ToggleRow label="Email Alerts" desc="Receive email notifications for important events"
                  checked={notifications.emailAlerts}
                  onChange={v => setNotifications({ ...notifications, emailAlerts: v })} />
                <ToggleRow label="Slack Integration" desc="Forward alerts to a Slack channel"
                  checked={notifications.slackIntegration}
                  onChange={v => setNotifications({ ...notifications, slackIntegration: v })} />
                <ToggleRow label="Tenant Signup Alert" desc="Notify when a new tenant registers"
                  checked={notifications.tenantSignupAlert}
                  onChange={v => setNotifications({ ...notifications, tenantSignupAlert: v })} />
                <ToggleRow label="Billing Alerts" desc="Notify on overdue or failed payments"
                  checked={notifications.billingAlerts}
                  onChange={v => setNotifications({ ...notifications, billingAlerts: v })} />
                <ToggleRow label="System Health Alerts" desc="Notify when uptime or response time degrades"
                  checked={notifications.systemHealthAlerts}
                  onChange={v => setNotifications({ ...notifications, systemHealthAlerts: v })} />
              </div>
            )}

            {/* ── Security Tab ── */}
            {activeTab === 'security' && (
              <div className="space-y-5">
                <h2 className="text-base font-bold text-white">Security Settings</h2>
                <ToggleRow label="Two-Factor Authentication" desc="Require 2FA for all admin logins"
                  checked={security.twoFactor}
                  onChange={v => setSecurity({ ...security, twoFactor: v })} />
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Session Timeout (minutes)
                  </label>
                  <input type="number" value={security.sessionTimeout}
                    onChange={e => setSecurity({ ...security, sessionTimeout: Number(e.target.value) })}
                    className="w-32 px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    IP Whitelist (comma-separated)
                  </label>
                  <input type="text" value={security.ipWhitelist}
                    onChange={e => setSecurity({ ...security, ipWhitelist: e.target.value })}
                    placeholder="e.g. 192.168.1.1, 10.0.0.0/24"
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none placeholder:text-white/20"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
              </div>
            )}

            {/* ── Platform Tab ── */}
            {activeTab === 'platform' && (
              <div className="space-y-5">
                <h2 className="text-base font-bold text-white">Platform Configuration</h2>
                <ToggleRow label="Maintenance Mode" desc="Temporarily disable tenant access for maintenance"
                  checked={platform.maintenanceMode}
                  onChange={v => setPlatform({ ...platform, maintenanceMode: v })} />
                <ToggleRow label="Open Signup" desc="Allow new tenants to register on the platform"
                  checked={platform.openSignup}
                  onChange={v => setPlatform({ ...platform, openSignup: v })} />
                <ToggleRow label="Analytics Tracking" desc="Collect anonymous usage analytics"
                  checked={platform.analyticsTracking}
                  onChange={v => setPlatform({ ...platform, analyticsTracking: v })} />
              </div>
            )}

            {/* Save button */}
            <div className="flex justify-end mt-8 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all"
                style={{ background: saved ? 'rgba(74,222,128,0.3)' : 'linear-gradient(135deg, #6C9EFF, #A78BFA)' }}>
                <Save size={14} />
                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Toggle Row Component ──
function ToggleRow({ label, desc, checked, onChange }: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5 rounded-full transition-all duration-200"
        style={{ background: checked ? 'rgba(108,158,255,0.6)' : 'rgba(255,255,255,0.15)' }}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
          style={{ left: checked ? '22px' : '2px' }} />
      </button>
    </div>
  );
}
