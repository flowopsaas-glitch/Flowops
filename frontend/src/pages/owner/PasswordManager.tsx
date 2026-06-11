// frontend/src/pages/owner/PasswordManager.tsx
import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { toast } from 'sonner';
import { Key, UserPlus, RefreshCw, Lock, Mail, Building2 } from 'lucide-react';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  companyId: number;
  company?: { name: string };
}

export default function PasswordManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState<{id: number, email: string} | null>(null);
  const [formData, setFormData] = useState<any>({});

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await api.get('/users');
      setUsers(data);
    } catch (err: any) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async () => {
    try {
      await api.post('/users/my-company', {
        email: formData.email,
        password: formData.password,
        name: formData.name,
        role: formData.role || 'USER',
        companyId: parseInt(formData.companyId),
      });
      toast.success('User created successfully');
      setShowCreateModal(false);
      setFormData({});
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    }
  };

  const handleResetPassword = async () => {
    if (!showResetModal || !formData.newPassword) return;
    
    try {
      await api.post(`/users/${showResetModal.id}/reset-password`, {
        newPassword: formData.newPassword,
      });
      toast.success('Password reset successfully');
      setShowResetModal(null);
      setFormData({});
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Key className="w-8 h-8 text-cyan-400" />
              Password Manager
            </h1>
            <p className="text-slate-400 mt-1">Create and manage tenant user credentials</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-slate-950 rounded-lg font-medium transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Create User
          </button>
        </div>

        {/* Users Table */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  {['User', 'Email', 'Role', 'Company', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                          <span className="text-cyan-400 font-medium text-sm">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-white">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{user.company?.name || 'N/A'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setShowResetModal({ id: user.id, email: user.email })}
                        className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                      >
                        <Lock className="w-4 h-4" />
                        Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create User Modal */}
        {showCreateModal && (
          <Modal title="Create New User" onClose={() => setShowCreateModal(false)}>
            <div className="space-y-4">
              <Input
                label="Full Name"
                icon={UserPlus}
                value={formData.name || ''}
                onChange={(e: any) => setFormData({...formData, name: e.target.value})}
                required
              />
              <Input
                label="Email"
                type="email"
                icon={Mail}
                value={formData.email || ''}
                onChange={(e: any) => setFormData({...formData, email: e.target.value})}
                required
              />
              <Input
                label="Password"
                type="password"
                icon={Lock}
                value={formData.password || ''}
                onChange={(e: any) => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••"
                required
              />
              <Select
                label="Role"
                value={formData.role || 'USER'}
                onChange={(e: any) => setFormData({...formData, role: e.target.value})}
                options={[
                  { value: 'USER', label: 'User' },
                  { value: 'ADMIN', label: 'Admin' },
                  { value: 'SUPER_ADMIN', label: 'Super Admin' },
                ]}
              />
              <Input
                label="Company ID"
                icon={Building2}
                type="number"
                value={formData.companyId || ''}
                onChange={(e: any) => setFormData({...formData, companyId: e.target.value})}
                required
              />
              <button
                onClick={handleCreateUser}
                className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold rounded-lg transition-colors"
              >
                Create User
              </button>
            </div>
          </Modal>
        )}

        {/* Reset Password Modal */}
        {showResetModal && (
          <Modal title={`Reset Password: ${showResetModal.email}`} onClose={() => setShowResetModal(null)}>
            <div className="space-y-4">
              <Input
                label="New Password"
                type="password"
                icon={Lock}
                value={formData.newPassword || ''}
                onChange={(e: any) => setFormData({...formData, newPassword: e.target.value})}
                placeholder="Enter new password"
                required
              />
              <p className="text-xs text-slate-500">
                Password must be at least 6 characters
              </p>
              <button
                onClick={handleResetPassword}
                className="w-full py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition-colors"
              >
                Reset Password
              </button>
            </div>
          </Modal>
        )}

      </div>
    </div>
  );
}

// Helper Components
function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Input({ label, icon: Icon, ...props }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-400 mb-1.5">{label}</label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />}
        <input
          {...props}
          className={`w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition-colors ${Icon ? 'pl-10' : ''}`}
        />
      </div>
    </div>
  );
}

function Select({ label, options, ...props }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-400 mb-1.5">{label}</label>
      <select
        {...props}
        className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none transition-colors"
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
