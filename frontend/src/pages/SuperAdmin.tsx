import { useState, useEffect, useCallback } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import {
  Users, Building2, CheckSquare, FolderOpen, UserPlus, Trash2,
  Crown, Shield, UserCog, X, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, Search,
} from 'lucide-react';

// ── VS Code Dark+ tokens ───────────────────────────────────────────────────────
const VS = {
  bg0:    '#1e1e1e',
  bg1:    '#252526',
  bg2:    '#2d2d2d',
  bg3:    '#333333',
  border: '#3c3c3c',
  border2:'#454545',
  text0:  '#f0f0f0',
  text1:  '#c0c0c0',
  text2:  '#909090',
  blue:   '#569cd6',
  teal:   '#4ec9b0',
  yellow: '#dcdcaa',
  orange: '#ce9178',
  purple: '#c586c0',
  red:    '#f44747',
  green:  '#6a9955',
  accent: '#007acc',
};

const SUPER_ADMIN_EMAIL = 'admin@eversense.ai';

const ROLE_CFG: Record<string, { color: string; label: string }> = {
  OWNER:  { color: VS.yellow,  label: 'Owner'  },
  ADMIN:  { color: VS.blue,    label: 'Admin'  },
  STAFF:  { color: VS.teal,    label: 'Staff'  },
  CLIENT: { color: VS.text2,   label: 'Client' },
};

const inputCls = 'w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#007acc]/50 transition-all';
const inputStyle: React.CSSProperties = { background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text0 };

interface Stats {
  totalUsers: number;
  totalOrgs: number;
  totalTasks: number;
  totalProjects: number;
  totalClients: number;
  recentUsers: number;
}

interface OrgUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string;
  memberships: Array<{ role: string; org: { id: string; name: string; slug: string } }>;
  _count: { macroTasks: number };
}

interface Org {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  projectCount: number;
  owner: { id: string; email: string; name: string | null } | null;
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: number | string; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
      <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18`, border: `1px solid ${color}33` }}>
        <Icon className="h-4.5 w-4.5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold tabular-nums leading-tight" style={{ color: VS.text0 }}>{value}</div>
        <div className="text-[11px] mt-0.5" style={{ color: VS.text2 }}>{label}</div>
        {sub && <div className="text-[11px] mt-0.5" style={{ color }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ msg, ok, onClose }: { msg: string; ok: boolean; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] shadow-xl"
      style={{ background: ok ? 'rgba(78,201,176,0.15)' : 'rgba(244,71,71,0.15)', border: `1px solid ${ok ? VS.teal : VS.red}`, color: ok ? VS.teal : VS.red }}
    >
      {ok ? '✓' : '✕'} {msg}
      <button onClick={onClose} className="ml-1 opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────
function ConfirmDialog({ title, body, onConfirm, onCancel }: {
  title: string; body: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-sm rounded-xl p-6 shadow-2xl" style={{ background: VS.bg1, border: `1px solid ${VS.border2}` }}>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5" style={{ color: VS.red }} />
          <h3 className="text-[15px] font-bold" style={{ color: VS.text0 }}>{title}</h3>
        </div>
        <p className="text-[13px] mb-6" style={{ color: VS.text1 }}>{body}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all hover:bg-white/[0.05]"
            style={{ border: `1px solid ${VS.border}`, color: VS.text1 }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
            style={{ background: 'rgba(244,71,71,0.15)', border: `1px solid rgba(244,71,71,0.4)`, color: VS.red }}
          >Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Invite modal ───────────────────────────────────────────────────────────────
function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (msg: string) => void }) {
  const api = useApiClient();
  const [email, setEmail]   = useState('');
  const [name, setName]     = useState('');
  const [role, setRole]     = useState('STAFF');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.fetch('/api/super-admin/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined, role }),
      });
      if (data.error) { setError(data.error); return; }
      onSuccess(data.message || 'Invitation sent');
      onClose();
    } catch {
      setError('Failed to send invitation');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-md rounded-xl shadow-2xl" style={{ background: VS.bg1, border: `1px solid ${VS.border2}` }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${VS.border}` }}>
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" style={{ color: VS.accent }} />
            <h2 className="text-[15px] font-bold" style={{ color: VS.text0 }}>Invite User</h2>
          </div>
          <button onClick={onClose} className="opacity-50 hover:opacity-100 transition-opacity">
            <X className="h-4 w-4" style={{ color: VS.text1 }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: VS.text2 }}>Email *</label>
            <input
              className={inputCls}
              style={inputStyle}
              type="email"
              required
              placeholder="user@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: VS.text2 }}>Name (optional)</label>
            <input
              className={inputCls}
              style={inputStyle}
              type="text"
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: VS.text2 }}>Role</label>
            <select
              className={inputCls}
              style={inputStyle}
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="ADMIN">Admin</option>
              <option value="STAFF">Staff</option>
              <option value="CLIENT">Client</option>
            </select>
          </div>
          {error && <p className="text-[12px]" style={{ color: VS.red }}>{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-white/[0.05] transition-all"
              style={{ border: `1px solid ${VS.border}`, color: VS.text1 }}
            >Cancel</button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-all"
              style={{ background: VS.accent, color: '#fff', border: 'none' }}
            >{loading ? 'Sending…' : 'Send Invite'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function SuperAdmin() {
  const { data: session } = useSession();
  const api = useApiClient();

  const [stats, setStats]     = useState<Stats | null>(null);
  const [users, setUsers]     = useState<OrgUser[]>([]);
  const [orgs, setOrgs]       = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  const [activeTab, setActiveTab] = useState<'users' | 'orgs'>('users');
  const [search, setSearch]       = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const [showInvite, setShowInvite]     = useState(false);
  const [confirm, setConfirm]           = useState<{ type: 'user' | 'org'; id: string; label: string } | null>(null);

  const isSuperAdmin = session?.user?.email === SUPER_ADMIN_EMAIL;

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, orgsRes] = await Promise.all([
        api.fetch('/api/super-admin/stats'),
        api.fetch('/api/super-admin/users'),
        api.fetch('/api/super-admin/orgs-detailed'),
      ]);
      if (statsRes.totalUsers !== undefined) setStats(statsRes);
      if (usersRes.users) setUsers(usersRes.users);
      if (orgsRes.orgs) setOrgs(orgsRes.orgs);
    } catch {
      showToast('Failed to load data', false);
    } finally {
      setLoading(false);
    }
  }, [api, showToast]);

  useEffect(() => {
    if (isSuperAdmin) loadAll();
  }, [isSuperAdmin, loadAll]);

  async function handleDeleteUser(userId: string) {
    try {
      const data = await api.fetch(`/api/super-admin/users/${userId}`, { method: 'DELETE' });
      if (data.error) { showToast(data.error, false); return; }
      setUsers(prev => prev.filter(u => u.id !== userId));
      showToast('User deleted', true);
    } catch {
      showToast('Failed to delete user', false);
    }
    setConfirm(null);
  }

  async function handleDeleteOrg(orgId: string) {
    try {
      const data = await api.fetch(`/api/super-admin/orgs/${orgId}`, { method: 'DELETE' });
      if (data.error) { showToast(data.error, false); return; }
      setOrgs(prev => prev.filter(o => o.id !== orgId));
      showToast('Organization deleted', true);
    } catch {
      showToast('Failed to delete organization', false);
    }
    setConfirm(null);
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-3" style={{ color: VS.red, opacity: 0.5 }} />
          <p className="text-[15px] font-semibold" style={{ color: VS.text1 }}>Access Denied</p>
          <p className="text-[13px] mt-1" style={{ color: VS.text2 }}>Super admin access required</p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(u =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredOrgs = orgs.filter(o =>
    !search ||
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.slug.toLowerCase().includes(search.toLowerCase())
  );

  const owners = users.filter(u => u.memberships.some(m => m.role === 'OWNER'));

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: VS.text0 }}>Super Admin</h1>
          <p className="text-[13px] mt-0.5" style={{ color: VS.text2 }}>Platform-wide management for EverSense</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition-all hover:bg-white/[0.05] disabled:opacity-50"
            style={{ border: `1px solid ${VS.border}`, color: VS.text1 }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
            style={{ background: VS.accent, color: '#fff', border: 'none' }}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Invite User
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Users"    value={stats.totalUsers}    icon={Users}       color={VS.blue}   sub={`+${stats.recentUsers} this month`} />
          <StatCard label="Organizations"  value={stats.totalOrgs}     icon={Building2}   color={VS.teal}   />
          <StatCard label="Total Tasks"    value={stats.totalTasks}    icon={CheckSquare} color={VS.accent} />
          <StatCard label="Projects"       value={stats.totalProjects} icon={FolderOpen}  color={VS.orange} />
          <StatCard label="Clients"        value={stats.totalClients}  icon={UserCog}     color={VS.purple} />
          <StatCard label="Owners / Leads" value={owners.length}       icon={Crown}       color={VS.yellow} />
        </div>
      )}

      {/* ── Owners / Lead accounts ── */}
      <div className="rounded-xl p-5" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
        <div className="flex items-center gap-2 mb-4">
          <Crown className="h-4 w-4" style={{ color: VS.yellow }} />
          <h2 className="text-[13px] font-bold" style={{ color: VS.text0 }}>Owners / Lead Accounts</h2>
          <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,220,170,0.1)', color: VS.yellow }}>{owners.length}</span>
        </div>
        {owners.length === 0 ? (
          <p className="text-[13px] py-4 text-center" style={{ color: VS.text2 }}>No owner accounts found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: `1px solid ${VS.border}` }}>
                  {['Name', 'Email', 'Org', 'Tasks', 'Joined'].map(h => (
                    <th key={h} className="pb-2 text-left font-medium pr-4" style={{ color: VS.text2 }}>{h}</th>
                  ))}
                  <th className="pb-2 text-right font-medium" style={{ color: VS.text2 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {owners.map(u => {
                  const ownerMem = u.memberships.find(m => m.role === 'OWNER');
                  return (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors" style={{ borderBottom: `1px solid ${VS.border}` }}>
                      <td className="py-2.5 pr-4 font-medium" style={{ color: VS.text0 }}>{u.name || '—'}</td>
                      <td className="py-2.5 pr-4" style={{ color: VS.text1 }}>{u.email}</td>
                      <td className="py-2.5 pr-4" style={{ color: VS.teal }}>{ownerMem?.org.name ?? '—'}</td>
                      <td className="py-2.5 pr-4 tabular-nums" style={{ color: VS.text1 }}>{u._count.macroTasks}</td>
                      <td className="py-2.5 pr-4" style={{ color: VS.text2 }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="py-2.5 text-right">
                        {u.email !== SUPER_ADMIN_EMAIL && (
                          <button
                            onClick={() => setConfirm({ type: 'user', id: u.id, label: u.email })}
                            className="p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-all"
                            style={{ color: VS.red }}
                            title="Delete user"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Tabs: Users / Orgs ── */}
      <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 gap-3 flex-wrap" style={{ borderBottom: `1px solid ${VS.border}` }}>
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: VS.bg2 }}>
            {(['users', 'orgs'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSearch(''); }}
                className="px-3 py-1.5 rounded-md text-[13px] font-medium capitalize transition-all"
                style={activeTab === tab
                  ? { background: VS.bg3, color: VS.text0, border: `1px solid ${VS.border}` }
                  : { color: VS.text2, border: '1px solid transparent' }
                }
              >
                {tab === 'users' ? `Users (${users.length})` : `Organizations (${orgs.length})`}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: VS.text2 }} />
            <input
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#007acc]/50"
              style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }}
              placeholder={`Search ${activeTab}…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-10 text-center text-[13px]" style={{ color: VS.text2 }}>Loading…</div>
          ) : activeTab === 'users' ? (
            /* Users table */
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${VS.border}` }}>
                    {['Name', 'Email', 'Role', 'Org', 'Tasks', 'Verified', 'Joined'].map(h => (
                      <th key={h} className="pb-2 text-left font-medium pr-4" style={{ color: VS.text2 }}>{h}</th>
                    ))}
                    <th className="pb-2 text-right font-medium" style={{ color: VS.text2 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center" style={{ color: VS.text2 }}>No users found</td></tr>
                  )}
                  {filteredUsers.map(u => {
                    const topMem = u.memberships[0];
                    const roleCfg = ROLE_CFG[topMem?.role ?? ''] ?? { color: VS.text2, label: topMem?.role ?? '—' };
                    const expanded = expandedUser === u.id;
                    return (
                      <>
                        <tr
                          key={u.id}
                          className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                          style={{ borderBottom: expanded ? 'none' : `1px solid ${VS.border}` }}
                          onClick={() => setExpandedUser(expanded ? null : u.id)}
                        >
                          <td className="py-2.5 pr-4 font-medium" style={{ color: VS.text0 }}>
                            <div className="flex items-center gap-1.5">
                              {expanded ? <ChevronUp className="h-3 w-3" style={{ color: VS.text2 }} /> : <ChevronDown className="h-3 w-3" style={{ color: VS.text2 }} />}
                              {u.name || '—'}
                            </div>
                          </td>
                          <td className="py-2.5 pr-4" style={{ color: VS.text1 }}>{u.email}</td>
                          <td className="py-2.5 pr-4">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: `${roleCfg.color}18`, color: roleCfg.color }}>
                              {roleCfg.label}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4" style={{ color: VS.text2 }}>{topMem?.org.name ?? '—'}</td>
                          <td className="py-2.5 pr-4 tabular-nums" style={{ color: VS.text1 }}>{u._count.macroTasks}</td>
                          <td className="py-2.5 pr-4">
                            <span style={{ color: u.emailVerified ? VS.teal : VS.orange }}>{u.emailVerified ? '✓' : '—'}</span>
                          </td>
                          <td className="py-2.5 pr-4" style={{ color: VS.text2 }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td className="py-2.5 text-right" onClick={e => e.stopPropagation()}>
                            {u.email !== SUPER_ADMIN_EMAIL && (
                              <button
                                onClick={() => setConfirm({ type: 'user', id: u.id, label: u.email })}
                                className="p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-all"
                                style={{ color: VS.red }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${u.id}-exp`} style={{ borderBottom: `1px solid ${VS.border}` }}>
                            <td colSpan={8} className="pb-3 pl-8 pr-4">
                              <div className="text-[12px] space-y-1" style={{ color: VS.text2 }}>
                                <p><span style={{ color: VS.text1 }}>User ID:</span> {u.id}</p>
                                <p><span style={{ color: VS.text1 }}>All memberships:</span></p>
                                {u.memberships.map(m => (
                                  <p key={m.org.id} className="pl-4">
                                    <span style={{ color: ROLE_CFG[m.role]?.color ?? VS.text2 }}>{m.role}</span>
                                    {' in '}
                                    <span style={{ color: VS.text1 }}>{m.org.name}</span>
                                    <span style={{ color: VS.text2 }}> ({m.org.slug})</span>
                                  </p>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Orgs table */
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${VS.border}` }}>
                    {['Name', 'Slug', 'Owner', 'Members', 'Projects', 'Created'].map(h => (
                      <th key={h} className="pb-2 text-left font-medium pr-4" style={{ color: VS.text2 }}>{h}</th>
                    ))}
                    <th className="pb-2 text-right font-medium" style={{ color: VS.text2 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center" style={{ color: VS.text2 }}>No organizations found</td></tr>
                  )}
                  {filteredOrgs.map(o => (
                    <tr key={o.id} className="hover:bg-white/[0.02] transition-colors" style={{ borderBottom: `1px solid ${VS.border}` }}>
                      <td className="py-2.5 pr-4 font-medium" style={{ color: VS.text0 }}>
                        <div className="flex items-center gap-2">
                          {o.slug === 'veblen' && <Crown className="h-3 w-3 shrink-0" style={{ color: VS.yellow }} />}
                          {o.name}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[12px]" style={{ color: VS.text2 }}>{o.slug}</td>
                      <td className="py-2.5 pr-4" style={{ color: VS.text1 }}>{o.owner?.email ?? '—'}</td>
                      <td className="py-2.5 pr-4 tabular-nums" style={{ color: VS.text1 }}>{o.memberCount}</td>
                      <td className="py-2.5 pr-4 tabular-nums" style={{ color: VS.text1 }}>{o.projectCount}</td>
                      <td className="py-2.5 pr-4" style={{ color: VS.text2 }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="py-2.5 text-right">
                        {o.slug !== 'veblen' && (
                          <button
                            onClick={() => setConfirm({ type: 'org', id: o.id, label: o.name })}
                            className="p-1.5 rounded-lg opacity-50 hover:opacity-100 transition-all"
                            style={{ color: VS.red }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={msg => { showToast(msg, true); loadAll(); }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={`Delete ${confirm.type === 'user' ? 'User' : 'Organization'}`}
          body={`Are you sure you want to permanently delete "${confirm.label}"? This cannot be undone.`}
          onConfirm={() => confirm.type === 'user' ? handleDeleteUser(confirm.id) : handleDeleteOrg(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
    </div>
  );
}
