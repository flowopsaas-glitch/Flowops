import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from "../components/ToastProvider";
import { 
  User, Building2, Bell, CreditCard, Shield, Lock, 
  Save, Loader2, CheckCircle, AlertCircle,
  Globe, MapPin, Key, Eye, EyeOff, Trash2,
  Upload, Image as ImageIcon, X,
  Cpu, Printer, ScanLine, Search, RefreshCw, Usb
} from "lucide-react";

type Tab = 'profile' | 'company' | 'hardware' | 'security' | 'notifications' | 'billing';

type UserProfile = {
  id: number;
  email: string;
  name: string;
  phone?: string;
  role: string;
  companyId: number;
};

type CompanyProfile = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  plan: string;
  status: string;
  logoUrl?: string;
};

type HardwareDevice = {
  id: number;
  name: string;
  deviceType: 'PRINTER' | 'SCANNER' | 'OTHER';
  vendorId: string;
  productId: string;
  serialNumber?: string;
  status: 'ACTIVE' | 'OFFLINE' | 'ERROR';
  lastSeen?: string;
  createdAt: string;
};

export default function Settings() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Profile State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userForm, setUserForm] = useState({ name: '', phone: '' });
  
  // Company State
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [companyForm, setCompanyForm] = useState({ 
    name: '', email: '', phone: '', address: '', website: '' 
  });
  
  // Logo Upload State
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  // Hardware State
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [scanning, setScanning] = useState(false);
  
  // Security State
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmNewPassword: ''
  });
  
  // Notifications State
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    smsAlerts: false,
    waybillUpdates: true,
    billingReminders: true,
    aiInsights: true
  });
  
  // Billing State (mock)
  const [billing] = useState({
    plan: 'Starter',
    nextBillingDate: '2026-07-01',
    amount: 'R1,500.00',
    paymentMethod: '**** **** **** 4242'
  });

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'hardware') {
      loadHardware();
    }
  }, [activeTab]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) {
        console.warn('No token found');
        navigate('/login');
        return;
      }
      
      const userRes = await api.get('/users/me');
      const userData = userRes.data || userRes;
      
      console.log('User data loaded:', userData);
      
      if (!userData || !userData.id) {
        console.warn('Invalid user data:', userData);
        showToast('Session expired. Please log in again.', 'error');
        navigate('/login');
        return;
      }
      
      setUser(userData);
      setUserForm({ 
        name: userData.name || '', 
        phone: userData.phone || '' 
      });
      
      if (userData.companyId) {
        try {
          const companyRes = await api.get('/companies/my-company');
          const companyData = companyRes.data || companyRes;
          
          if (companyData) {
            setCompany(companyData);
            setCompanyForm({
              name: companyData.name || '',
              email: companyData.email || '',
              phone: companyData.phone || '',
              address: companyData.address || '',
              website: companyData.website || ''
            });
            
            if (companyData.logoUrl) {
              const logoUrl = companyData.logoUrl.startsWith('http') 
                ? companyData.logoUrl 
                : `${import.meta.env.VITE_FLOWOPS_API_URL?.replace('/api/v1', '')}${companyData.logoUrl}`;
              setLogoPreview(logoUrl);
            }
          }
        } catch (companyErr) {
          console.warn('Could not load company data:', companyErr);
        }
      }
      
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        showToast('Session expired. Please log in again.', 'error');
        navigate('/login');
      } else {
        showToast('Failed to load settings: ' + (err?.message || 'Unknown error'), 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadHardware = async () => {
    try {
      setLoadingDevices(true);
      const res = await api.get('/v2/hardware');
      const deviceData = res.data || res;
      setDevices(Array.isArray(deviceData) ? deviceData : []);
    } catch (err) {
      console.error("Hardware fetch failed", err);
      setDevices([]);
      showToast('Failed to load hardware devices', 'error');
    } finally {
      setLoadingDevices(false);
    }
  };

  const scanForNewHardware = async () => {
    if (!('usb' in navigator)) {
      showToast("WebUSB not supported in this browser. Please use Chrome or Edge.", "error");
      return;
    }

    setScanning(true);
    try {
      // @ts-ignore - WebUSB API
      const device = await navigator.usb.requestDevice({ filters: [] });
      
      const payload = {
        name: device.productName || 'Unknown Device',
        deviceType: device.productName?.toLowerCase().includes('printer') ? 'PRINTER' : 
                    device.productName?.toLowerCase().includes('scanner') ? 'SCANNER' : 'OTHER',
        vendorId: device.vendorId.toString(),
        productId: device.productId.toString(),
        serialNumber: device.serialNumber || 'N/A'
      };

      await api.post('/v2/hardware/auto-register', payload);
      showToast(`Device Linked: ${payload.name}`, "success");
      loadHardware();
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        showToast("No device selected", "info");
      } else {
        console.warn("Scan cancelled or failed:", err);
        showToast("Failed to register device", "error");
      }
    } finally {
      setScanning(false);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, {
        name: userForm.name,
        phone: userForm.phone
      });
      showToast('Profile updated successfully!', 'success');
      loadSettings();
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.message || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCompany = async (e: FormEvent) => {
    e.preventDefault();
    if (!company) return;
    
    setSaving(true);
    try {
      await api.patch(`/companies/${company.id}`, companyForm);
      showToast('Company settings updated!', 'success');
      loadSettings();
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.message || 'Failed to update company', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file (PNG, JPG, GIF)', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('Logo must be less than 5MB', 'error');
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleUploadLogo = async () => {
    if (!logoFile || !company) return;
    
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', logoFile);
      
      await api.patch(`/companies/${company.id}/logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      showToast('Logo uploaded successfully!', 'success');
      setLogoFile(null);
      loadSettings();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to upload logo', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!company) return;
    try {
      await api.delete(`/companies/${company.id}/logo`);
      showToast('Logo removed successfully', 'success');
      setLogoPreview(null);
      loadSettings();
    } catch (err: any) {
      showToast('Failed to remove logo', 'error');
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    
    setSaving(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, {
        newPassword: passwordForm.newPassword
      });
      showToast('Password changed successfully!', 'success');
      setPasswordForm({ newPassword: '', confirmNewPassword: '' });
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to change password', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      showToast('Notification preferences saved!', 'success');
    } catch (err: any) {
      showToast('Failed to save preferences', 'error');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User size={16} /> },
    { id: 'company', label: 'Company', icon: <Building2 size={16} /> },
    { id: 'hardware', label: 'Hardware', icon: <Cpu size={16} /> },
    { id: 'security', label: 'Security', icon: <Shield size={16} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
    { id: 'billing', label: 'Billing', icon: <CreditCard size={16} /> },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="animate-spin text-blue-500" size={32} />
        <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">Loading Settings...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="text-red-500" size={32} />
        <span className="text-sm text-slate-400">Unable to load user data</span>
        <button
          onClick={() => navigate('/login')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in slide-in-from-right-4 fade-in duration-300 space-y-6">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Settings</h3>
          <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest">Manage your account and preferences</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-xl">
        
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-6 max-w-2xl">
            <div className="space-y-4">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <User size={18} className="text-blue-400" /> Personal Information
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Full Name</label>
                  <input
                    type="text"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Email (Read-only)</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Phone</label>
                  <input
                    type="tel"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
                    placeholder="+27 12 345 6789"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Role</label>
                  <input
                    type="text"
                    value={user?.role || ''}
                    disabled
                    className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t border-white/5">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:from-blue-500 hover:to-indigo-500 transition-all disabled:opacity-50 shadow-lg shadow-blue-600/30"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        {/* Company Tab with Logo Upload */}
        {activeTab === 'company' && company && (
          <form onSubmit={handleSaveCompany} className="space-y-6 max-w-2xl">
            <div className="space-y-4">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 size={18} className="text-indigo-400" /> Company Details
              </h4>
              
              <div className="p-5 rounded-2xl bg-black/20 border border-white/10">
                <h5 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <ImageIcon size={16} className="text-indigo-400" /> Company Logo
                </h5>
                <div className="space-y-4">
                  {logoPreview ? (
                    <div className="relative inline-block">
                      <div className="w-32 h-32 rounded-xl bg-white border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden">
                        <img 
                          src={logoPreview} 
                          alt="Company Logo" 
                          className="w-full h-full object-contain p-2"
                          onError={() => setLogoPreview(null)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                        aria-label="Remove logo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-32 h-32 rounded-xl bg-black/40 border-2 border-dashed border-white/20 cursor-pointer hover:border-indigo-500/50 hover:bg-black/60 transition-all group">
                      <Upload size={24} className="text-slate-400 group-hover:text-indigo-400 mb-2" />
                      <span className="text-[9px] font-bold text-slate-400 text-center px-2">Click to upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                    </label>
                  )}
                  
                  {logoFile && (
                    <div className="flex items-center gap-3 pt-3 border-t border-white/10">
                      <div className="flex-1">
                        <div className="text-[10px] font-bold text-white truncate">{logoFile.name}</div>
                        <div className="text-[9px] text-slate-400">{(logoFile.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleUploadLogo}
                        disabled={uploadingLogo}
                        className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/30"
                      >
                        {uploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        {uploadingLogo ? 'Uploading...' : 'Upload'}
                      </button>
                    </div>
                  )}
                  
                  <p className="text-[9px] text-slate-500">Recommended: PNG or JPG, max 5MB. Logo will appear on invoices.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Company Name</label>
                  <input
                    type="text"
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Company Email</label>
                  <input
                    type="email"
                    value={companyForm.email}
                    onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Phone</label>
                  <input
                    type="tel"
                    value={companyForm.phone}
                    onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Website</label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="url"
                      value={companyForm.website}
                      onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                    />
                  </div>
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-3 text-slate-500" size={14} />
                    <textarea
                      value={companyForm.address}
                      onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all min-h-[80px] resize-none"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Current Plan</label>
                  <input
                    type="text"
                    value={company?.plan || 'Starter'}
                    disabled
                    className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-400 cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Status</label>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      company?.status === 'Active' 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    }`}>
                      {company?.status || 'Active'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t border-white/5">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:from-indigo-500 hover:to-violet-500 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/30"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save Company Settings'}
              </button>
            </div>
          </form>
        )}

        {/* Hardware Tab */}
        {activeTab === 'hardware' && (
          <div className="space-y-6">
            <div className="flex justify-between items-end mb-4">
              <div>
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <Cpu size={18} className="text-cyan-400" /> Hardware Registry
                </h4>
                <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest mt-1">Station Peripheral Management</p>
              </div>
              <button 
                onClick={scanForNewHardware}
                disabled={scanning}
                className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
              >
                {scanning ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                {scanning ? 'Scanning...' : 'Scan Local Mesh'}
              </button>
            </div>

            {loadingDevices ? (
              <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <RefreshCw className="animate-spin text-cyan-500" size={32} />
                <span className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.2em]">Synchronizing Hardware Mesh...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {devices.length === 0 ? (
                  <div className="col-span-2 p-12 rounded-[32px] border-2 border-dashed border-white/5 bg-white/[0.02] text-center">
                    <Cpu size={48} className="mx-auto text-white/10 mb-4" />
                    <p className="text-white/30 text-sm font-medium italic">No peripheral nodes detected.</p>
                    <p className="text-white/20 text-[10px] uppercase tracking-wider mt-1 font-bold">Connect a USB printer or scanner to authorize</p>
                  </div>
                ) : (
                  devices.map((device) => (
                    <div key={device.id} className="p-5 rounded-3xl border border-white/10 bg-black/40 flex items-center justify-between group hover:border-cyan-500/50 transition-all shadow-xl">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-white/5 text-cyan-400 group-hover:bg-cyan-500/10 transition-colors shadow-inner">
                          {device.deviceType === 'PRINTER' ? <Printer size={20} /> : 
                           device.deviceType === 'SCANNER' ? <ScanLine size={20} /> : 
                           <Usb size={20} />}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white tracking-tight">{device.name}</div>
                          <div className="text-[10px] text-white/40 font-mono">ID: {device.vendorId}:{device.productId}</div>
                          {device.serialNumber && device.serialNumber !== 'N/A' && (
                            <div className="text-[9px] text-white/30 font-mono mt-0.5">S/N: {device.serialNumber}</div>
                          )}
                        </div>
                      </div>
                      <div className={`flex items-center gap-2 text-[9px] font-black uppercase px-3 py-1 rounded-full border ${
                        device.status === 'ACTIVE' 
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : device.status === 'OFFLINE'
                          ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                          : 'text-red-400 bg-red-500/10 border-red-500/20'
                      }`}>
                        <CheckCircle size={12} /> {device.status}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20">
              <h5 className="text-sm font-semibold text-blue-200 flex items-center gap-2 mb-2">
                <AlertCircle size={14} /> WebUSB Compatibility
              </h5>
              <p className="text-[11px] text-blue-300/80">
                Hardware scanning requires WebUSB API support. Use Chrome, Edge, or Opera for best results. 
                Firefox and Safari have limited WebUSB support.
              </p>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6 max-w-2xl">
            <h4 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield size={18} className="text-emerald-400" /> Security Settings
            </h4>
            <form onSubmit={handleChangePassword} className="space-y-4 p-4 rounded-2xl bg-black/20 border border-white/5">
              <h5 className="text-sm font-semibold text-white flex items-center gap-2">
                <Lock size={14} className="text-emerald-400" /> Change Password
              </h5>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">New Password</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-12 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all"
                    placeholder="••••••••"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[9px] text-slate-500">Must be at least 8 characters</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 block">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirmNewPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmNewPassword: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:from-emerald-500 hover:to-teal-500 transition-all disabled:opacity-50 shadow-lg shadow-emerald-600/30 mt-2"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </form>
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
              <h5 className="text-sm font-semibold text-red-200 flex items-center gap-2 mb-3">
                <Trash2 size={14} /> Danger Zone
              </h5>
              <p className="text-[11px] text-red-300/80 mb-3">Once you delete your account, there is no going back.</p>
              <button className="text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors underline">
                Delete Account (Coming Soon)
              </button>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-6 max-w-2xl">
            <h4 className="text-lg font-bold text-white flex items-center gap-2">
              <Bell size={18} className="text-yellow-400" /> Notification Preferences
            </h4>
            <div className="space-y-3">
              {[
                { key: 'emailAlerts', label: 'Email Alerts', desc: 'Receive important updates via email' },
                { key: 'smsAlerts', label: 'SMS Alerts', desc: 'Get text messages for urgent notifications' },
                { key: 'waybillUpdates', label: 'Waybill Updates', desc: 'Notifications when waybill status changes' },
                { key: 'billingReminders', label: 'Billing Reminders', desc: 'Reminders about invoices and payments' },
                { key: 'aiInsights', label: 'AI Insights', desc: 'Weekly AI-powered logistics insights' },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-3 p-4 rounded-xl bg-black/20 border border-white/5 cursor-pointer hover:bg-black/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={(notifications as any)[item.key]}
                    onChange={(e) => setNotifications({ ...notifications, [item.key]: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded border-white/30 bg-black/40 text-blue-600 focus:ring-blue-500/40 accent-blue-600"
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">{item.label}</div>
                    <div className="text-[11px] text-slate-400">{item.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end pt-4 border-t border-white/5">
              <button
                onClick={handleSaveNotifications}
                disabled={saving}
                className="flex items-center gap-2 bg-gradient-to-r from-yellow-600 to-orange-600 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:from-yellow-500 hover:to-orange-500 transition-all disabled:opacity-50 shadow-lg shadow-yellow-600/30"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        )}

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <div className="space-y-6 max-w-2xl">
            <h4 className="text-lg font-bold text-white flex items-center gap-2">
              <CreditCard size={18} className="text-violet-400" /> Billing & Subscription
            </h4>
            <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-white">Current Plan</div>
                  <div className="text-2xl font-black text-violet-400">{billing.plan}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white">Next Billing</div>
                  <div className="text-lg font-bold text-white">{billing.amount}</div>
                  <div className="text-[10px] text-slate-400">{billing.nextBillingDate}</div>
                </div>
              </div>
              <div className="space-y-2 text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span>Payment Method:</span>
                  <span className="font-mono">{billing.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span>Billing Cycle:</span>
                  <span>Monthly</span>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-black/20 border border-white/5">
              <h5 className="text-sm font-semibold text-white mb-3">Usage This Month</h5>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-2xl font-black text-white">1,247</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Waybills</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-white">89</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">AI Queries</div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
