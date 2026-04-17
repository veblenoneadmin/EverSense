import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import {
  Plus, FileText, Trash2, Save, X, Search, ArrowLeft,
  Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Heading1, Heading2, Type, Undo2, Redo2, CheckCircle, AlertTriangle,
} from 'lucide-react';
import { VS } from '../lib/theme';
import { DEFAULT_CONTRACT_HTML } from '../contract-template';

const inp = 'w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#007acc]/50 transition-all';
const inpS: React.CSSProperties = { background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text0 };

interface Contract {
  id: string;
  title: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
}

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  draft:     { color: VS.text2,  label: 'Draft'     },
  active:    { color: VS.teal,   label: 'Active'    },
  archived:  { color: VS.orange, label: 'Archived'  },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Toolbar button ──────────────────────────────────────────────────────────
function ToolBtn({ icon: Icon, label, onClick, active }: {
  icon: React.ElementType; label: string; onClick: () => void; active?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} title={label}
      className="h-7 w-7 rounded flex items-center justify-center transition-all hover:bg-white/10"
      style={{ color: active ? VS.accent : VS.text2, background: active ? `${VS.accent}22` : 'transparent' }}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// ── Rich Text Editor ────────────────────────────────────────────────────────
function DocsEditor({ content, onChange }: { content: string; onChange: (html: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (editorRef.current && !initialized.current) {
      editorRef.current.innerHTML = content || '';
      initialized.current = true;
    }
  }, [content]);

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const handleInput = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  return (
    <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: VS.bg1, border: `1px solid ${VS.border}`, minHeight: '60vh' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-2 flex-wrap" style={{ borderBottom: `1px solid ${VS.border}`, background: VS.bg2 }}>
        <ToolBtn icon={Undo2} label="Undo" onClick={() => exec('undo')} />
        <ToolBtn icon={Redo2} label="Redo" onClick={() => exec('redo')} />
        <div className="w-px h-5 mx-1" style={{ background: VS.border }} />
        <ToolBtn icon={Heading1} label="Heading 1" onClick={() => exec('formatBlock', 'H1')} />
        <ToolBtn icon={Heading2} label="Heading 2" onClick={() => exec('formatBlock', 'H2')} />
        <ToolBtn icon={Type} label="Paragraph" onClick={() => exec('formatBlock', 'P')} />
        <div className="w-px h-5 mx-1" style={{ background: VS.border }} />
        <ToolBtn icon={Bold} label="Bold" onClick={() => exec('bold')} />
        <ToolBtn icon={Italic} label="Italic" onClick={() => exec('italic')} />
        <ToolBtn icon={Underline} label="Underline" onClick={() => exec('underline')} />
        <div className="w-px h-5 mx-1" style={{ background: VS.border }} />
        <ToolBtn icon={List} label="Bullet List" onClick={() => exec('insertUnorderedList')} />
        <ToolBtn icon={ListOrdered} label="Numbered List" onClick={() => exec('insertOrderedList')} />
        <div className="w-px h-5 mx-1" style={{ background: VS.border }} />
        <ToolBtn icon={AlignLeft} label="Align Left" onClick={() => exec('justifyLeft')} />
        <ToolBtn icon={AlignCenter} label="Align Center" onClick={() => exec('justifyCenter')} />
        <ToolBtn icon={AlignRight} label="Align Right" onClick={() => exec('justifyRight')} />
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="flex-1 p-6 outline-none overflow-y-auto"
        style={{
          color: '#1a1a1a',
          background: '#ffffff',
          fontSize: '14px',
          lineHeight: 1.8,
          minHeight: '50vh',
        }}
      />
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export function Contracts() {
  const { data: session } = useSession();
  const apiClient = useApiClient();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Editor state
  const [editing, setEditing] = useState<Contract | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editStatus, setEditStatus] = useState('draft');
  const [saving, setSaving] = useState(false);

  // New contract
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newEmployee, setNewEmployee] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newJobDesc, setNewJobDesc] = useState('');
  const [newCompany, setNewCompany] = useState('Veblen Group');

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchContracts = useCallback(async () => {
    try {
      const data = await apiClient.fetch('/api/contracts');
      setContracts(data.contracts || []);
    } catch { }
    finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (session?.user?.id) fetchContracts(); }, [session?.user?.id, fetchContracts]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newEmployee.trim()) return;
    try {
      // Replace placeholders with actual employee data
      const startDateFmt = newStartDate
        ? new Date(newStartDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
        : '_______________';
      let filled = DEFAULT_CONTRACT_HTML
        .replace(/\{Company Name\}/g, newCompany || 'Veblen Group')
        .replace(/\{Employee Name\}/g, newEmployee)
        .replace(/\{Employee Address\}/g, newAddress || '_______________')
        .replace(/\{Job Title\}/g, newJobTitle || '_______________')
        .replace(/\{Start Date\}/g, startDateFmt);
      // Insert job description into Annex B
      if (newJobDesc.trim()) {
        filled = filled.replace(
          '<p><strong>JOB OVERVIEW</strong> <em>(For updating)</em></p>',
          `<p><strong>JOB OVERVIEW</strong></p>\n<p>${newJobDesc.replace(/\n/g, '</p>\n<p>')}</p>`
        );
      }
      const data = await apiClient.fetch('/api/contracts', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle, content: filled }),
      });
      setShowNew(false);
      setNewTitle(''); setNewEmployee(''); setNewAddress(''); setNewJobTitle('');
      setNewStartDate(''); setNewJobDesc(''); setNewCompany('Veblen Group');
      showToast('Contract created');
      await fetchContracts();
      const res = await apiClient.fetch(`/api/contracts/${data.id}`);
      openEditor(res.contract);
    } catch (err: any) { showToast(err.message || 'Failed to create', false); }
  };

  const openEditor = (c: Contract) => {
    setEditing(c);
    setEditTitle(c.title);
    setEditContent(c.content || '');
    setEditStatus(c.status);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await apiClient.fetch(`/api/contracts/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: editTitle, content: editContent, status: editStatus }),
      });
      showToast('Contract saved');
      fetchContracts();
      setEditing(prev => prev ? { ...prev, title: editTitle, content: editContent, status: editStatus } : null);
    } catch (err: any) { showToast(err.message || 'Failed to save', false); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await apiClient.fetch(`/api/contracts/${id}`, { method: 'DELETE' });
      showToast('Contract deleted');
      if (editing?.id === id) setEditing(null);
      fetchContracts();
    } catch (err: any) { showToast(err.message || 'Failed to delete', false); }
  };

  const filtered = contracts.filter(c =>
    !search || c.title.toLowerCase().includes(search.toLowerCase())
  );

  // ── Editor view ──
  if (editing) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setEditing(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all hover:bg-white/5"
            style={{ border: `1px solid ${VS.border}`, color: VS.text1 }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg text-[15px] font-bold focus:outline-none focus:ring-1 focus:ring-[#007acc]/50"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0, minWidth: 200 }}
            placeholder="Contract title…"
          />
          <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium focus:outline-none"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: STATUS_CFG[editStatus]?.color || VS.text2 }}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-all hover:opacity-90"
            style={{ background: VS.accent, color: '#fff' }}>
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Editor */}
        <DocsEditor content={editContent} onChange={setEditContent} />

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] shadow-xl"
            style={{ background: toast.ok ? 'rgba(78,201,176,0.15)' : 'rgba(244,71,71,0.15)', border: `1px solid ${toast.ok ? VS.teal : VS.red}`, color: toast.ok ? VS.teal : VS.red }}>
            {toast.ok ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {toast.msg}
          </div>
        )}
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: VS.text0 }}>Contracts</h1>
          <p className="text-[13px] mt-1" style={{ color: VS.text2 }}>
            {contracts.length} contract template{contracts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: VS.text2 }} />
            <input className="pl-9 pr-3 py-2 rounded-lg text-[13px] w-56 focus:outline-none focus:ring-1 focus:ring-[#007acc]/50"
              style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }}
              placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90"
            style={{ background: VS.accent, color: '#fff' }}>
            <Plus className="h-4 w-4" />
            New Contract
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid #3c3c3c', borderTopColor: VS.accent }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
          <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: VS.text2, opacity: 0.4 }} />
          <p className="text-[14px] font-medium" style={{ color: VS.text1 }}>
            {contracts.length === 0 ? 'No contracts yet' : 'No matches'}
          </p>
          <p className="text-[12px] mt-1" style={{ color: VS.text2 }}>
            Click "New Contract" to create your first template.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const st = STATUS_CFG[c.status] || STATUS_CFG.draft;
            return (
              <div key={c.id}
                onClick={() => { apiClient.fetch(`/api/contracts/${c.id}`).then(d => openEditor(d.contract)).catch(() => {}); }}
                className="rounded-xl p-5 cursor-pointer transition-all hover:brightness-105"
                style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 shrink-0" style={{ color: VS.accent }} />
                    <h3 className="text-[14px] font-bold truncate" style={{ color: VS.text0 }}>{c.title}</h3>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                    style={{ background: `${st.color}18`, color: st.color }}>{st.label}</span>
                </div>
                <div className="text-[11px] space-y-1" style={{ color: VS.text2 }}>
                  <p>Created {fmtDate(c.createdAt)} {c.createdByName ? `by ${c.createdByName}` : ''}</p>
                  <p>Last edited {fmtDate(c.updatedAt)} {c.updatedByName ? `by ${c.updatedByName}` : ''}</p>
                </div>
                <div className="flex items-center justify-end mt-3 pt-3" style={{ borderTop: `1px solid ${VS.border}` }}>
                  <button onClick={e => { e.stopPropagation(); handleDelete(c.id, c.title); }}
                    className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition-all" style={{ color: VS.red }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Contract Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowNew(false); }}>
          <div className="w-full max-w-lg rounded-xl overflow-hidden" style={{ background: VS.bg0, border: `1px solid ${VS.border}`, maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${VS.border}`, background: VS.bg1 }}>
              <h3 className="text-[15px] font-bold" style={{ color: VS.text0 }}>New Contract</h3>
              <button onClick={() => setShowNew(false)} className="opacity-50 hover:opacity-100"><X className="h-4 w-4" style={{ color: VS.text1 }} /></button>
            </div>
            <div className="p-6 space-y-3 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              <p className="text-[12px]" style={{ color: VS.text2 }}>
                Fill in the employee details below. These will be inserted into the contract template automatically.
              </p>
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: VS.text2 }}>Contract Title *</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus placeholder="e.g. Employment Contract — Jane Smith"
                  className={inp} style={inpS} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold mb-1" style={{ color: VS.text2 }}>Company Name</label>
                  <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Veblen Group"
                    className={inp} style={inpS} />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold mb-1" style={{ color: VS.text2 }}>Employee Name *</label>
                  <input value={newEmployee} onChange={e => setNewEmployee(e.target.value)} placeholder="Full legal name"
                    className={inp} style={inpS} />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: VS.text2 }}>Employee Address</label>
                <input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="Full residential address"
                  className={inp} style={inpS} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold mb-1" style={{ color: VS.text2 }}>Job Title / Position</label>
                  <input value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} placeholder="e.g. Senior Bookkeeper"
                    className={inp} style={inpS} />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold mb-1" style={{ color: VS.text2 }}>Start Date</label>
                  <input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)}
                    className={inp} style={inpS} />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: VS.text2 }}>Job Description (Annex B)</label>
                <textarea value={newJobDesc} onChange={e => setNewJobDesc(e.target.value)} rows={3}
                  placeholder="Duties, responsibilities, and scope of work…"
                  className={inp} style={{ ...inpS, resize: 'vertical' }} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: `1px solid ${VS.border}`, background: VS.bg1 }}>
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-white/5"
                style={{ border: `1px solid ${VS.border}`, color: VS.text1 }}>Cancel</button>
              <button onClick={handleCreate} disabled={!newTitle.trim() || !newEmployee.trim()}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: VS.accent, color: '#fff' }}>Create Contract</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] shadow-xl"
          style={{ background: toast.ok ? 'rgba(78,201,176,0.15)' : 'rgba(244,71,71,0.15)', border: `1px solid ${toast.ok ? VS.teal : VS.red}`, color: toast.ok ? VS.teal : VS.red }}>
          {toast.ok ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
