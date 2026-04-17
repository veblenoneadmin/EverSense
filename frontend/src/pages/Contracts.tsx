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

// Old inline template removed — now imported from ../contract-template.ts
const _UNUSED = `
<p></p>
<p><strong><span style="color:#007acc">{Company Name}</span></strong>, a corporation duly organized and existing under and by virtue of the laws of the Philippines, with principal office at Suite 1707 Q1 Tower / 9 Hamilton Ave, Surfers Paradise QLD 4217 Australia ("EMPLOYER/COMPANY")</p>
<p style="text-align:center"><strong>And</strong></p>
<p><strong><span style="color:#007acc">{Employee Name}</span></strong> of legal age, Filipino citizen, with residential address at <strong><span style="color:#007acc">{Employee Address}</span></strong> ("EMPLOYEE").</p>
<h2>WITNESSETH THAT:</h2>
<p>WHEREAS, EMPLOYER is engaged in the business of providing business consultancy, administration, management, and support services including business process management and outsourcing, knowledge process management and outsourcing, enterprise resource planning, customer relationship management, business intelligence, network management and support services, social media management and digital marketing services, infrastructure services for business continuity, facilities management, project management, systems management, data and information gathering, management, processing, development, data and information warehousing and storage, and other technical advisory and ancillary services, as well as all ventures, enterprises, and businesses that are incidental, related, or necessary thereto.</p>
<p>WHEREAS, EMPLOYER is in need of the services of a <strong><span style="color:#007acc">{Job Title}</span></strong>;</p>
<p>WHEREAS, EMPLOYEE represented to be fit for the above-mentioned position and applied with the EMPLOYER. The latter accepted subject to the terms and conditions hereinafter set forth;</p>
<p><strong>Commencement and Scope.</strong> Unless terminated on grounds provided for by law or hereunder, the provisions of this Contract shall be in force and effect starting <strong><span style="color:#007acc">{Start Date}</span></strong> except on the provisions under Annex "D" which shall be immediately in force and effect upon the signing of the Contract.</p>
<p>The EMPLOYER and the EMPLOYEE hereby agree as follows:</p>
<h2>PROBATIONARY EMPLOYMENT</h2>
<p>EMPLOYEE'S performance during the engagement period shall be evaluated by the CLIENT based on agreed deliverables, timelines, and quality standards. Evaluation may be conducted by the CLIENT's designated representative or project manager. Reviews of the EMPLOYEE's work may be performed periodically, including on or before the fifth (5th) month from the commencement date of this engagement, and thereafter at intervals as mutually agreed upon by both parties.</p>
<p>The EMPLOYEE acknowledges that the CLIENT retains the sole discretion to assess the EMPLOYEE's performance and determine whether the engagement shall continue. In the event that the EMPLOYEE fails to meet the agreed standards or deliverables, the CLIENT may terminate this Agreement, subject to the terms and conditions on termination and applicable notice provisions as stipulated herein.</p>
<p>If EMPLOYEE fails to meet the attached standards set forth by EMPLOYER under Annex "B" or should there be just or authorized cause, EMPLOYER may terminate this Contract, subject to observance of due process.</p>
<h2>REGULAR EMPLOYMENT</h2>
<p>In case of regularization:</p>
<ul>
<li>Confirmation from probationary into regular status shall be through written notice;</li>
<li>EMPLOYEE'S performance evaluation shall thereafter be conducted at every (6) months interval &amp;/or as agreed schedule with your immediate superior.</li>
</ul>
<h2>CODE OF DISCIPLINE</h2>
<p>All existing as well as future rules and regulations that may be issued by EMPLOYER from time to time, are hereby deemed incorporated in this Contract. EMPLOYEE acknowledges that it is his duty and responsibility to fully comply with these in good faith, as well as the appropriate and reasonable rules and regulations of EMPLOYER's CLIENT, particularly when rendering the services within the premises of the CLIENT.</p>
<p>EMPLOYEE shall strictly comply with the Policy on Attendance and other directives pertaining to timekeeping and leave from work. Thus, EMPLOYEE is required to input hours of worked into the timekeeping system on a daily basis. Failure to comply would result to the following:</p>
<ul>
<li>It shall affect the performance appraisal;</li>
<li>Missing activity entry in timesheet shall be considered absent without pay.</li>
</ul>
<h2>DISCIPLINARY MEASURES</h2>
<p>Upon signing this Contract, EMPLOYEE hereby recognizes EMPLOYER's right to impose disciplinary measures or sanctions, which include, but are not limited to, termination of employment, suspensions, loss of privileges, for any and all infractions, acts or omissions, or violations of EMPLOYER rules and regulations, code of conduct and behavior, and similar issuances, including amendments thereof.</p>
<h2>BUSINESS CODE OF CONDUCT</h2>
<p>During employment, EMPLOYEE shall not, except with the knowledge and written consent of EMPLOYER, embark, engage, or interest himself whether for reward or gratuitously, in any activity, business undertaking or employment which would interfere with EMPLOYEE's duties in the Company or which will constitute a conflict of interest with EMPLOYER or any of its CLIENT.</p>
<p>The EMPLOYEE is expected to carry out, faithfully and conscientiously all assigned duties and responsibilities either by his immediate superior or any person duly authorized. EMPLOYEE shall act and represent at all times the interest of the EMPLOYER and the CLIENT.</p>
<h2>GROUNDS FOR TERMINATION</h2>
<p>Aside from the just and authorized causes for termination of employment enumerated under Articles 282 to 284 of the Labor Code, the following acts and/or omissions of the EMPLOYEE shall, without limitation, similarly constitute grounds for the termination of employment by the EMPLOYER and/or grounds for the EMPLOYER to impose disciplinary measures on the EMPLOYEE:</p>
<ul>
<li>Intentional or unintentional violation of EMPLOYER's policies, rules and regulations;</li>
<li>EMPLOYEE's incompetence or inefficiency in his duties to the prejudice of EMPLOYER;</li>
<li>Serious misuse or abuse of EMPLOYER'S and CLIENT'S property, facilities and/or resources;</li>
<li>Commission of an act which may constitute a crime or offense against a fellow officer, co-EMPLOYEE, CLIENT or the EMPLOYER itself;</li>
<li>Intentional or unintentional disregard of the disciplinary measures or sanctions imposed by the EMPLOYER;</li>
<li>Failure to attain a satisfactory review in any performance evaluation conducted by EMPLOYER;</li>
<li>Directly or indirectly participating, engaging, and/or entering into personal business arrangement involving EMPLOYER'S products and/or services or the products and/or services of EMPLOYER's competitors;</li>
<li>Intentional or unintentional violation of breach of Confidentiality of Information belonging to EMPLOYER and/or CLIENT;</li>
<li>EMPLOYEE's employment is conditional upon the completion of his pre-requirements, such as but not limited to, medical test and background checking investigation;</li>
<li>Other similar acts, omissions, and/or events.</li>
</ul>
<p>Upon termination of employment, EMPLOYEE shall promptly account for, return, and deliver to EMPLOYER at the latter's office, his identification card/s and all company property which may have been assigned or entrusted to his care.</p>
<h2>CONFIDENTIALITY AND DATA PRIVACY</h2>
<p>It is EMPLOYEE'S responsibility to ensure that no information gained by virtue of employment with EMPLOYER is disclosed to outsiders unless necessary for business purposes and pursuant to properly approved and written agreements.</p>
<p>EMPLOYEE is expected to act faithfully and keep confidential all information of the EMPLOYER and CLIENT which the EMPLOYEE has access to in the course of his employment. This obligation of confidentiality shall extend beyond EMPLOYEE'S employment with EMPLOYER.</p>
<h2>PROPRIETARY RIGHTS</h2>
<p>EMPLOYEE agrees that the proprietary rights in any or all inventions, designs, applications, work systems, which EMPLOYEE himself or with others, wholly or partly made or developed during his employment with EMPLOYER, shall be the exclusive property of EMPLOYER.</p>
<h2>EXIT CLAUSE</h2>
<p>Either party may terminate this Contract prior to its expiration by providing written notice to the other party at least thirty (30) days in advance, unless a different notice period is mutually agreed upon in writing.</p>
<h2>ENTIRE AGREEMENT</h2>
<p>This Contract represents the entire agreement between the Parties and supersedes all previous oral or written communications, representations or agreements between them.</p>
<h2>MISCELLANEOUS</h2>
<ul>
<li><strong>Governing Law.</strong> This Contract shall be governed by the laws of the Philippines.</li>
<li><strong>Assignment.</strong> Neither this Contract nor any rights or obligations hereunder may be assigned by either party without the other party's prior written consent.</li>
<li><strong>Severability.</strong> In the event any provision of this Contract is found to be unenforceable, such provision shall be modified to the extent necessary to make it enforceable.</li>
<li><strong>No Waiver.</strong> Failure by either party to exercise any rights contained in this Contract shall not be construed as a waiver of such rights.</li>
</ul>
<h2>ANNEXURES</h2>
<ul>
<li>Annex "A" – Compensation</li>
<li>Annex "B" – Duties and Responsibilities</li>
<li>Annex "C" – Paid Time-Off (PTO) Conversion to Cash Guidelines</li>
<li>Annex "D" – Additional Terms &amp; Conditions</li>
<li>Annex "E" – Privacy Policy for Employees</li>
</ul>
<br/>
<p><strong>IN WITNESS WHEREOF</strong>, the parties have executed this Contract:</p>
<br/>
<table style="width:100%;border:none">
<tr>
<td style="width:50%;padding:10px"><p>By:</p><br/><p>___________________________</p><p><strong>{Company Name}</strong></p><p>Director / Owner</p><br/><p>Date: _______________</p></td>
<td style="width:50%;padding:10px"><p>By:</p><br/><p>___________________________</p><p><strong>{Employee Name}</strong></p><p><strong><span style="color:#007acc">{Job Title}</span></strong></p><br/><p>Date: _______________</p></td>
</tr>
</table>
`;

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
    if (!newTitle.trim()) return;
    try {
      const data = await apiClient.fetch('/api/contracts', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle, content: DEFAULT_CONTRACT_HTML }),
      });
      setShowNew(false);
      setNewTitle('');
      showToast('Contract created');
      await fetchContracts();
      // Open it for editing immediately
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
          <div className="w-full max-w-sm rounded-xl p-6" style={{ background: VS.bg0, border: `1px solid ${VS.border}` }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold" style={{ color: VS.text0 }}>New Contract</h3>
              <button onClick={() => setShowNew(false)} className="opacity-50 hover:opacity-100"><X className="h-4 w-4" style={{ color: VS.text1 }} /></button>
            </div>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus
              placeholder="Contract title…"
              className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#007acc]/50 mb-4"
              style={{ background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text0 }}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-white/5"
                style={{ border: `1px solid ${VS.border}`, color: VS.text1 }}>Cancel</button>
              <button onClick={handleCreate} disabled={!newTitle.trim()}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: VS.accent, color: '#fff' }}>Create</button>
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
