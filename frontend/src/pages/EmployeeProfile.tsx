import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import { Save, CheckCircle, AlertTriangle, Upload, FileText, X, ArrowLeft, ArrowRight, Download } from 'lucide-react';
import { VS } from '../lib/theme';

const inp = 'w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#007acc]/50 transition-all';
const inpS: React.CSSProperties = { background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text0 };
const inpErr: React.CSSProperties = { ...inpS, borderColor: VS.red };
const labelCls = 'block text-[12px] font-semibold mb-1.5';

interface Profile {
  legalName: string; dateOfBirth: string; country: string;
  streetAddress: string; city: string; state: string; postcode: string;
  homePhone: string; cellPhone: string; emailAddress: string; sssId: string;
  maritalStatus: string; spouseName: string; spouseEmployer: string; spouseWorkPhone: string;
  emergencyContactName: string; emergencyContactAddress: string;
  emergencyContactPhone: string; emergencyContactCell: string; emergencyContactRelation: string;
  bankName: string; accountNumber: string; wiseUsername: string;
  validIdUrl: string; validIdFilename: string;
  contractSignature: string; contractSignedAt: string;
}

const EMPTY: Profile = {
  legalName: '', dateOfBirth: '', country: 'Philippines',
  streetAddress: '', city: '', state: '', postcode: '',
  homePhone: '', cellPhone: '', emailAddress: '', sssId: '',
  maritalStatus: '', spouseName: '', spouseEmployer: '', spouseWorkPhone: '',
  emergencyContactName: '', emergencyContactAddress: '',
  emergencyContactPhone: '', emergencyContactCell: '', emergencyContactRelation: '',
  bankName: '', accountNumber: '', wiseUsername: '',
  validIdUrl: '', validIdFilename: '',
  contractSignature: '', contractSignedAt: '',
};

// Country-specific address fields
const ADDRESS_FIELDS: Record<string, { label: string; fields: { key: keyof Profile; label: string; placeholder: string }[] }> = {
  Philippines: {
    label: 'Philippines',
    fields: [
      { key: 'streetAddress', label: 'Street / Barangay', placeholder: '123 Rizal Street, Brgy. San Antonio' },
      { key: 'city', label: 'City / Municipality', placeholder: 'Makati City' },
      { key: 'state', label: 'Province', placeholder: 'Metro Manila' },
      { key: 'postcode', label: 'Zip Code', placeholder: '1200' },
    ],
  },
  Australia: {
    label: 'Australia',
    fields: [
      { key: 'streetAddress', label: 'Street Address', placeholder: '123 Example Street' },
      { key: 'city', label: 'Suburb', placeholder: 'Sydney' },
      { key: 'state', label: 'State', placeholder: 'NSW' },
      { key: 'postcode', label: 'Postcode', placeholder: '2000' },
    ],
  },
  'United States': {
    label: 'United States',
    fields: [
      { key: 'streetAddress', label: 'Street Address', placeholder: '123 Main St' },
      { key: 'city', label: 'City', placeholder: 'New York' },
      { key: 'state', label: 'State', placeholder: 'NY' },
      { key: 'postcode', label: 'ZIP Code', placeholder: '10001' },
    ],
  },
  'United Kingdom': {
    label: 'United Kingdom',
    fields: [
      { key: 'streetAddress', label: 'Address Line', placeholder: '10 Downing Street' },
      { key: 'city', label: 'Town / City', placeholder: 'London' },
      { key: 'state', label: 'County', placeholder: 'Greater London' },
      { key: 'postcode', label: 'Postcode', placeholder: 'SW1A 2AA' },
    ],
  },
  Other: {
    label: 'Other',
    fields: [
      { key: 'streetAddress', label: 'Street Address', placeholder: '' },
      { key: 'city', label: 'City', placeholder: '' },
      { key: 'state', label: 'State / Region', placeholder: '' },
      { key: 'postcode', label: 'Postal Code', placeholder: '' },
    ],
  },
};

const COUNTRIES = Object.keys(ADDRESS_FIELDS);

function Field({ label, value, onChange, type = 'text', placeholder, required, error }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; error?: boolean;
}) {
  return (
    <div>
      <label className={labelCls} style={{ color: VS.text2 }}>
        {label} {required && <span style={{ color: VS.red }}>*</span>}
      </label>
      <input className={inp} style={error ? inpErr : inpS} type={type} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// Steps: Employee Info, Spouse, Emergency Contact, Bank Details, Valid ID, Contract
const STEPS = [
  { id: 'personal', label: 'Employee Info' },
  { id: 'spouse', label: 'Spouse' },
  { id: 'emergency', label: 'Emergency Contact' },
  { id: 'bank', label: 'Bank Details' },
  { id: 'id', label: 'Valid ID' },
  { id: 'contract', label: 'Contract' },
];

// Validation per step — returns list of missing field labels
function validateStep(step: number, form: Profile): string[] {
  const missing: string[] = [];
  const req = (val: string, label: string) => { if (!val.trim()) missing.push(label); };

  if (step === 0) {
    req(form.legalName, 'Full Name');
    req(form.dateOfBirth, 'Date of Birth');
    req(form.cellPhone, 'Cell Phone');
    req(form.emailAddress, 'Email Address');
    req(form.sssId, 'SSS Id');
    req(form.maritalStatus, 'Marital Status');
    req(form.country, 'Country');
    req(form.streetAddress, 'Street Address');
    req(form.city, 'City');
    req(form.state, 'State/Province');
    req(form.postcode, 'Postcode');
  } else if (step === 1) {
    // Spouse info is optional — no required fields
  } else if (step === 2) {
    req(form.emergencyContactName, 'Full Name');
    req(form.emergencyContactAddress, 'Address');
    req(form.emergencyContactPhone, 'Primary Phone');
    req(form.emergencyContactCell, 'Cell Phone');
    req(form.emergencyContactRelation, 'Relationship');
  } else if (step === 3) {
    req(form.bankName, 'Bank Name');
    req(form.accountNumber, 'Account Number');
    req(form.wiseUsername, 'Wise Username');
  } else if (step === 4) {
    req(form.validIdFilename, 'Valid ID upload');
  }
  // Step 5 (contract) — signature not required to proceed (they sign at the end)
  return missing;
}

// ── Signature Pad ────────────────────────────────────────────────────────────
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
    if ('touches' in e) return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => { e.preventDefault(); setDrawing(true); const ctx = getCtx(); if (!ctx) return; const { x, y } = getPos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const draw = (e: React.MouseEvent | React.TouchEvent) => { if (!drawing) return; e.preventDefault(); const ctx = getCtx(); if (!ctx) return; const { x, y } = getPos(e); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineTo(x, y); ctx.stroke(); };
  const endDraw = () => { if (!drawing) return; setDrawing(false); if (canvasRef.current) onChange(canvasRef.current.toDataURL('image/png')); };

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${VS.border2}`, background: '#fff' }}>
        <canvas ref={canvasRef} width={460} height={160} className="w-full cursor-crosshair" style={{ touchAction: 'none', display: 'block' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={clearCanvas} className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-90"
          style={{ background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text2 }}>Clear</button>
        <span className="text-[11px]" style={{ color: VS.text2 }}>or</span>
        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all hover:opacity-90"
          style={{ background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text2 }}>
          <Upload className="h-3 w-3" /> Upload Signature
          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader(); reader.onload = () => onChange(reader.result as string); reader.readAsDataURL(file);
          }} />
        </label>
        {value && <span className="text-[11px] ml-auto" style={{ color: VS.teal }}>Signature captured</span>}
      </div>
    </div>
  );
}

// ── Contract Step ────────────────────────────────────────────────────────────
function ContractStep({ form, setForm, api }: { form: Profile; setForm: React.Dispatch<React.SetStateAction<Profile>>; api: any }) {
  const [myContract, setMyContract] = useState<{ id: string; title: string; content: string } | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [loadingContract, setLoadingContract] = useState(true);

  // Fetch the contract linked to this employee's email
  useEffect(() => {
    api.fetch('/api/contracts/my')
      .then((d: any) => setMyContract(d.contract || null))
      .catch(() => {})
      .finally(() => setLoadingContract(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="sm:col-span-2 space-y-5">
        {loadingContract ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid #3c3c3c', borderTopColor: VS.accent }} />
          </div>
        ) : !myContract ? (
          <div className="rounded-lg p-6 text-center" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
            <FileText className="h-8 w-8 mx-auto mb-2" style={{ color: VS.text2, opacity: 0.4 }} />
            <p className="text-[13px] font-medium" style={{ color: VS.text1 }}>No contract assigned yet</p>
            <p className="text-[12px] mt-1" style={{ color: VS.text2 }}>Your administrator will prepare your contract. You can still save your profile and come back to sign later.</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg p-4" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
              <p className="text-[13px] font-medium mb-1" style={{ color: VS.text0 }}>{myContract.title}</p>
              {form.legalName && <p className="text-[14px] font-bold mb-2" style={{ color: VS.accent }}>For: {form.legalName}</p>}
              <p className="text-[12px] mb-3" style={{ color: VS.text2 }}>Please review your contract below before signing.</p>
              <button onClick={() => setViewOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-90"
                style={{ background: VS.accent, color: '#fff' }}>
                <FileText className="h-4 w-4" /> View Contract
              </button>
            </div>
          </>
        )}
        {form.contractSignedAt && (
          <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: 'rgba(78,201,176,0.1)', border: `1px solid ${VS.teal}44` }}>
            <CheckCircle className="h-4 w-4" style={{ color: VS.teal }} />
            <span className="text-[12px]" style={{ color: VS.teal }}>
              Signed on {new Date(form.contractSignedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}{form.legalName ? ` by ${form.legalName}` : ''}
            </span>
          </div>
        )}
        <div>
          <p className="text-[13px] font-medium mb-2" style={{ color: VS.text0 }}>Your Signature</p>
          <SignaturePad value={form.contractSignature} onChange={(dataUrl) => setForm(prev => ({ ...prev, contractSignature: dataUrl, contractSignedAt: dataUrl ? new Date().toISOString() : '' }))} />
          {form.contractSignature && (
            <div className="mt-3 pt-3 text-center" style={{ borderTop: `1px solid ${VS.border}` }}>
              <p className="text-[14px] font-semibold" style={{ color: VS.text0 }}>{form.legalName || 'Name not provided'}</p>
              <p className="text-[11px]" style={{ color: VS.text2 }}>Signed {new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          )}
        </div>
      </div>
      {viewOpen && myContract && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={e => { if (e.target === e.currentTarget) setViewOpen(false); }}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col" style={{ background: '#fff', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ background: VS.bg1, borderBottom: `1px solid ${VS.border}` }}>
              <span className="text-[14px] font-bold" style={{ color: VS.text0 }}>{myContract.title}</span>
              <button onClick={() => setViewOpen(false)} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-white/10" style={{ color: VS.text1 }}><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8" style={{ color: '#1a1a1a', fontSize: '13px', lineHeight: 1.7 }}
              dangerouslySetInnerHTML={{ __html: myContract.content || '' }} />
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Modal ───────────────────────────────────────────────────────────────
export function EmployeeProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: session } = useSession();
  const apiClient = useApiClient();
  const [form, setForm] = useState<Profile>(EMPTY);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

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
              if ((k === 'dateOfBirth' || k === 'startDate') && p[k]) out[k] = new Date(p[k]).toISOString().split('T')[0];
              else out[k] = String(p[k]);
            }
          }
          setForm(out);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof Profile) => (v: string) => setForm(prev => ({ ...prev, [field]: v }));

  const tryNext = () => {
    const missing = validateStep(step, form);
    if (missing.length > 0) {
      setErrors(missing);
      return;
    }
    setErrors([]);
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.fetch('/api/employee-profiles/me', { method: 'PUT', body: JSON.stringify(form) });
      setToast({ msg: 'Profile saved successfully', ok: true });
      setTimeout(() => { setToast(null); onClose(); }, 1500);
    } catch (err: any) {
      setToast({ msg: err.message || 'Failed to save', ok: false });
      setTimeout(() => setToast(null), 3500);
    } finally { setSaving(false); }
  };

  if (!open) return null;

  const addrConfig = ADDRESS_FIELDS[form.country] || ADDRESS_FIELDS.Other;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
      >
      <div className="w-full max-w-xl rounded-2xl overflow-hidden flex flex-col" style={{ background: VS.bg0, border: `1px solid ${VS.border}`, maxHeight: '90vh', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ background: VS.bg1, borderBottom: `1px solid ${VS.border}` }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: VS.text0 }}>Employee Profile</h2>
            <p className="text-[11px] mt-0.5" style={{ color: VS.text2 }}>Step {step + 1} of {STEPS.length} — {STEPS[step].label}</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: VS.text1 }}><X className="h-4 w-4" /></button>
        </div>

        {/* Step progress line */}
        <div className="flex items-center px-6 py-3 gap-1 shrink-0" style={{ borderBottom: `1px solid ${VS.border}` }}>
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 gap-1">
              <div className="flex-1 h-1 rounded-full" style={{ background: i <= step ? VS.accent : VS.bg3 }} />
              {i < STEPS.length - 1 && <div className="w-1" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid #3c3c3c', borderTopColor: VS.accent }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Step 0: Employee Info */}
              {step === 0 && <>
                <Field label="Full Name" value={form.legalName} onChange={set('legalName')} placeholder="As shown on ID" required error={errors.includes('Full Name')} />
                <Field label="Date of Birth" value={form.dateOfBirth} onChange={set('dateOfBirth')} type="date" required error={errors.includes('Date of Birth')} />
                <Field label="SSS Id" value={form.sssId} onChange={set('sssId')} placeholder="SSS number" required error={errors.includes('SSS Id')} />
                <Field label="Home Phone" value={form.homePhone} onChange={set('homePhone')} placeholder="+63 2 000 0000" />
                <Field label="Cell Phone" value={form.cellPhone} onChange={set('cellPhone')} placeholder="+63 900 000 0000" required error={errors.includes('Cell Phone')} />
                <Field label="Email Address" value={form.emailAddress} onChange={set('emailAddress')} type="email" placeholder="personal@email.com" required error={errors.includes('Email Address')} />
                <div className="sm:col-span-2">
                  <label className={labelCls} style={{ color: VS.text2 }}>Marital Status <span style={{ color: VS.red }}>*</span></label>
                  <select className={inp} style={errors.includes('Marital Status') ? inpErr : inpS} value={form.maritalStatus} onChange={e => setForm(prev => ({ ...prev, maritalStatus: e.target.value }))}>
                    <option value="">Select…</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                    <option value="de-facto">De Facto</option>
                  </select>
                </div>
                {/* Country */}
                <div className="sm:col-span-2">
                  <label className={labelCls} style={{ color: VS.text2 }}>Country <span style={{ color: VS.red }}>*</span></label>
                  <select className={inp} style={inpS} value={form.country}
                    onChange={e => setForm(prev => ({ ...prev, country: e.target.value, streetAddress: '', city: '', state: '', postcode: '' }))}>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {/* Country-specific address fields */}
                {addrConfig.fields.map(f => (
                  <Field key={f.key} label={f.label} value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder}
                    required error={errors.includes(f.label === 'Street / Barangay' ? 'Street Address' : f.label === 'Suburb' ? 'City' : f.label === 'Province' ? 'State/Province' : f.label)} />
                ))}
              </>}

              {/* Step 1: Spouse */}
              {step === 1 && <>
                <Field label="Spouse's Name" value={form.spouseName} onChange={set('spouseName')} />
                <Field label="Spouse's Employer" value={form.spouseEmployer} onChange={set('spouseEmployer')} />
                <Field label="Spouse's Work Phone" value={form.spouseWorkPhone} onChange={set('spouseWorkPhone')} />
                <div className="sm:col-span-2">
                  <p className="text-[11px] mt-2" style={{ color: VS.text2 }}>
                    If not married, enter "N/A" for each field.
                  </p>
                </div>
              </>}

              {/* Step 2: Emergency Contact */}
              {step === 2 && <>
                <Field label="Full Name" value={form.emergencyContactName} onChange={set('emergencyContactName')} required error={errors.includes('Full Name')} />
                <div className="sm:col-span-2">
                  <Field label="Address" value={form.emergencyContactAddress} onChange={set('emergencyContactAddress')} required error={errors.includes('Address')} />
                </div>
                <Field label="Primary Phone" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} required error={errors.includes('Primary Phone')} />
                <Field label="Cell Phone" value={form.emergencyContactCell} onChange={set('emergencyContactCell')} required error={errors.includes('Cell Phone')} />
                <Field label="Relationship" value={form.emergencyContactRelation} onChange={set('emergencyContactRelation')} placeholder="Spouse, Parent, etc." required error={errors.includes('Relationship')} />
              </>}

              {/* Step 3: Bank Details */}
              {step === 3 && <>
                <Field label="Bank Name" value={form.bankName} onChange={set('bankName')} placeholder="e.g. BDO, BPI, Commonwealth" required error={errors.includes('Bank Name')} />
                <Field label="Account Number" value={form.accountNumber} onChange={set('accountNumber')} required error={errors.includes('Account Number')} />
                <Field label="Wise Username" value={form.wiseUsername} onChange={set('wiseUsername')} placeholder="@username" required error={errors.includes('Wise Username')} />
              </>}

              {/* Step 4: Valid ID */}
              {step === 4 && <>
                <div className="sm:col-span-2">
                  <p className="text-[12px] mb-3" style={{ color: VS.text2 }}>
                    Upload a photo or scan of a valid government ID (passport, driver's license, etc.) <span style={{ color: VS.red }}>*</span>
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all hover:opacity-90"
                      style={{ background: VS.bg3, border: `1px solid ${errors.includes('Valid ID upload') ? VS.red : VS.border2}`, color: VS.text1 }}>
                      <Upload className="h-4 w-4" /> Choose File
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setForm(prev => ({ ...prev, validIdUrl: reader.result as string, validIdFilename: file.name }));
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                    {form.validIdFilename && <span className="text-[12px]" style={{ color: VS.teal }}>{form.validIdFilename}</span>}
                  </div>
                  {form.validIdUrl && form.validIdUrl.startsWith('data:image') && (
                    <img src={form.validIdUrl} alt="ID Preview" className="mt-4 rounded-lg max-w-[250px] max-h-[180px] object-cover" style={{ border: `1px solid ${VS.border}` }} />
                  )}
                </div>
              </>}

              {/* Step 5: Contract */}
              {step === 5 && <ContractStep form={form} setForm={setForm} api={apiClient} />}
            </div>
          )}

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="mt-4 rounded-lg p-3" style={{ background: 'rgba(244,71,71,0.08)', border: `1px solid ${VS.red}33` }}>
              <p className="text-[12px] font-medium" style={{ color: VS.red }}>Please fill in: {errors.join(', ')}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderTop: `1px solid ${VS.border}`, background: VS.bg1 }}>
          <button onClick={() => { setErrors([]); setStep(s => Math.max(0, s - 1)); }} disabled={step === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium disabled:opacity-30 transition-all hover:bg-white/5"
            style={{ border: `1px solid ${VS.border}`, color: VS.text1 }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="flex items-center gap-2">
            {step === STEPS.length - 1 ? (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: VS.accent, color: '#fff' }}>
                <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save Profile'}
              </button>
            ) : (
              <button onClick={tryNext}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90"
                style={{ background: VS.accent, color: '#fff' }}>
                Next <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

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

export function EmployeeProfile() {
  return <EmployeeProfileModal open={true} onClose={() => window.history.back()} />;
}
