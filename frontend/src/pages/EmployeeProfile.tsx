import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import { User, Phone, Briefcase, Landmark, Save, CheckCircle, AlertTriangle, Heart, Users, Upload, FileText, X, ArrowLeft, ArrowRight, Download, PenTool } from 'lucide-react';
import { VS } from '../lib/theme';

const inputCls = 'w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#007acc]/50 transition-all';
const inputStyle: React.CSSProperties = { background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text0 };
const labelCls = 'block text-[12px] font-semibold mb-1.5';

interface Profile {
  legalName: string; streetAddress: string; city: string; state: string; postcode: string; country: string;
  homePhone: string; cellPhone: string; emailAddress: string; sssId: string; dateOfBirth: string;
  maritalStatus: string; spouseName: string; spouseEmployer: string; spouseWorkPhone: string;
  jobTitle: string; supervisor: string; client: string; workEmail: string; workCellPhone: string;
  startDate: string; salary: string; employmentType: string;
  emergencyContactName: string; emergencyContactAddress: string;
  emergencyContactPhone: string; emergencyContactCell: string; emergencyContactRelation: string;
  bankName: string; accountNumber: string; wiseUsername: string;
  ref1Name: string; ref1Phone: string; ref1Relationship: string;
  ref2Name: string; ref2Phone: string; ref2Relationship: string;
  ref3Name: string; ref3Phone: string; ref3Relationship: string;
  validIdUrl: string; validIdFilename: string;
  contractSignature: string; contractSignedAt: string;
}

const EMPTY: Profile = {
  legalName: '', streetAddress: '', city: '', state: '', postcode: '', country: 'Australia',
  homePhone: '', cellPhone: '', emailAddress: '', sssId: '', dateOfBirth: '',
  maritalStatus: '', spouseName: '', spouseEmployer: '', spouseWorkPhone: '',
  jobTitle: '', supervisor: '', client: '', workEmail: '', workCellPhone: '',
  startDate: '', salary: '', employmentType: 'full-time',
  emergencyContactName: '', emergencyContactAddress: '',
  emergencyContactPhone: '', emergencyContactCell: '', emergencyContactRelation: '',
  bankName: '', accountNumber: '', wiseUsername: '',
  ref1Name: '', ref1Phone: '', ref1Relationship: '',
  ref2Name: '', ref2Phone: '', ref2Relationship: '',
  ref3Name: '', ref3Phone: '', ref3Relationship: '',
  validIdUrl: '', validIdFilename: '',
  contractSignature: '', contractSignedAt: '',
};

function Field({ label, value, onChange, type = 'text', placeholder, colSpan }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; colSpan?: string;
}) {
  return (
    <div className={colSpan || ''}>
      <label className={labelCls} style={{ color: VS.text2 }}>{label}</label>
      <input className={inputCls} style={inputStyle} type={type} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ── Signature Pad (draw or upload) ────────────────────────────────────────────
function SignaturePad({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  const getCtx = () => canvasRef.current?.getContext('2d') || null;

  const clearCanvas = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || !canvasRef.current) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    onChange('');
  }, [onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (value && value.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
      img.src = value;
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDrawing(true);
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    if (canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'));
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${VS.border2}`, background: '#fff' }}>
        <canvas
          ref={canvasRef}
          width={460} height={160}
          className="w-full cursor-crosshair"
          style={{ touchAction: 'none', display: 'block' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={clearCanvas}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-90"
          style={{ background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text2 }}>
          Clear
        </button>
        <span className="text-[11px]" style={{ color: VS.text2 }}>or</span>
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all hover:opacity-90"
          style={{ background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text2 }}>
          <Upload className="h-3 w-3" />
          Upload Signature
          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result as string);
            reader.readAsDataURL(file);
          }} />
        </label>
        {value && <span className="text-[11px] ml-auto" style={{ color: VS.teal }}>Signature captured</span>}
      </div>
    </div>
  );
}

// ── Contract Step (view + download + sign) ───────────────────────────────────
function ContractStep({ form, setForm, api }: { form: Profile; setForm: React.Dispatch<React.SetStateAction<Profile>>; api: any }) {
  const [contractHtml, setContractHtml] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [loadingContract, setLoadingContract] = useState(false);

  const viewContract = async () => {
    setLoadingContract(true);
    try {
      const data = await api.fetch('/api/employee-profiles/contract?format=html');
      setContractHtml(data.html);
      setViewOpen(true);
    } catch { setContractHtml('<p>Failed to load contract. Please try again.</p>'); setViewOpen(true); }
    finally { setLoadingContract(false); }
  };

  const downloadContract = async () => {
    try {
      const res = await fetch('/api/employee-profiles/contract', { credentials: 'include' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Employment_Contract_${(form.legalName || 'Employee').replace(/\s+/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Failed to download contract'); }
  };

  return (
    <>
      <div className="sm:col-span-2 space-y-5">
        {/* Contract header */}
        <div className="rounded-lg p-4" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
          <p className="text-[13px] font-medium mb-1" style={{ color: VS.text0 }}>Employment Contract</p>
          {form.legalName && (
            <p className="text-[14px] font-bold mb-2" style={{ color: VS.accent }}>For: {form.legalName}</p>
          )}
          <p className="text-[12px] mb-3" style={{ color: VS.text2 }}>
            Your details have been filled into the contract. View or download it before signing.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={viewContract} disabled={loadingContract}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: VS.accent, color: '#fff' }}>
              <FileText className="h-4 w-4" />
              {loadingContract ? 'Loading…' : 'View Contract'}
            </button>
            <button onClick={downloadContract}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-90"
              style={{ background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text1 }}>
              <Download className="h-4 w-4" />
              Download (.docx)
            </button>
          </div>
        </div>

        {/* Signed notice */}
        {form.contractSignedAt && (
          <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: 'rgba(78,201,176,0.1)', border: `1px solid ${VS.teal}44` }}>
            <CheckCircle className="h-4 w-4" style={{ color: VS.teal }} />
            <span className="text-[12px]" style={{ color: VS.teal }}>
              Contract signed on {new Date(form.contractSignedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              {form.legalName ? ` by ${form.legalName}` : ''}
            </span>
          </div>
        )}

        {/* Signature */}
        <div>
          <p className="text-[13px] font-medium mb-2" style={{ color: VS.text0 }}>Your Signature</p>
          <p className="text-[12px] mb-3" style={{ color: VS.text2 }}>Draw your signature below or upload an image.</p>
          <SignaturePad
            value={form.contractSignature}
            onChange={(dataUrl) => setForm(prev => ({
              ...prev,
              contractSignature: dataUrl,
              contractSignedAt: dataUrl ? new Date().toISOString() : '',
            }))}
          />
          {form.contractSignature && (
            <div className="mt-3 pt-3 text-center" style={{ borderTop: `1px solid ${VS.border}` }}>
              <p className="text-[14px] font-semibold" style={{ color: VS.text0 }}>{form.legalName || 'Name not provided'}</p>
              <p className="text-[11px]" style={{ color: VS.text2 }}>
                {form.jobTitle ? `${form.jobTitle} — ` : ''}Signed {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* View Contract Modal */}
      {viewOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={e => { if (e.target === e.currentTarget) setViewOpen(false); }}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col" style={{ background: '#fff', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ background: VS.bg1, borderBottom: `1px solid ${VS.border}` }}>
              <span className="text-[14px] font-bold" style={{ color: VS.text0 }}>Employment Contract — {form.legalName || 'Preview'}</span>
              <button onClick={() => setViewOpen(false)} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-white/10" style={{ color: VS.text1 }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8" style={{ color: '#1a1a1a', fontSize: '13px', lineHeight: 1.7 }}
              dangerouslySetInnerHTML={{ __html: contractHtml || '' }} />
          </div>
        </div>
      )}
    </>
  );
}

const STEPS = [
  { id: 'personal', label: 'Employee Info', icon: User },
  { id: 'spouse', label: 'Spouse', icon: Heart },
  { id: 'job', label: 'Job Info', icon: Briefcase },
  { id: 'emergency', label: 'Emergency Contact', icon: Phone },
  { id: 'bank', label: 'Bank Details', icon: Landmark },
  { id: 'references', label: 'References', icon: Users },
  { id: 'id', label: 'Valid ID', icon: FileText },
  { id: 'contract', label: 'Contract', icon: PenTool },
];

export function EmployeeProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: session } = useSession();
  const apiClient = useApiClient();
  const [form, setForm] = useState<Profile>(EMPTY);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!open || !session?.user?.id) return;
    setLoading(true);
    apiClient.fetch('/api/employee-profiles/me')
      .then((d: any) => {
        if (d.profile) {
          const p = d.profile;
          const out: any = { ...EMPTY };
          for (const k of Object.keys(EMPTY)) {
            if (p[k] != null) {
              if ((k === 'dateOfBirth' || k === 'startDate') && p[k]) {
                out[k] = new Date(p[k]).toISOString().split('T')[0];
              } else {
                out[k] = String(p[k]);
              }
            }
          }
          setForm(out);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof Profile) => (v: string) => setForm(prev => ({ ...prev, [field]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.fetch('/api/employee-profiles/me', { method: 'PUT', body: JSON.stringify(form) });
      setToast({ msg: 'Profile saved successfully', ok: true });
      setTimeout(() => { setToast(null); onClose(); }, 1500);
    } catch (err: any) {
      setToast({ msg: err.message || 'Failed to save', ok: false });
      setTimeout(() => setToast(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl rounded-2xl overflow-hidden flex flex-col" style={{ background: VS.bg0, border: `1px solid ${VS.border}`, maxHeight: '90vh', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ background: VS.bg1, borderBottom: `1px solid ${VS.border}` }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: VS.text0 }}>Employee Profile</h2>
            <p className="text-[11px] mt-0.5" style={{ color: VS.text2 }}>Step {step + 1} of {STEPS.length} — {current.label}</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: VS.text1 }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 px-6 py-3 shrink-0" style={{ borderBottom: `1px solid ${VS.border}` }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <button key={s.id} onClick={() => setStep(i)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                style={{
                  background: active ? `${VS.accent}22` : 'transparent',
                  color: active ? VS.accent : done ? VS.teal : VS.text2,
                  border: `1px solid ${active ? VS.accent + '44' : 'transparent'}`,
                }}>
                <Icon className="h-3 w-3" />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid #3c3c3c', borderTopColor: VS.accent }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {step === 0 && <>
                <Field label="Full Name" value={form.legalName} onChange={set('legalName')} placeholder="As shown on ID" colSpan="sm:col-span-2" />
                <Field label="Date of Birth" value={form.dateOfBirth} onChange={set('dateOfBirth')} type="date" />
                <Field label="SSS Id" value={form.sssId} onChange={set('sssId')} placeholder="SSS number" />
                <Field label="Home Phone" value={form.homePhone} onChange={set('homePhone')} placeholder="+61 2 0000 0000" />
                <Field label="Cell Phone" value={form.cellPhone} onChange={set('cellPhone')} placeholder="+61 400 000 000" />
                <Field label="Email Address" value={form.emailAddress} onChange={set('emailAddress')} type="email" placeholder="personal@email.com" />
                <Field label="Marital Status" value={form.maritalStatus} onChange={set('maritalStatus')} placeholder="Single, Married, etc." />
                <Field label="Street Address" value={form.streetAddress} onChange={set('streetAddress')} placeholder="123 Example Street" colSpan="sm:col-span-2" />
                <Field label="City / Suburb" value={form.city} onChange={set('city')} placeholder="Sydney" />
                <Field label="State" value={form.state} onChange={set('state')} placeholder="NSW" />
                <Field label="Postcode" value={form.postcode} onChange={set('postcode')} placeholder="2000" />
              </>}

              {step === 1 && <>
                <Field label="Spouse's Name" value={form.spouseName} onChange={set('spouseName')} colSpan="sm:col-span-2" />
                <Field label="Spouse's Employer" value={form.spouseEmployer} onChange={set('spouseEmployer')} />
                <Field label="Spouse's Work Phone" value={form.spouseWorkPhone} onChange={set('spouseWorkPhone')} />
              </>}

              {step === 2 && <>
                <Field label="Job Title" value={form.jobTitle} onChange={set('jobTitle')} />
                <Field label="Supervisor" value={form.supervisor} onChange={set('supervisor')} />
                <Field label="Client" value={form.client} onChange={set('client')} />
                <Field label="E-mail Address" value={form.workEmail} onChange={set('workEmail')} type="email" />
                <Field label="Cell Phone" value={form.workCellPhone} onChange={set('workCellPhone')} />
                <Field label="Start Date" value={form.startDate} onChange={set('startDate')} type="date" />
              </>}

              {step === 3 && <>
                <Field label="Full Name" value={form.emergencyContactName} onChange={set('emergencyContactName')} colSpan="sm:col-span-2" />
                <Field label="Address" value={form.emergencyContactAddress} onChange={set('emergencyContactAddress')} colSpan="sm:col-span-2" />
                <Field label="Primary Phone" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} />
                <Field label="Cell Phone" value={form.emergencyContactCell} onChange={set('emergencyContactCell')} />
                <Field label="Relationship" value={form.emergencyContactRelation} onChange={set('emergencyContactRelation')} placeholder="Spouse, Parent, etc." />
              </>}

              {step === 4 && <>
                <Field label="Bank Name" value={form.bankName} onChange={set('bankName')} placeholder="e.g. Commonwealth Bank" />
                <Field label="Account Number" value={form.accountNumber} onChange={set('accountNumber')} />
                <Field label="Wise Username" value={form.wiseUsername} onChange={set('wiseUsername')} placeholder="@username" colSpan="sm:col-span-2" />
              </>}

              {step === 5 && <>
                <Field label="Reference 1 — Name" value={form.ref1Name} onChange={set('ref1Name')} />
                <Field label="Reference 1 — Phone" value={form.ref1Phone} onChange={set('ref1Phone')} />
                <Field label="Reference 1 — Relationship" value={form.ref1Relationship} onChange={set('ref1Relationship')} colSpan="sm:col-span-2" />
                <Field label="Reference 2 — Name" value={form.ref2Name} onChange={set('ref2Name')} />
                <Field label="Reference 2 — Phone" value={form.ref2Phone} onChange={set('ref2Phone')} />
                <Field label="Reference 2 — Relationship" value={form.ref2Relationship} onChange={set('ref2Relationship')} colSpan="sm:col-span-2" />
                <Field label="Reference 3 — Name" value={form.ref3Name} onChange={set('ref3Name')} />
                <Field label="Reference 3 — Phone" value={form.ref3Phone} onChange={set('ref3Phone')} />
                <Field label="Reference 3 — Relationship" value={form.ref3Relationship} onChange={set('ref3Relationship')} colSpan="sm:col-span-2" />
              </>}

              {step === 6 && <>
                <div className="sm:col-span-2">
                  <p className="text-[12px] mb-3" style={{ color: VS.text2 }}>
                    Upload a photo or scan of a valid government ID (passport, driver's license, etc.)
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all hover:opacity-90"
                      style={{ background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text1 }}>
                      <Upload className="h-4 w-4" />
                      Choose File
                      <input type="file" accept="image/*,.pdf" className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            setForm(prev => ({ ...prev, validIdUrl: reader.result as string, validIdFilename: file.name }));
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {form.validIdFilename && <span className="text-[12px]" style={{ color: VS.teal }}>{form.validIdFilename}</span>}
                  </div>
                  {form.validIdUrl && form.validIdUrl.startsWith('data:image') && (
                    <img src={form.validIdUrl} alt="ID Preview" className="mt-4 rounded-lg max-w-[250px] max-h-[180px] object-cover"
                      style={{ border: `1px solid ${VS.border}` }} />
                  )}
                </div>
              </>}

              {step === 7 && <ContractStep form={form} setForm={setForm} api={apiClient} />}
            </div>
          )}
        </div>

        {/* Footer — nav + save */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderTop: `1px solid ${VS.border}`, background: VS.bg1 }}>
          <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium disabled:opacity-30 transition-all hover:bg-white/5"
            style={{ border: `1px solid ${VS.border}`, color: VS.text1 }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>

          <div className="flex items-center gap-2">
            {step === STEPS.length - 1 ? (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: VS.accent, color: '#fff' }}>
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
            ) : (
              <button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90"
                style={{ background: VS.accent, color: '#fff' }}>
                Next <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] shadow-xl"
          style={{ background: toast.ok ? 'rgba(78,201,176,0.15)' : 'rgba(244,71,71,0.15)', border: `1px solid ${toast.ok ? VS.teal : VS.red}`, color: toast.ok ? VS.teal : VS.red }}>
          {toast.ok ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// Keep page export as a wrapper that auto-opens the modal (for direct /my-profile navigation)
export function EmployeeProfile() {
  return <EmployeeProfileModal open={true} onClose={() => window.history.back()} />;
}
