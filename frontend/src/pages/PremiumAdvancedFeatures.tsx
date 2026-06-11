import React, { useState } from 'react';
import { Zap, FileText, Cpu, Database, Webhook, Settings, Download, CheckCircle2, Clock } from 'lucide-react';
import { api } from '../api/client';

export default function PremiumAdvancedFeatures() {
  const [activeTab, setActiveTab] = useState<'automation' | 'export' | 'webhooks' | 'settings'>('automation');
  const [automationBusy, setAutomationBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleIntelligentRouting = async () => {
    try {
      setAutomationBusy(true);
      const res = await api.post('/automation/intelligent-routing', {});
      setResults({ type: 'routing', data: res.data });
    } catch (err) {
      console.error('Failed to run intelligent routing:', err);
    } finally {
      setAutomationBusy(false);
    }
  };

  const handleAutoBatching = async () => {
    try {
      setAutomationBusy(true);
      const res = await api.post('/automation/auto-batching', {});
      setResults({ type: 'batching', data: res.data });
    } catch (err) {
      console.error('Failed to run auto-batching:', err);
    } finally {
      setAutomationBusy(false);
    }
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      setExportBusy(true);
      const endpoint = `/export/waybills-${format}`;
      const response = await api.get(endpoint, { responseType: 'blob' });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waybills.${format === 'excel' ? 'xlsx' : format}`;
      a.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-950 p-8 text-white">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-black tracking-tighter mb-2 flex items-center gap-3">
          <Zap className="text-amber-400" size={32} /> PREMIUM ADVANCED FEATURES
        </h1>
        <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Automation · Export · Webhooks · Advanced Settings</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-3 mb-8 border-b border-white/10 overflow-x-auto">
        {(['automation', 'export', 'webhooks', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-4 px-6 font-black text-sm uppercase tracking-wider border-b-2 transition-all ${
              activeTab === tab
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            {tab === 'automation' && <Cpu className="inline mr-2" size={16} />}
            {tab === 'export' && <Download className="inline mr-2" size={16} />}
            {tab === 'webhooks' && <Webhook className="inline mr-2" size={16} />}
            {tab === 'settings' && <Settings className="inline mr-2" size={16} />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* AUTOMATION TAB */}
      {activeTab === 'automation' && (
        <div className="space-y-6">
          <FeatureCard
            title="🤖 Intelligent Routing Engine"
            description="AI-powered driver assignment based on location, capacity, and performance"
            features={[
              'Real-time driver load balancing',
              'Performance-based scoring',
              'Geographic proximity matching',
              'Automatic failover assignment',
            ]}
            action={() => handleIntelligentRouting()}
            busy={automationBusy}
            buttonText="Run Routing Analysis"
          />

          <FeatureCard
            title="📦 Auto-Batching Engine"
            description="Automatically group waybills into optimal delivery batches"
            features={[
              'Weight-based optimization',
              'Route efficiency analysis',
              'Dynamic batch sizing',
              'Cost minimization',
            ]}
            action={() => handleAutoBatching()}
            busy={automationBusy}
            buttonText="Execute Auto-Batching"
          />

          <FeatureCard
            title="💰 Auto-Invoicing Workflow"
            description="Automatically generate and send invoices on delivery"
            features={[
              'Scheduled invoice generation',
              'Batch processing',
              'Email delivery',
              'Payment reminders',
            ]}
            status="Scheduled Daily @ 10AM"
          />

          <FeatureCard
            title="🔄 Collection Followup"
            description="Automated payment collection reminders"
            features={[
              'Smart timing',
              'Multi-channel delivery',
              'Collection tracking',
              'Reporting',
            ]}
            status="Scheduled Weekly"
          />
        </div>
      )}

      {/* EXPORT TAB */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ExportCard
              format="CSV"
              description="Comma-separated values for spreadsheet applications"
              icon="📄"
              onClick={() => handleExport('csv')}
              busy={exportBusy}
            />
            <ExportCard
              format="Excel"
              description="Advanced Excel workbook with formatting and charts"
              icon="📊"
              onClick={() => handleExport('excel')}
              busy={exportBusy}
            />
            <ExportCard
              format="PDF"
              description="Professional PDF report with branding"
              icon="📑"
              onClick={() => handleExport('pdf')}
              busy={exportBusy}
            />
          </div>

          <div className="bg-slate-800/50 border border-white/10 rounded-[24px] p-6">
            <h3 className="text-lg font-black mb-4">Export History</h3>
            <div className="space-y-2 text-sm text-slate-400">
              <p>✓ Last Excel export: 2 hours ago (245 records)</p>
              <p>✓ Last PDF report: 1 day ago (analytical summary)</p>
              <p>✓ Last CSV export: 3 days ago (bulk data)</p>
            </div>
          </div>
        </div>
      )}

      {/* WEBHOOKS TAB */}
      {activeTab === 'webhooks' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 border border-white/10 rounded-[24px] p-6">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2">
              <Webhook size={20} /> Webhook Configuration
            </h3>
            <p className="text-slate-400 mb-4">Configure custom webhooks to receive real-time events</p>

            <div className="space-y-4">
              <WebhookEndpoint
                event="waybill.created"
                url="https://your-api.example.com/webhook/waybill-created"
                active={true}
              />
              <WebhookEndpoint
                event="waybill.delivered"
                url="https://your-api.example.com/webhook/waybill-delivered"
                active={true}
              />
              <WebhookEndpoint
                event="invoice.generated"
                url="https://your-api.example.com/webhook/invoice-generated"
                active={false}
              />
            </div>
          </div>

          <button className="w-full px-6 py-4 bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/50 text-amber-300 font-black rounded-[20px] hover:from-amber-500/30 hover:to-amber-600/30 transition-all">
            + Add New Webhook
          </button>
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <SettingItem
            title="Automation Settings"
            description="Configure automated workflows"
            toggles={[
              { label: 'Auto-routing enabled', value: true },
              { label: 'Auto-invoicing enabled', value: true },
              { label: 'Predictive analytics', value: true },
            ]}
          />

          <SettingItem
            title="Export Settings"
            description="Configure export preferences"
            toggles={[
              { label: 'Include archived items', value: false },
              { label: 'Auto-compress files', value: true },
              { label: 'Email exports on completion', value: true },
            ]}
          />

          <SettingItem
            title="Notification Settings"
            description="Configure alerts and notifications"
            toggles={[
              { label: 'Email notifications', value: true },
              { label: 'SMS alerts', value: false },
              { label: 'WhatsApp notifications', value: true },
            ]}
          />
        </div>
      )}

      {/* Results Panel */}
      {results && (
        <div className="fixed bottom-8 right-8 bg-slate-900 border border-emerald-500/50 rounded-[20px] p-6 max-w-md">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle2 className="text-emerald-400" size={20} />
            <h4 className="font-black">Operation Complete</h4>
          </div>
          <pre className="text-xs text-slate-300 bg-slate-950 p-3 rounded overflow-auto max-h-40">
            {JSON.stringify(results.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function FeatureCard({ title, description, features, action, busy, buttonText, status }: any) {
  return (
    <div className="bg-slate-800/50 border border-white/10 rounded-[24px] p-6 hover:border-amber-500/30 transition-all">
      <h3 className="text-lg font-black mb-2">{title}</h3>
      <p className="text-slate-400 mb-4">{description}</p>
      <ul className="space-y-2 mb-6 text-sm">
        {features.map((f: string, i: number) => (
          <li key={i} className="flex items-center gap-2 text-slate-300">
            <CheckCircle2 size={14} className="text-emerald-400" />
            {f}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        {status && <span className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12} /> {status}</span>}
        {action && (
          <button
            onClick={action}
            disabled={busy}
            className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 text-amber-300 rounded-lg font-black text-xs hover:bg-amber-500/30 disabled:opacity-50 transition-all"
          >
            {busy ? 'Processing...' : buttonText}
          </button>
        )}
      </div>
    </div>
  );
}

function ExportCard({ format, description, icon, onClick, busy }: any) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="bg-slate-800/50 border border-white/10 rounded-[24px] p-8 hover:border-amber-500/50 transition-all text-center"
    >
      <div className="text-4xl mb-4">{icon}</div>
      <h4 className="text-lg font-black mb-2">{format}</h4>
      <p className="text-sm text-slate-400 mb-4">{description}</p>
      <span className="inline-flex px-3 py-1 bg-amber-500/20 text-amber-300 text-xs font-black rounded-full">
        {busy ? 'Exporting...' : 'Export Now'}
      </span>
    </button>
  );
}

function WebhookEndpoint({ event, url, active }: any) {
  return (
    <div className="bg-slate-700/50 rounded-lg p-4 flex items-center justify-between">
      <div>
        <p className="font-bold text-sm">{event}</p>
        <p className="text-xs text-slate-400">{url}</p>
      </div>
      <div className={`w-3 h-3 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-500'}`} />
    </div>
  );
}

function SettingItem({ title, description, toggles }: any) {
  return (
    <div className="bg-slate-800/50 border border-white/10 rounded-[24px] p-6">
      <h3 className="text-lg font-black mb-2">{title}</h3>
      <p className="text-slate-400 mb-4">{description}</p>
      <div className="space-y-3">
        {toggles.map((t: any, i: number) => (
          <div key={i} className="flex items-center justify-between py-2">
            <label className="text-sm font-semibold">{t.label}</label>
            <input type="checkbox" defaultChecked={t.value} className="w-4 h-4 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
