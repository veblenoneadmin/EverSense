import { useState, useEffect, useCallback } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import { Users, Building2, X, Crown, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { VS } from '../lib/theme';

interface OrgUser { id: string; email: string; name: string | null; role: string; orgId: string; orgName: string; createdAt: string }
interface Org { id: string; name: string; slug: string; memberCount: number; createdAt: string }

const inputCls = 'w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#007acc]/40';
const inputStyle: React.CSSProperties = { background: VS.bg3, border: `1px solid ${VS.border}`, color: VS.text0 };

const ROLE_COLORS: Record<string, string> = { OWNER: VS.yellow, ADMIN: VS.purple, STAFF: VS.blue, CLIENT: VS.teal };

export function OwnerAdmin() {
  const { data: session } = useSession();
  const api = useApiClient();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'users' | 'orgs' | 'leads'>('orgs');
  const [showInvite, setShowInvite] = useState(false);
  const [showLead, setShowLead] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [checkRes, usersRes, orgsRes] = await Promise.all([
        api.fetch('/api/owner-admin/check'),
        api.fetch('/api/owner-admin/users'),
        api.fetch('/api/owner-admin/orgs'),
      ]);
      setIsOwner(checkRes.isOwnerAdmin ?? false);
      setUsers(usersRes.users || []);
      setOrgs(orgsRes.orgs || []);
    } catch { setIsOwner(false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadAll();
    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      // Silent refresh — don't show loading spinner
      Promise.all([
        api.fetch('/api/owner-admin/users'),
        api.fetch('/api/owner-admin/orgs'),
      ]).then(([usersRes, orgsRes]) => {
        setUsers(usersRes.users || []);
        setOrgs(orgsRes.orgs || []);
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [session?.user?.id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: VS.accent }} />
    </div>
  );

  const ALLOWED_EMAIL = 'admin@veblengroup.com.au';
  if (!isOwner || session?.user?.email !== ALLOWED_EMAIL) return (
    <div className="flex items-center justify-center h-64">
      <p style={{ color: VS.text2 }}>Access restricted.</p>
    </div>
  );

  // Derived data
  // Lead accounts = orgs that are NOT Veblen and NOT the admin's own orgs
  const adminEmails = new Set([ALLOWED_EMAIL, 'admin@eversense.ai']);
  const leadAccounts = orgs.filter(o => {
    // Skip orgs where the admin is the owner
    const ownerUser = users.find(u => u.orgId === o.id && u.role === 'OWNER');
    if (ownerUser && adminEmails.has(ownerUser.email)) return false;
    // Skip the Veblen org itself
    if (o.slug === 'veblen') return false;
    // Everything else is a lead account (including orgs with pending invites)
    return true;
  });

  const orgMembers = (orgId: string) => users.filter(u => u.orgId === orgId);

  const tabs = [
    { id: 'orgs' as const, label: 'Organizations', icon: Building2, badge: orgs.length },
    { id: 'users' as const, label: 'All Users', icon: Users, badge: users.length },
    { id: 'leads' as const, label: 'Lead Accounts', icon: Crown, badge: leadAccounts.length },
  ];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-[13px] font-medium shadow-xl"
          style={{ background: toast.ok ? VS.teal : VS.red, color: '#fff' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5" style={{ color: VS.yellow }} />
            <h1 className="text-xl font-bold" style={{ color: VS.text0 }}>Owner Admin</h1>
          </div>
          <p className="text-[12px] mt-1" style={{ color: VS.text2 }}>Manage organizations, users, and lead accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-all hover:opacity-90"
            style={{ background: VS.accent }}>
            <UserPlus className="h-3.5 w-3.5" /> Invite User
          </button>
          <button onClick={() => setShowLead(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-all hover:opacity-90"
            style={{ background: VS.teal }}>
            <Crown className="h-3.5 w-3.5" /> Create Lead
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Organizations', value: orgs.length, color: VS.blue, icon: Building2 },
          { label: 'Total Users', value: users.length, color: VS.teal, icon: Users },
          { label: 'Lead Accounts', value: leadAccounts.length, color: VS.yellow, icon: Crown },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl p-4" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: VS.text2 }}>{s.label}</span>
                <Icon className="h-4 w-4" style={{ color: s.color }} />
              </div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5" style={{ borderBottom: `2px solid ${VS.border}`, paddingBottom: 0 }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-5 py-2.5 text-[13px] font-semibold transition-all"
              style={{
                color: active ? VS.accent : VS.text2,
                borderBottom: active ? `2px solid ${VS.accent}` : '2px solid transparent',
                marginBottom: -2,
              }}>
              <Icon className="h-4 w-4" /> {t.label}
              <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full"
                style={{ background: active ? `${VS.accent}22` : VS.bg3, color: active ? VS.accent : VS.text2 }}>{t.badge}</span>
            </button>
          );
        })}
      </div>

      {/* ── Organizations Tab ── */}
      {tab === 'orgs' && (
        <div className="space-y-3">
          {orgs.map(o => {
            const members = orgMembers(o.id);
            const isExpanded = expandedOrg === o.id;
            const owner = members.find(m => m.role === 'OWNER');
            return (
              <div key={o.id} className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
                <div className="flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-white/[0.02]"
                  onClick={() => setExpandedOrg(isExpanded ? null : o.id)}>
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: `${VS.blue}15` }}>
                    <Building2 className="h-5 w-5" style={{ color: VS.blue }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-bold" style={{ color: VS.text0 }}>{o.name}</h3>
                    <p className="text-[11px]" style={{ color: VS.text2 }}>
                      {o.slug} · {o.memberCount} members
                      {owner && ` · Owner: ${owner.name || owner.email}`}
                    </p>
                  </div>
                  <span className="text-[10px]" style={{ color: VS.text2 }}>
                    {new Date(o.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4" style={{ color: VS.text2 }} /> : <ChevronDown className="h-4 w-4" style={{ color: VS.text2 }} />}
                </div>
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${VS.border}` }}>
                    <div className="px-5 py-2" style={{ background: VS.bg2 }}>
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: VS.text2 }}>Members ({members.length})</span>
                    </div>
                    {members.length === 0 ? (
                      <p className="px-5 py-4 text-[12px]" style={{ color: VS.text2 }}>No members</p>
                    ) : members.map((m, i) => (
                      <div key={`${m.id}-${m.orgId}`} className="flex items-center gap-3 px-5 py-2.5"
                        style={{ borderBottom: `1px solid ${VS.border}22`, background: i % 2 === 0 ? 'transparent' : `${VS.bg2}44` }}>
                        <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ background: ROLE_COLORS[m.role] || VS.text2 }}>
                          {(m.name || m.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate" style={{ color: VS.text0 }}>{m.name || '—'}</p>
                          <p className="text-[10px] truncate" style={{ color: VS.text2 }}>{m.email}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
                          style={{ background: `${ROLE_COLORS[m.role] || VS.text2}18`, color: ROLE_COLORS[m.role] || VS.text2 }}>
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {orgs.length === 0 && (
            <div className="rounded-xl p-12 text-center" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
              <Building2 className="h-8 w-8 mx-auto mb-3 opacity-30" style={{ color: VS.text2 }} />
              <p className="text-[13px]" style={{ color: VS.text2 }}>No organizations yet</p>
            </div>
          )}
        </div>
      )}

      {/* ── All Users Tab ── */}
      {tab === 'users' && (
        <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ background: VS.bg2, borderBottom: `1px solid ${VS.border}` }}>
                {['Name', 'Email', 'Role', 'Organization', 'Joined'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: VS.text2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center" style={{ color: VS.text2 }}>No users found</td></tr>
              ) : users.map((u, i) => (
                <tr key={`${u.id}-${u.orgId}`} style={{ background: i % 2 === 0 ? 'transparent' : `${VS.bg2}44`, borderBottom: `1px solid ${VS.border}22` }}>
                  <td className="px-4 py-3 font-medium" style={{ color: VS.text0 }}>{u.name || '—'}</td>
                  <td className="px-4 py-3" style={{ color: VS.text1 }}>{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: `${ROLE_COLORS[u.role] || VS.text2}18`, color: ROLE_COLORS[u.role] || VS.text2 }}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: VS.text2 }}>{u.orgName}</td>
                  <td className="px-4 py-3" style={{ color: VS.text2 }}>{new Date(u.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Lead Accounts Tab ── */}
      {tab === 'leads' && (
        <div className="space-y-3">
          {leadAccounts.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
              <Crown className="h-8 w-8 mx-auto mb-3 opacity-30" style={{ color: VS.yellow }} />
              <p className="text-[13px] font-medium" style={{ color: VS.text1 }}>No lead accounts yet</p>
              <p className="text-[11px] mt-1" style={{ color: VS.text2 }}>Click "Create Lead" to create a new organization for a client</p>
            </div>
          ) : leadAccounts.map(o => {
            const members = orgMembers(o.id);
            const owner = members.find(m => m.role === 'OWNER');
            return (
              <div key={o.id} className="rounded-xl p-5" style={{ background: VS.bg1, border: `1px solid ${VS.yellow}33` }}>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: `${VS.yellow}15` }}>
                    <Crown className="h-5 w-5" style={{ color: VS.yellow }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-bold" style={{ color: VS.text0 }}>{o.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {owner && <span className="text-[11px]" style={{ color: VS.text1 }}>Owner: {owner.name || owner.email}</span>}
                      <span className="text-[10px]" style={{ color: VS.text2 }}>· {o.memberCount} members</span>
                    </div>
                  </div>
                  <span className="text-[10px]" style={{ color: VS.text2 }}>
                    {new Date(o.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                {members.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {members.map(m => (
                      <div key={`${m.id}-${m.orgId}`} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px]"
                        style={{ background: VS.bg2, border: `1px solid ${VS.border}` }}>
                        <div className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ background: ROLE_COLORS[m.role] || VS.text2 }}>
                          {(m.name || m.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <span style={{ color: VS.text1 }}>{m.name || m.email}</span>
                        <span className="font-bold" style={{ color: ROLE_COLORS[m.role] || VS.text2 }}>{m.role}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && <InviteModal orgs={orgs} api={api} onClose={() => setShowInvite(false)} onSuccess={msg => { setToast({ msg, ok: true }); loadAll(); }} />}

      {/* Create Lead Modal */}
      {showLead && <LeadModal api={api} onClose={() => setShowLead(false)} onSuccess={msg => { setToast({ msg, ok: true }); loadAll(); }} />}
    </div>
  );
}

function InviteModal({ orgs, api, onClose, onSuccess }: { orgs: Org[]; api: any; onClose: () => void; onSuccess: (msg: string) => void }) {
  const [emails, setEmails] = useState(['']);
  const [role, setRole] = useState('STAFF');
  const [orgId, setOrgId] = useState(orgs[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const valid = emails.filter(e => e.trim() && e.includes('@'));
    if (!valid.length) { setError('Enter at least one email'); return; }
    if (!orgId) { setError('Select an organization'); return; }
    setLoading(true);
    let ok = 0;
    for (const email of valid) {
      try {
        const res = await api.fetch('/api/owner-admin/invite', { method: 'POST', body: JSON.stringify({ email: email.trim(), role, orgId }) });
        if (!res.error) ok++;
      } catch {}
    }
    setLoading(false);
    if (ok > 0) { onSuccess(`${ok} invite(s) sent`); onClose(); }
    else setError('Failed to send invites');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="w-full max-w-md rounded-xl shadow-2xl" style={{ background: VS.bg1, border: `1px solid ${VS.border2}` }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${VS.border}` }}>
          <h2 className="text-[15px] font-bold" style={{ color: VS.text0 }}>Invite Users</h2>
          <button onClick={onClose} className="opacity-50 hover:opacity-100"><X className="h-4 w-4" style={{ color: VS.text1 }} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: VS.text2 }}>Organization</label>
            <select className={inputCls} style={inputStyle} value={orgId} onChange={e => setOrgId(e.target.value)}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: VS.text2 }}>Emails</label>
            {emails.map((em, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input className={inputCls} style={{ ...inputStyle, flex: 1 }} type="email" placeholder="user@example.com"
                  value={em} onChange={e => { const u = [...emails]; u[i] = e.target.value; setEmails(u); }}
                  onKeyDown={e => { if (e.key === 'Enter' && em.trim()) { e.preventDefault(); setEmails(p => [...p, '']); } }}
                />
                {emails.length > 1 && <button type="button" onClick={() => setEmails(p => p.filter((_, j) => j !== i))} style={{ color: VS.red }}><X className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
            <button type="button" onClick={() => setEmails(p => [...p, ''])}
              className="text-[11px] w-full py-1.5 rounded-lg" style={{ color: VS.accent, border: `1px dashed ${VS.accent}55` }}>+ Add email</button>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: VS.text2 }}>Role</label>
            <select className={inputCls} style={inputStyle} value={role} onChange={e => setRole(e.target.value)}>
              <option value="ADMIN">Admin</option>
              <option value="STAFF">Staff</option>
              <option value="CLIENT">Client</option>
            </select>
          </div>
          {error && <p className="text-[12px]" style={{ color: VS.red }}>{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ border: `1px solid ${VS.border}`, color: VS.text1 }}>Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: VS.accent }}>
              {loading ? 'Sending...' : 'Send Invites'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LeadModal({ api, onClose, onSuccess }: { api: any; onClose: () => void; onSuccess: (msg: string) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!email || !company) { setError('Email and company name required'); return; }
    setLoading(true);
    try {
      const res = await api.fetch('/api/owner-admin/create-lead', { method: 'POST', body: JSON.stringify({ email, name, companyName: company }) });
      if (res.error) { setError(res.error); return; }
      onSuccess(res.message || 'Lead created'); onClose();
    } catch { setError('Failed to create lead'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div className="w-full max-w-md rounded-xl shadow-2xl" style={{ background: VS.bg1, border: `1px solid ${VS.border2}` }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${VS.border}` }}>
          <h2 className="text-[15px] font-bold" style={{ color: VS.text0 }}>Create Lead Account</h2>
          <button onClick={onClose} className="opacity-50 hover:opacity-100"><X className="h-4 w-4" style={{ color: VS.text1 }} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: VS.text2 }}>Company Name *</label>
            <input className={inputCls} style={inputStyle} required placeholder="Acme Corp" value={company} onChange={e => setCompany(e.target.value)} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: VS.text2 }}>Email *</label>
            <input className={inputCls} style={inputStyle} type="email" required placeholder="owner@acme.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: VS.text2 }}>Name (optional)</label>
            <input className={inputCls} style={inputStyle} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
          </div>
          {error && <p className="text-[12px]" style={{ color: VS.red }}>{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ border: `1px solid ${VS.border}`, color: VS.text1 }}>Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: VS.teal }}>
              {loading ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
