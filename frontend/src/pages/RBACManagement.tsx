import React, { useState, useEffect } from 'react';
import { Shield, Users, Lock, CheckCircle2, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function RBACManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [newRole, setNewRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [usersRes, rolesRes] = await Promise.all([
          api.get('/users/company'),
          api.get('/rbac/roles'),
        ]);
        setUsers(usersRes.data);
        setRoles(rolesRes.data.roles || []);
      } catch (err) {
        console.error('Failed to fetch RBAC data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.companyId) {
      void fetchData();
    }
  }, [user]);

  const handleAssignRole = async () => {
    if (!selectedUser || !newRole) return;

    try {
      await api.post(`/rbac/assign-role`, {
        userId: selectedUser.id,
        role: newRole,
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id ? { ...u, role: newRole } : u
        )
      );

      setSelectedUser(null);
      setNewRole('');
    } catch (err) {
      console.error('Failed to assign role:', err);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading RBAC settings...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-950 p-8 text-white">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-black tracking-tighter mb-2 flex items-center gap-3">
          <Shield className="text-purple-400" size={32} /> ENTERPRISE RBAC
        </h1>
        <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Role-based access control & permissions</p>
      </div>

      {/* Role Hierarchy */}
      <div className="mb-8 bg-slate-800/50 border border-white/10 rounded-[24px] p-6">
        <h2 className="text-xl font-black mb-6 flex items-center gap-2">
          <Lock size={20} /> Role Hierarchy
        </h2>

        <div className="space-y-4">
          {roles.map((role: any) => (
            <div key={role.name} className="border border-white/10 rounded-lg p-4 hover:border-purple-500/50 transition-all">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-black text-purple-300">{role.name}</h3>
                <span className="text-xs bg-purple-500/20 border border-purple-500/50 text-purple-200 px-3 py-1 rounded-full">
                  {role.permissions.length} permissions
                </span>
              </div>
              <p className="text-sm text-slate-400 mb-3">{role.description}</p>
              <div className="flex flex-wrap gap-2">
                {role.permissions.slice(0, 6).map((perm: string) => (
                  <span key={perm} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">
                    {perm.replace(/_/g, ' ').toLowerCase()}
                  </span>
                ))}
                {role.permissions.length > 6 && (
                  <span className="text-xs text-slate-500">+{role.permissions.length - 6} more</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Users Management */}
      <div className="bg-slate-800/50 border border-white/10 rounded-[24px] p-6">
        <h2 className="text-xl font-black mb-6 flex items-center gap-2">
          <Users size={20} /> Team Members & Roles
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 font-black text-slate-400">Name</th>
                <th className="text-left py-3 px-4 font-black text-slate-400">Email</th>
                <th className="text-left py-3 px-4 font-black text-slate-400">Current Role</th>
                <th className="text-left py-3 px-4 font-black text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-all">
                  <td className="py-3 px-4 font-semibold">{u.name || 'N/A'}</td>
                  <td className="py-3 px-4 text-slate-400">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs font-black">
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => setSelectedUser(u)}
                      className="px-3 py-1 rounded text-xs font-bold bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-all"
                    >
                      Change Role
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Assignment Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-purple-500/30 rounded-[24px] max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-black">Assign Role</h3>
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setNewRole('');
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-slate-400 mb-3 font-semibold">{selectedUser.name}</p>
              <div className="space-y-2">
                {roles.map((role: any) => (
                  <button
                    key={role.name}
                    onClick={() => setNewRole(role.name)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-all font-semibold ${
                      newRole === role.name
                        ? 'bg-purple-500/20 border-purple-500 text-purple-200'
                        : 'bg-slate-800 border-white/10 text-slate-300 hover:border-purple-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{role.name}</span>
                      {newRole === role.name && <CheckCircle2 size={18} />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setNewRole('');
                }}
                className="flex-1 px-4 py-3 rounded-lg border border-white/10 text-white font-black text-xs uppercase hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignRole}
                disabled={!newRole}
                className="flex-1 px-4 py-3 rounded-lg bg-purple-500/20 border border-purple-500/50 text-purple-300 font-black text-xs uppercase hover:bg-purple-500/30 disabled:opacity-50 transition-all"
              >
                Assign Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
