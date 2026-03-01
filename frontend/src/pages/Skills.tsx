import { useState, useEffect, useCallback } from 'react';
import { useSession } from '../lib/auth-client';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Plus, Trash2, Star, Users, Layers, ChevronDown, ChevronUp,
  Search, X, Check, Sparkles,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Skill { id: string; name: string; category: string; _count?: { staffSkills: number } }
interface StaffSkill { id: string; skillId: string; name: string; category: string; level: number; yearsExp: number; notes: string | null }
interface TeamMember { userId: string; name: string; email: string; image: string | null; role: string; skills: StaffSkill[] }

const LEVEL_LABELS: Record<number, string> = { 1: 'Beginner', 2: 'Basic', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert' };
const LEVEL_COLORS: Record<number, string> = {
  1: 'rgba(144,144,144,0.15)',
  2: 'rgba(86,156,214,0.15)',
  3: 'rgba(220,220,170,0.15)',
  4: 'rgba(197,134,192,0.15)',
  5: 'rgba(78,201,176,0.15)',
};
const LEVEL_TEXT: Record<number, string> = { 1: '#909090', 2: '#569cd6', 3: '#dcdcaa', 4: '#c586c0', 5: '#4ec9b0' };

const SKILL_CATEGORIES = ['Technical', 'Design', 'Management', 'Communication', 'Sales', 'Operations', 'Finance', 'Other'];

function LevelStars({ level, onChange }: { level: number; onChange?: (l: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} onClick={() => onChange?.(i)} type="button"
          className={cn('transition-all', onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default')}>
          <Star className="h-4 w-4" fill={i <= level ? LEVEL_TEXT[level] : 'none'} stroke={i <= level ? LEVEL_TEXT[level] : '#555'} />
        </button>
      ))}
    </div>
  );
}

function MemberAvatar({ name, image, size = 32 }: { name: string; image?: string | null; size?: number }) {
  const initials = name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const colors = ['#569cd6', '#c586c0', '#4ec9b0', '#dcdcaa', '#ce9178'];
  const color = colors[(name?.charCodeAt(0) ?? 0) % colors.length];
  return image
    ? <img src={image} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function Skills() {
  const { data: session } = useSession();

  const [tab, setTab] = useState<'my' | 'team' | 'library'>('my');
  const [userRole, setUserRole] = useState('STAFF');
  const [orgId, setOrgId] = useState('');

  // My skills
  const [mySkills, setMySkills] = useState<StaffSkill[]>([]);
  const [library, setLibrary] = useState<Skill[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Add skill form
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [selectedLevel, setSelectedLevel] = useState(3);
  const [selectedYears, setSelectedYears] = useState('');
  const [skillNotes, setSkillNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');

  // Add to library form
  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('Technical');
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [libError, setLibError] = useState('');
  const [skillError, setSkillError] = useState('');

  // Team expand
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  // AI generate skills
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSuggested, setAiSuggested] = useState<{ name: string; category: string }[]>([]);
  const [aiSelected, setAiSelected] = useState<Set<number>>(new Set());
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState('');

  // ── Fetch org ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user?.id) return;
    fetch(`/api/organizations?userId=${session.user.id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.organizations?.[0]) {
          setOrgId(d.organizations[0].id);
          setUserRole(d.organizations[0].role || 'STAFF');
        }
      }).catch(console.error);
  }, [session]);

  const headers = useCallback(() => ({ 'x-org-id': orgId, 'Content-Type': 'application/json' }), [orgId]);

  // Authenticated fetch wrapper — always sends session cookie
  const apiFetch = useCallback((url: string, options: RequestInit = {}) =>
    fetch(url, { ...options, headers: { ...headers(), ...(options.headers as object) }, credentials: 'include' }),
  [headers]);

  // ── Fetch data ───────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!orgId || !session?.user?.id) return;
    setLoading(true);
    try {
      const [libRes, myRes, teamRes] = await Promise.all([
        apiFetch(`/api/skills/library`),
        apiFetch(`/api/skills/staff/${session.user.id}`),
        apiFetch(`/api/skills/team`),
      ]);
      if (libRes.ok) { const d = await libRes.json(); setLibrary(d.skills || []); }
      if (myRes.ok) { const d = await myRes.json(); setMySkills(d.staffSkills || []); }
      if (teamRes.ok) { const d = await teamRes.json(); setTeam(d.team || []); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [orgId, session, apiFetch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Add skill to my profile ───────────────────────────────────────────────
  const handleAddSkill = async () => {
    if (!selectedSkillId) return;
    setSaving(true);
    setSkillError('');
    try {
      const res = await apiFetch('/api/skills/staff', {
        method: 'PUT',
        body: JSON.stringify({ skillId: selectedSkillId, level: selectedLevel, yearsExp: parseFloat(selectedYears) || 0, notes: skillNotes }),
      });
      if (res.ok) {
        await fetchAll();
        setShowAddSkill(false);
        setSelectedSkillId(''); setSelectedLevel(3); setSelectedYears(''); setSkillNotes(''); setSkillSearch('');
      } else {
        const d = await res.json().catch(() => ({}));
        setSkillError(d.error || `Error ${res.status}`);
      }
    } catch (err: any) { setSkillError(err.message || 'Failed to save skill'); } finally { setSaving(false); }
  };

  // ── Remove skill from my profile ──────────────────────────────────────────
  const handleRemoveSkill = async (skillId: string) => {
    try {
      await apiFetch(`/api/skills/staff/${skillId}`, { method: 'DELETE' });
      await fetchAll();
    } catch (err) { console.error(err); }
  };

  // ── AI generate skills ────────────────────────────────────────────────────
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiError('');
    setAiSuggested([]);
    setAiSelected(new Set());
    try {
      const res = await apiFetch('/api/skills/ai-generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const d = await res.json();
      if (!res.ok) { setAiError(d.error || `Error ${res.status}`); return; }
      const suggested = d.skills || [];
      setAiSuggested(suggested);
      setAiSelected(new Set(suggested.map((_: unknown, i: number) => i)));
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate skills');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAiSave = async () => {
    const toSave = aiSuggested.filter((_, i) => aiSelected.has(i));
    if (toSave.length === 0) return;
    setAiSaving(true);
    setAiError('');
    try {
      const res = await apiFetch('/api/skills/library/bulk', {
        method: 'POST',
        body: JSON.stringify({ skills: toSave }),
      });
      if (res.ok) {
        await fetchAll();
        setShowAiGenerate(false);
        setAiPrompt('');
        setAiSuggested([]);
        setAiSelected(new Set());
      } else {
        const d = await res.json().catch(() => ({}));
        setAiError(d.error || `Error ${res.status}`);
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Failed to save skills');
    } finally {
      setAiSaving(false);
    }
  };

  const toggleAiSkill = (i: number) => {
    setAiSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  // ── Add skill to library ──────────────────────────────────────────────────
  const handleAddToLibrary = async () => {
    if (!newSkillName.trim()) return;
    setSavingLibrary(true);
    setLibError('');
    try {
      const res = await apiFetch('/api/skills/library', {
        method: 'POST',
        body: JSON.stringify({ name: newSkillName.trim(), category: newSkillCategory }),
      });
      if (res.ok) {
        await fetchAll();
        setNewSkillName('');
        setShowAddLibrary(false);
      } else {
        const d = await res.json().catch(() => ({}));
        setLibError(d.error || `Error ${res.status}`);
      }
    } catch (err: any) { setLibError(err.message || 'Failed to add skill'); }
    finally { setSavingLibrary(false); }
  };

  // ── Skills not yet in my profile (for add dropdown) ──────────────────────
  const mySkillIds = new Set(mySkills.map(s => s.skillId));
  const availableSkills = library.filter(s => !mySkillIds.has(s.id) &&
    (skillSearch === '' || s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.category.toLowerCase().includes(skillSearch.toLowerCase()))
  );

  const isPrivileged = userRole === 'OWNER' || userRole === 'ADMIN';

  // ── Group my skills by category ───────────────────────────────────────────
  const grouped = mySkills.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, StaffSkill[]>);

  if (loading) {
    return (
      <div className="space-y-8">
        <div><h1 className="text-3xl font-bold gradient-text">Skills</h1><p className="text-muted-foreground mt-2">Loading...</p></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Card key={i} className="glass p-6"><div className="animate-pulse"><div className="h-4 bg-muted rounded w-3/4 mb-3"></div><div className="h-3 bg-muted rounded w-1/2"></div></div></Card>)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Skills</h1>
          <p className="text-muted-foreground mt-1">Manage your skillset and team capabilities</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isPrivileged && (
            <>
              <Button variant="outline" className="glass-surface" onClick={() => setShowAiGenerate(true)}>
                <Sparkles className="h-4 w-4 mr-2 text-yellow-400" />Generate with AI
              </Button>
              <Button variant="outline" className="glass-surface" onClick={() => setShowAddLibrary(true)}>
                <Plus className="h-4 w-4 mr-2" />Add to Library
              </Button>
            </>
          )}
          <Button className="bg-gradient-primary hover:bg-gradient-primary/90 text-white shadow-glow"
            onClick={() => setShowAddSkill(true)}>
            <Plus className="h-4 w-4 mr-2" />Add Skill
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 glass-surface rounded-xl border border-border w-fit">
        {[
          { key: 'my', label: 'My Skills', icon: Star },
          ...(isPrivileged ? [{ key: 'team', label: 'Team Skills', icon: Users }] : []),
          { key: 'library', label: 'Skill Library', icon: Layers },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ── MY SKILLS TAB ── */}
      {tab === 'my' && (
        <div className="space-y-6">
          {mySkills.length === 0 ? (
            <Card className="glass shadow-elevation">
              <CardContent className="py-16 text-center">
                <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No skills added yet</h3>
                <p className="text-muted-foreground mb-6">Add your skills so the AI can assign tasks that match your expertise</p>
                <Button onClick={() => setShowAddSkill(true)} className="bg-gradient-primary text-white">
                  <Plus className="h-4 w-4 mr-2" />Add Your First Skill
                </Button>
              </CardContent>
            </Card>
          ) : (
            Object.entries(grouped).map(([category, skills]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {skills.map(s => (
                    <Card key={s.id} className="glass shadow-elevation border border-border/50 hover:border-primary/30 transition-all">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold">{s.name}</p>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block"
                              style={{ background: LEVEL_COLORS[s.level], color: LEVEL_TEXT[s.level] }}>
                              {LEVEL_LABELS[s.level]}
                            </span>
                          </div>
                          <button onClick={() => handleRemoveSkill(s.skillId)}
                            className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <LevelStars level={s.level} />
                        {s.yearsExp > 0 && <p className="text-xs text-muted-foreground mt-2">{s.yearsExp} yr{s.yearsExp !== 1 ? 's' : ''} experience</p>}
                        {s.notes && <p className="text-xs text-muted-foreground mt-1 italic">{s.notes}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TEAM SKILLS TAB ── */}
      {tab === 'team' && isPrivileged && (
        <div className="space-y-4">
          {team.length === 0 ? (
            <Card className="glass"><CardContent className="py-12 text-center"><p className="text-muted-foreground">No team members found.</p></CardContent></Card>
          ) : (
            team.map(member => (
              <Card key={member.userId} className="glass shadow-elevation">
                <CardContent className="p-0">
                  <button className="w-full flex items-center justify-between p-5 text-left"
                    onClick={() => setExpandedMember(expandedMember === member.userId ? null : member.userId)}>
                    <div className="flex items-center gap-3">
                      <MemberAvatar name={member.name} image={member.image} />
                      <div>
                        <p className="font-semibold">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded font-medium capitalize ml-2"
                        style={member.role === 'ADMIN' ? { background: 'rgba(197,134,192,0.15)', color: '#c586c0' } : { background: 'rgba(78,201,176,0.15)', color: '#4ec9b0' }}>
                        {member.role.toLowerCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">{member.skills.length} skill{member.skills.length !== 1 ? 's' : ''}</span>
                      {member.skills.length > 0 && (
                        <div className="hidden md:flex gap-1 flex-wrap max-w-xs">
                          {member.skills.slice(0, 4).map(s => (
                            <span key={s.skillId} className="text-xs px-2 py-0.5 rounded glass-surface border border-border">{s.name}</span>
                          ))}
                          {member.skills.length > 4 && <span className="text-xs text-muted-foreground">+{member.skills.length - 4}</span>}
                        </div>
                      )}
                      {expandedMember === member.userId ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {expandedMember === member.userId && (
                    <div className="border-t border-border px-5 pb-5 pt-4">
                      {member.skills.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No skills added yet</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {member.skills.map(s => (
                            <div key={s.skillId} className="flex items-center justify-between p-3 glass-surface rounded-lg border border-border/50">
                              <div>
                                <p className="text-sm font-medium">{s.name}</p>
                                <p className="text-xs text-muted-foreground">{s.category}</p>
                              </div>
                              <div className="text-right">
                                <LevelStars level={s.level} />
                                <p className="text-xs mt-1" style={{ color: LEVEL_TEXT[s.level] }}>{LEVEL_LABELS[s.level]}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── SKILL LIBRARY TAB ── */}
      {tab === 'library' && (
        <Card className="glass shadow-elevation">
          <CardHeader>
            <h2 className="text-lg font-semibold">Skill Library ({library.length} skills)</h2>
            <p className="text-sm text-muted-foreground">All skills available in your organisation</p>
          </CardHeader>
          <CardContent>
            {library.length === 0 ? (
              <div className="text-center py-8">
                <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">No skills in library yet</p>
                {isPrivileged && <Button onClick={() => setShowAddLibrary(true)}><Plus className="h-4 w-4 mr-2" />Add First Skill</Button>}
              </div>
            ) : (
              <div className="space-y-6">
                {SKILL_CATEGORIES.map(cat => {
                  const catSkills = library.filter(s => s.category === cat);
                  if (catSkills.length === 0) return null;
                  return (
                    <div key={cat}>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{cat}</h3>
                      <div className="flex flex-wrap gap-2">
                        {catSkills.map(s => (
                          <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 glass-surface rounded-lg border border-border text-sm">
                            <span>{s.name}</span>
                            <span className="text-xs text-muted-foreground">({s._count?.staffSkills || 0})</span>
                            {isPrivileged && (
                              <button onClick={async () => { await apiFetch(`/api/skills/library/${s.id}`, { method: 'DELETE' }); fetchAll(); }}
                                className="text-muted-foreground hover:text-red-400 transition-colors">
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── ADD SKILL MODAL ── */}
      {showAddSkill && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="glass w-full max-w-md shadow-2xl border border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Add Skill to Profile</h2>
                <button onClick={() => setShowAddSkill(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Skill search/select */}
              <div>
                <label className="text-sm font-medium mb-2 block">Select Skill</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input value={skillSearch} onChange={e => setSkillSearch(e.target.value)}
                    placeholder="Search skills..." className="w-full pl-9 pr-4 py-2 glass-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1 rounded-lg border border-border glass-surface p-2">
                  {availableSkills.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {library.length === 0 ? 'No skills in library yet. Ask an admin to add some.' : 'All library skills already added to your profile.'}
                    </p>
                  ) : (
                    availableSkills.map(s => (
                      <button key={s.id} onClick={() => setSelectedSkillId(s.id)}
                        className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all text-left',
                          selectedSkillId === s.id ? 'bg-primary/20 border border-primary/40' : 'hover:bg-muted/30')}>
                        <span>{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.category}</span>
                        {selectedSkillId === s.id && <Check className="h-4 w-4 text-primary ml-2" />}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Proficiency level */}
              <div>
                <label className="text-sm font-medium mb-2 block">Proficiency Level</label>
                <div className="flex items-center gap-3">
                  <LevelStars level={selectedLevel} onChange={setSelectedLevel} />
                  <span className="text-sm font-medium" style={{ color: LEVEL_TEXT[selectedLevel] }}>{LEVEL_LABELS[selectedLevel]}</span>
                </div>
              </div>

              {/* Years experience */}
              <div>
                <label className="text-sm font-medium mb-2 block">Years of Experience <span className="text-muted-foreground">(optional)</span></label>
                <input type="number" min="0" max="50" step="0.5" value={selectedYears} onChange={e => setSelectedYears(e.target.value)}
                  placeholder="e.g. 2.5" className="w-full px-4 py-2 glass-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium mb-2 block">Notes <span className="text-muted-foreground">(optional)</span></label>
                <input type="text" value={skillNotes} onChange={e => setSkillNotes(e.target.value)}
                  placeholder="e.g. Certified, main stack, etc." className="w-full px-4 py-2 glass-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {skillError && <p className="text-sm text-red-400">{skillError}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 glass-surface" onClick={() => { setShowAddSkill(false); setSkillError(''); }}>Cancel</Button>
                <Button className="flex-1 bg-gradient-primary text-white" disabled={!selectedSkillId || saving} onClick={handleAddSkill}>
                  {saving ? 'Saving...' : 'Add Skill'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── AI GENERATE SKILLS MODAL ── */}
      {showAiGenerate && isPrivileged && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="glass w-full max-w-2xl shadow-2xl border border-border max-h-[90vh] flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-400" />
                  <h2 className="text-xl font-semibold">Generate Skills with AI</h2>
                </div>
                <button onClick={() => { setShowAiGenerate(false); setAiSuggested([]); setAiError(''); setAiPrompt(''); }}
                  className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
              <p className="text-sm text-muted-foreground">Describe your team, industry, or role and AI will suggest relevant skills for your library.</p>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto flex-1">

              {/* Prompt input */}
              <div>
                <label className="text-sm font-medium mb-2 block">Describe your team or context</label>
                <textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  rows={3}
                  placeholder="e.g. We're a digital agency specialising in React, Node.js, and mobile apps. We also have project managers and designers."
                  className="w-full px-4 py-2 glass-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <Button
                className="w-full bg-gradient-primary text-white"
                disabled={!aiPrompt.trim() || aiGenerating}
                onClick={handleAiGenerate}>
                {aiGenerating
                  ? <><span className="animate-spin mr-2">⟳</span>Generating…</>
                  : <><Sparkles className="h-4 w-4 mr-2" />Generate Skills</>}
              </Button>

              {aiError && <p className="text-sm text-red-400">{aiError}</p>}

              {/* Suggested skills */}
              {aiSuggested.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{aiSuggested.length} skills suggested — click to deselect</p>
                    <div className="flex gap-2 text-xs">
                      <button className="text-primary hover:underline"
                        onClick={() => setAiSelected(new Set(aiSuggested.map((_, i) => i)))}>
                        Select all
                      </button>
                      <span className="text-muted-foreground">·</span>
                      <button className="text-muted-foreground hover:underline"
                        onClick={() => setAiSelected(new Set())}>
                        Deselect all
                      </button>
                    </div>
                  </div>

                  {/* Group by category */}
                  {Array.from(new Set(aiSuggested.map(s => s.category))).map(cat => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat}</p>
                      <div className="flex flex-wrap gap-2">
                        {aiSuggested.map((s, i) => s.category !== cat ? null : (
                          <button key={i} onClick={() => toggleAiSkill(i)}
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                              aiSelected.has(i)
                                ? 'bg-primary/20 border-primary/40 text-foreground'
                                : 'glass-surface border-border text-muted-foreground line-through opacity-50'
                            )}>
                            {aiSelected.has(i) && <Check className="h-3 w-3 text-primary" />}
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {aiSuggested.length > 0 && (
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1 glass-surface"
                    onClick={() => { setShowAiGenerate(false); setAiSuggested([]); setAiError(''); setAiPrompt(''); }}>
                    Cancel
                  </Button>
                  <Button className="flex-1 bg-gradient-primary text-white"
                    disabled={aiSelected.size === 0 || aiSaving}
                    onClick={handleAiSave}>
                    {aiSaving ? 'Saving…' : `Add ${aiSelected.size} Skill${aiSelected.size !== 1 ? 's' : ''} to Library`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ADD TO LIBRARY MODAL ── */}
      {showAddLibrary && isPrivileged && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="glass w-full max-w-sm shadow-2xl border border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Add Skill to Library</h2>
                <button onClick={() => { setShowAddLibrary(false); setLibError(''); }} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Skill Name</label>
                <input value={newSkillName} onChange={e => setNewSkillName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddToLibrary()}
                  placeholder="e.g. React, Project Management, Figma..."
                  className="w-full px-4 py-2 glass-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Category</label>
                <select value={newSkillCategory} onChange={e => setNewSkillCategory(e.target.value)}
                  className="w-full px-4 py-2 glass-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  {SKILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {libError && <p className="text-sm text-red-400">{libError}</p>}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 glass-surface" onClick={() => { setShowAddLibrary(false); setLibError(''); }}>Cancel</Button>
                <Button className="flex-1 bg-gradient-primary text-white" disabled={!newSkillName.trim() || savingLibrary} onClick={handleAddToLibrary}>
                  {savingLibrary ? 'Adding...' : 'Add Skill'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
