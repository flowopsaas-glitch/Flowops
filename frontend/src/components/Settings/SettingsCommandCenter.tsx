import React, { useState } from "react";
import { 
  Building2, 
  User, 
  Bell, 
  Shield, 
  Webhook, 
  CreditCard 
} from "lucide-react";
// 🚀 Adjust this import path if your TenantSettings is not in the admin folder
import TenantSettings from "../../pages/admin/TenantSettings"; 

type SettingsTab = "profile" | "workspace" | "billing" | "notifications" | "security" | "developers";

export default function SettingsCommandCenter() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace");

  const tabs = [
    { id: "profile", label: "My Profile", icon: User },
    { id: "workspace", label: "Tenant Workspace", icon: Building2 },
    { id: "billing", label: "Billing & Plans", icon: CreditCard },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "developers", label: "API & Webhooks", icon: Webhook },
  ] as const;

  return (
    <div className="min-h-full bg-[#060B1A] flex flex-col md:flex-row">
      
      {/* 📱 MOBILE NAVIGATION (Hidden on Desktop) */}
      <div className="md:hidden p-4 border-b border-white/10 bg-white/5 overflow-x-auto custom-scrollbar">
        <div className="flex gap-2 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  isActive 
                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" 
                    : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 💻 DESKTOP SIDEBAR */}
      <div className="hidden md:flex flex-col w-64 shrink-0 border-r border-white/10 bg-white/5 min-h-[calc(100vh-4rem)]">
        <div className="p-6">
          <h2 className="text-xl font-black text-white tracking-tight">Settings</h2>
          <p className="text-xs text-white/50 font-medium mt-1">Manage your account and workspace.</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all group ${
                  isActive 
                    ? "bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-300 border border-cyan-500/20 shadow-inner" 
                    : "text-white/60 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                <Icon size={18} className={isActive ? "text-cyan-400" : "text-white/40 group-hover:text-white/70"} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 🚀 MAIN CONTENT AREA */}
      <div className="flex-1 overflow-y-auto">
        {/* Render the massive Tenant Settings page we just built if Workspace is active */}
        {activeTab === "workspace" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <TenantSettings />
          </div>
        )}

        {/* Placeholder for future tabs */}
        {activeTab !== "workspace" && (
          <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] text-center animate-in fade-in duration-300">
            <div className="h-20 w-20 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center mb-6">
              <Shield className="text-white/20 h-8 w-8" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Coming Soon</h3>
            <p className="text-white/50 max-w-md text-sm leading-relaxed">
              The {tabs.find(t => t.id === activeTab)?.label} panel is currently under construction. 
              This command center shell is ready to house it as soon as the module is built.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
