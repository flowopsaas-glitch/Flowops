import { useState } from 'react';
import { Settings, User, Bell, Shield, Layers, Save } from 'lucide-react';
import SuperAdminLayout from '@/components/supertenant/SuperAdminLayout';

type Tab = 'profile' | 'notifications' | 'security' | 'platform';

export default function SuperAdminSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('platform');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [platform, setPlatform] = useState({ maintenanceMode: false, openSignup: true, analyticsTracking: true });
  const [profile, setProfile] = useState({ name: 'Super Admin', email: 'admin@flowops.work' });
  const [notifications, setNotifications] = useState({ emailAlerts: true, slackIntegration: false, tenantSignupAlert: true, billingAlerts: true, systemHealthAlerts: true });
  const [security, setSecurity] = useState({ twoFactor: false, sessionTimeout: 60, ipWhitelist: '' });

  const handleSave = async () => {
    setSaving(true);
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
    <SuperAdminLayout>
      <div style={{ maxWidth: '900px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(108,158,255,0.15)' }}>
            <Settings size={20} color="#6C9EFF" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'white', margin: 0 }}>Settings</h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>Manage platform and account preferences</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderRadius: '12px', padding: '4px', marginBottom: '24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
                border: activeTab === tab.id ? '1px solid rgba(108,158,255,0.3)' : '1px solid transparent',
                background: activeTab === tab.id ? 'rgba(108,158,255,0.15)' : 'transparent',
                color: activeTab === tab.id ? '#6C9EFF' : 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
              }}>
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ borderRadius: '12px', padding: '24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {activeTab === 'profile' && (
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '20px' }}>Profile Settings</h2>
              <InputField label="Display Name" value={profile.name} onChange={v => setProfile({ ...profile, name: v })} />
              <InputField label="Email" value={profile.email} onChange={v => setProfile({ ...profile, email: v })} type="email" />
            </div>
          )}
          {activeTab === 'notifications' && (
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '20px' }}>Notification Preferences</h2>
              <ToggleRow label="Email Alerts" desc="Receive email notifications for important events" checked={notifications.emailAlerts} onChange={v => setNotifications({ ...notifications, emailAlerts: v })} />
              <ToggleRow label="Slack Integration" desc="Forward alerts to a Slack channel" checked={notifications.slackIntegration} onChange={v => setNotifications({ ...notifications, slackIntegration: v })} />
              <ToggleRow label="Tenant Signup Alert" desc="Notify when a new tenant registers" checked={notifications.tenantSignupAlert} onChange={v => setNotifications({ ...notifications, tenantSignupAlert: v })} />
              <ToggleRow label="Billing Alerts" desc="Notify on overdue or failed payments" checked={notifications.billingAlerts} onChange={v => setNotifications({ ...notifications, billingAlerts: v })} />
              <ToggleRow label="System Health Alerts" desc="Notify when uptime degrades" checked={notifications.systemHealthAlerts} onChange={v => setNotifications({ ...notifications, systemHealthAlerts: v })} />
            </div>
          )}
          {activeTab === 'security' && (
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '20px' }}>Security Settings</h2>
              <ToggleRow label="Two-Factor Authentication" desc="Require 2FA for all admin logins" checked={security.twoFactor} onChange={v => setSecurity({ ...security, twoFactor: v })} />
              <InputField label="Session Timeout (minutes)" value={String(security.sessionTimeout)} onChange={v => setSecurity({ ...security, sessionTimeout: Number(v) })} type="number" />
              <InputField label="IP Whitelist (comma-separated)" value={security.ipWhitelist} onChange={v => setSecurity({ ...security, ipWhitelist: v })} placeholder="e.g. 192.168.1.1, 10.0.0.0/24" />
            </div>
          )}
          {activeTab === 'platform' && (
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '20px' }}>Platform Configuration</h2>
              <ToggleRow label="Maintenance Mode" desc="Temporarily disable tenant access for maintenance" checked={platform.maintenanceMode} onChange={v => setPlatform({ ...platform, maintenanceMode: v })} />
              <ToggleRow label="Open Signup" desc="Allow new tenants to register on the platform" checked={platform.openSignup} onChange={v => setPlatform({ ...platform, openSignup: v })} />
              <ToggleRow label="Analytics Tracking" desc="Collect anonymous usage analytics" checked={platform.analyticsTracking} onChange={v => setPlatform({ ...platform, analyticsTracking: v })} />
            </div>
          )}

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={handleSave} disabled={saving} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
              color: 'white', border: 'none', cursor: 'pointer',
              background: saved ? 'rgba(74,222,128,0.3)' : 'linear-gradient(135deg, #6C9EFF, #A78BFA)',
            }}>
              <Save size={14} /> {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </SuperAdminLayout>
  );
}

function InputField({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: 'rgba(255,255,255,0.5)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', fontSize: '14px', color: 'white', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }} />
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'white' }}>{label}</div>
        <div style={{ fontSize: '12px', marginTop: '2px', color: 'rgba(255,255,255,0.4)' }}>{desc}</div>
      </div>
      <button onClick={() => onChange(!checked)} style={{
        position: 'relative', width: '40px', height: '20px', borderRadius: '9999px', border: 'none', cursor: 'pointer',
        background: checked ? 'rgba(108,158,255,0.6)' : 'rgba(255,255,255,0.15)', transition: 'all 0.2s',
      }}>
        <span style={{
          position: 'absolute', top: '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white',
          left: checked ? '22px' : '2px', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  );
}
