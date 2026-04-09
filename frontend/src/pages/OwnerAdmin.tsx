import { useState, useEffect, useCallback } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import { Users, Building2, X, Crown, UserPlus } from 'lucide-react';
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
  const [tab, setTab] = useState<'users' | 'orgs' | 'leads'>('users');
  const [showInvite, setShowInvite] = useState(false);
  const [showLead, setShowLead] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

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

  useEffect(() => { if (session?.user?.id) loadAll(); }, [session?.user?.id]);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: VS.text0 }}>Owner Admin</h1>
          <p className="text-[12px] mt-0.5" style={{ color: VS.text2 }}>Manage your organizations, users, and lead accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
            style={{ background: VS.accent }}>
            <UserPlus className="h-3.5 w-3.5" /> Invite User
          </button>
          <button onClick={() => setShowLead(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
            style={{ background: VS.teal }}>
            <Crown className="h-3.5 w-3.5" /> Create Lead
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {[
          { id: 'users' as const, label: 'Users', icon: Users, badge: users.length },
          { id: 'orgs' as const, label: 'Organizations', icon: Building2, badge: orgs.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={tab === t.id ? { background: VS.accent, color: '#fff' } : { background: VS.bg1, color: VS.text2, border: `1px solid ${VS.border}` }}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
            <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full" style={{ background: tab === t.id ? 'rgba(255,255,255,0.2)' : VS.bg3 }}>{t.badge}</span>
          </button>
        ))}
      </div>

      {/* Users Tab */}
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

      {/* Orgs Tab */}
      {tab === 'orgs' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map(o => (
            <div key={o.id} className="rounded-xl p-5" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
              <h3 className="text-[14px] font-bold" style={{ color: VS.text0 }}>{o.name}</h3>
              <p className="text-[11px] mt-1" style={{ color: VS.text2 }}>{o.slug}</p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" style={{ color: VS.blue }} />
                  <span className="text-[12px] font-medium" style={{ color: VS.text1 }}>{o.memberCount} members</span>
                </div>
                <span className="text-[10px]" style={{ color: VS.text2 }}>
                  Created {new Date(o.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
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
