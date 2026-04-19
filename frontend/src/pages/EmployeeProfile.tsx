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
  homePhone: string; cellPhone: string; emailAddress: string;
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
  homePhone: '', cellPhone: '', emailAddress: '',
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

// Validation helpers
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s\-()]{6,}$/;      // digits with optional +, space, dash, parens; min 7 chars
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Validation per step — returns list of invalid/missing fields with reason
function validateStep(step: number, form: Profile): string[] {
  const errs: string[] = [];
  const req = (val: string, label: string) => { if (!val.trim()) errs.push(label); };
  const email = (val: string, label: string) => { if (val.trim() && !EMAIL_RE.test(val.trim())) errs.push(`${label} (invalid format)`); };
  const phone = (val: string, label: string) => { if (val.trim() && !PHONE_RE.test(val.trim())) errs.push(`${label} (invalid number)`); };
  const date = (val: string, label: string) => { if (val.trim() && !DATE_RE.test(val.trim())) errs.push(`${label} (invalid date)`); };

  if (step === 0) {
    req(form.legalName, 'Full Name');
    req(form.dateOfBirth, 'Date of Birth');
    date(form.dateOfBirth, 'Date of Birth');
    req(form.cellPhone, 'Cell Phone');
    phone(form.cellPhone, 'Cell Phone');
    phone(form.homePhone, 'Home Phone');
    req(form.emailAddress, 'Email Address');
    email(form.emailAddress, 'Email Address');
    req(form.maritalStatus, 'Marital Status');
    req(form.country, 'Country');
    req(form.streetAddress, 'Street Address');
    req(form.city, 'City');
    req(form.state, 'State/Province');
    req(form.postcode, 'Postcode');
  } else if (step === 1) {
    // Spouse info is optional — only validate phone format if filled
    phone(form.spouseWorkPhone, "Spouse's Work Phone");
  } else if (step === 2) {
    req(form.emergencyContactName, 'Full Name');
    req(form.emergencyContactAddress, 'Address');
    req(form.emergencyContactPhone, 'Primary Phone');
    phone(form.emergencyContactPhone, 'Primary Phone');
    req(form.emergencyContactCell, 'Cell Phone');
    phone(form.emergencyContactCell, 'Cell Phone');
    req(form.emergencyContactRelation, 'Relationship');
  } else if (step === 3) {
    req(form.bankName, 'Bank Name');
    req(form.accountNumber, 'Account Number');
    if (form.accountNumber.trim() && !/^\d{4,}$/.test(form.accountNumber.trim().replace(/[\s-]/g, ''))) {
      errs.push('Account Number (digits only, min 4)');
    }
    req(form.wiseUsername, 'Wise Username');
  } else if (step === 4) {
    req(form.validIdFilename, 'Valid ID upload');
  }
  // Step 5 (contract) — signature not required to proceed
  return errs;
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

// Inject the employee's signature image + signing date into the contract HTML.
// Replaces every employee-side signature line (keeping the first = employer),
// fills in "Date: _______" everywhere, and fills "Signature & Date: ___" too.
function injectSignature(html: string, form: Profile): string {
  if (!form.contractSignature) return html;

  const dateStr = form.contractSignedAt
    ? new Date(form.contractSignedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  // Fixed dimensions prevent layout shift when image loads → prevents auto-scroll
  const sigImg = `<img src="${form.contractSignature}" alt="Signature" width="180" height="60" style="width:180px;height:60px;display:inline-block;vertical-align:middle;object-fit:contain;" />`;
  let out = html;

  // 1) Replace ALL employee-side signature underscore lines with the signature image.
  //    Keep the FIRST occurrence (that's the employer/director on the main signature block).
  const sigLineRegex = /_{20,}/g;  // 20+ underscores
  const sigMatches = [...out.matchAll(sigLineRegex)];
  if (sigMatches.length > 1) {
    // Walk from end to start so indices stay valid while replacing
    for (let i = sigMatches.length - 1; i >= 1; i--) {
      const m = sigMatches[i];
      out = out.slice(0, m.index) + sigImg + out.slice(m.index + m[0].length);
    }
  } else if (sigMatches.length === 1) {
    // Only one signature line → it's the employee's
    out = out.replace(sigLineRegex, sigImg);
  }

  // 2) Fill in all "Date: _______" placeholders with the signing date
  out = out.replace(/Date:\s*_+/g, `Date: <strong>${dateStr}</strong>`);

  // 3) Fill in "Signature & Date: _______" → signature image + date
  out = out.replace(/Signature\s*&amp;\s*Date\s*:\s*_+/gi, `Signature &amp; Date: ${sigImg} <strong>${dateStr}</strong>`);
  out = out.replace(/Signature\s*&\s*Date\s*:\s*_+/gi, `Signature & Date: ${sigImg} <strong>${dateStr}</strong>`);

  // 4) Printed Name / Name: _______ → employee's legal name
  const nameStr = form.legalName || '';
  if (nameStr) {
    // "Printed Name: <img>" → "Printed Name: [name]" (img already replaced underscores)
    const sigImgEscaped = sigImg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`Printed Name:\\s*${sigImgEscaped}`, 'g'), `Printed Name: <strong>${nameStr}</strong>`);

    // Annex E: ">Name: <img>" → ">Name: [name]"
    // Use `>` right before to avoid matching "Full Name:" or "Legal Name:"
    out = out.replace(new RegExp(`>Name:\\s*${sigImgEscaped}`, 'g'), `>Name: <strong>${nameStr}</strong>`);

    // Also handle the case where signature wasn't a separate sig line (fallback): "Printed Name: ___"
    out = out.replace(/Printed Name:\s*_{20,}/g, `Printed Name: <strong>${nameStr}</strong>`);
    out = out.replace(/>Name:\s*_{20,}/g, `>Name: <strong>${nameStr}</strong>`);
  }

  // 5) Patch existing contracts — replace old director placeholder with Zachariah Mcanally, Founder
  // Handle any apostrophe variant and whitespace, collapse into single bold line
  out = out.replace(
    /<p>\s*<strong>\s*\(Director[’'‘`´]?s?\s*Name\s*\/\s*Owner\s*\)\s*<\/strong>\s*<\/p>\s*<p>\s*<em>\s*\(Position\)\s*<\/em>\s*<\/p>/gi,
    '<p><strong>Zachariah Mcanally, Founder</strong></p>'
  );
  // Catch-all for standalone placeholders
  out = out.replace(/\(Director[’'‘`´]?s?\s*Name\s*\/\s*Owner\s*\)/gi, 'Zachariah Mcanally');
  out = out.replace(/\(Position\)/g, 'Founder');
  // Also upgrade any previously-stored "Zac Mcanally" → "Zachariah Mcanally"
  out = out.replace(/Zac Mcanally/gi, 'Zachariah Mcanally');

  return out;
}

// ── Contract Step ────────────────────────────────────────────────────────────
function ContractStep({ form, setForm, api }: { form: Profile; setForm: React.Dispatch<React.SetStateAction<Profile>>; api: any }) {
  const [myContract, setMyContract] = useState<{ id: string; title: string; content: string } | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [loadingContract, setLoadingContract] = useState(true);
  const viewScrollRef = useRef<HTMLDivElement>(null);

  // Reset scroll to top when viewer opens + again after images load (prevents auto-scroll-down)
  useEffect(() => {
    if (!viewOpen || !viewScrollRef.current) return;
    const el = viewScrollRef.current;

    // Scroll to top multiple times as content loads
    const toTop = () => { if (el) el.scrollTop = 0; };
    toTop();
    requestAnimationFrame(toTop);
    const t1 = setTimeout(toTop, 50);
    const t2 = setTimeout(toTop, 200);
    const t3 = setTimeout(toTop, 500);

    // Also reset whenever any image inside loads (signature image causes layout shift)
    const imgs = el.querySelectorAll('img');
    const handlers: Array<[HTMLImageElement, () => void]> = [];
    imgs.forEach(img => {
      const handler = () => { if (el) el.scrollTop = 0; };
      img.addEventListener('load', handler);
      handlers.push([img, handler]);
    });

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      handlers.forEach(([img, h]) => img.removeEventListener('load', h));
    };
  }, [viewOpen, myContract]);

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
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setViewOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-90"
                  style={{ background: VS.accent, color: '#fff' }}>
                  <FileText className="h-4 w-4" /> View Contract
                </button>
                <button onClick={() => {
                  const filledHtml = injectSignature(myContract.content || '', form);
                  const fileName = `Contract_${(form.legalName || 'Employee').replace(/\s+/g, '_')}`;
                  const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fileName}</title><style>
                    @page { size: A4; margin: 20mm; }
                    body{font-family:-apple-system,Segoe UI,sans-serif;color:#1a1a1a;max-width:780px;margin:0 auto;padding:0 10px;line-height:1.7;font-size:13px}
                    h1{font-size:18px;margin:24px 0 12px;text-align:center}
                    h2{font-size:15px;margin:20px 0 8px}
                    h3{font-size:14px;margin:16px 0 8px}
                    table{width:100%;border-collapse:collapse;margin:10px 0}
                    td{padding:6px 8px;border:1px solid #ccc;vertical-align:top}
                    img{max-width:180px}
                    ul{margin:8px 0;padding-left:24px}
                    hr{page-break-after:always;border:none}
                  </style></head><body>${filledHtml}
                  <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 300); });</script>
                  </body></html>`;
                  // Open in new window → auto-trigger print dialog → user saves as PDF
                  const w = window.open('', '_blank');
                  if (w) {
                    w.document.open();
                    w.document.write(full);
                    w.document.close();
                  }
                }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-90"
                  style={{ background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text1 }}>
                  <Download className="h-4 w-4" /> Download PDF
                </button>
              </div>
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
            <div ref={viewScrollRef} className="flex-1 overflow-y-auto p-8" style={{ color: '#1a1a1a', fontSize: '13px', lineHeight: 1.7, overflowAnchor: 'none' }}
              dangerouslySetInnerHTML={{ __html: injectSignature(myContract.content || '', form) }} />
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Modal ───────────────────────────────────────────────────────────────
export function EmployeeProfileModal({ open, onClose, mandatory = false }: { open: boolean; onClose: () => void; mandatory?: boolean }) {
  const { data: session } = useSession();
  const apiClient = useApiClient();
  const [form, setForm] = useState<Profile>(EMPTY);
  const [contractTemplate, setContractTemplate] = useState<string>('');
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !session?.user?.id) return;
    setLoading(true);
    Promise.all([
      apiClient.fetch('/api/employee-profiles/me').catch(() => null),
      apiClient.fetch('/api/contracts/my').catch(() => null),
    ]).then(([profileRes, contractRes]: any[]) => {
      if (profileRes?.profile) {
        const p = profileRes.profile;
        const out: any = { ...EMPTY };
        for (const k of Object.keys(EMPTY)) {
          if (p[k] != null) {
            if ((k === 'dateOfBirth' || k === 'startDate') && p[k]) out[k] = new Date(p[k]).toISOString().split('T')[0];
            else out[k] = String(p[k]);
          }
        }
        setForm(out);
      }
      if (contractRes?.contract?.content) setContractTemplate(contractRes.contract.content);
    }).finally(() => setLoading(false));
  }, [open, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof Profile) => (v: string) => setForm(prev => ({ ...prev, [field]: v }));

  const tryNext = () => {
    // Validation is shown as a warning but no longer blocks — user can skip
    const missing = validateStep(step, form);
    setErrors(missing);
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  };

  const handleSave = async () => {
    // Validate all steps on save — collect issues from all steps
    const allErrors: string[] = [];
    for (let i = 0; i < STEPS.length; i++) {
      allErrors.push(...validateStep(i, form));
    }
    if (allErrors.length > 0) {
      setErrors(allErrors);
      setToast({ msg: `${allErrors.length} field${allErrors.length > 1 ? 's' : ''} need attention`, ok: false });
      setTimeout(() => setToast(null), 3500);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      // Build the signed contract HTML snapshot (signature embedded + date filled)
      const signedContractHtml = contractTemplate && form.contractSignature
        ? injectSignature(contractTemplate, form)
        : null;

      await apiClient.fetch('/api/employee-profiles/me', {
        method: 'PUT',
        body: JSON.stringify({ ...form, signedContractHtml }),
      });
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
          {!mandatory && (
            <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: VS.text1 }}><X className="h-4 w-4" /></button>
          )}
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
            <>
            {/* Step header — large title for each step */}
            <div className="mb-5 pb-3" style={{ borderBottom: `1px solid ${VS.border}` }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: VS.accent }}>
                Step {step + 1} of {STEPS.length}
              </p>
              <h3 className="text-[18px] font-bold" style={{ color: VS.text0 }}>{STEPS[step].label}</h3>
              <p className="text-[12px] mt-1" style={{ color: VS.text2 }}>
                {step === 0 && 'Personal information and contact details'}
                {step === 1 && 'Optional — fill in if applicable'}
                {step === 2 && 'Someone to contact in case of emergency'}
                {step === 3 && 'For payroll and reimbursements'}
                {step === 4 && 'Upload a valid government-issued ID'}
                {step === 5 && 'Review and sign your employment contract'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Step 0: Employee Info */}
              {step === 0 && <>
                <Field label="Full Name" value={form.legalName} onChange={set('legalName')} placeholder="As shown on ID" required error={errors.includes('Full Name')} />
                <Field label="Date of Birth" value={form.dateOfBirth} onChange={set('dateOfBirth')} type="date" required error={errors.includes('Date of Birth')} />
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
            </>
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

// ── Read-only view of saved Employee Info (navbar access) ────────────────────
export function EmployeeInfoViewer({ open, onClose, onEdit }: {
  open: boolean; onClose: () => void; onEdit: () => void;
}) {
  const { data: session } = useSession();
  const apiClient = useApiClient();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !session?.user?.id) return;
    setLoading(true);
    apiClient.fetch('/api/employee-profiles/me')
      .then((d: any) => setProfile(d.profile || null))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [open, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const row = (label: string, value: string | null | undefined) => (
    <div className="flex items-start gap-3 py-1.5" style={{ borderBottom: `1px solid ${VS.border}` }}>
      <span className="text-[11px] font-semibold shrink-0 w-36 pt-0.5" style={{ color: VS.text2 }}>{label}</span>
      <span className="text-[13px] flex-1" style={{ color: value ? VS.text0 : VS.text2 }}>{value || '—'}</span>
    </div>
  );

  const section = (title: string, children: React.ReactNode) => (
    <div>
      <h3 className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: VS.accent }}>{title}</h3>
      <div>{children}</div>
    </div>
  );

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const address = profile
    ? [profile.streetAddress, profile.city, profile.state, profile.postcode, profile.country].filter(Boolean).join(', ')
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: VS.bg0, border: `1px solid ${VS.border}`, maxHeight: '90vh', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ background: VS.bg1, borderBottom: `1px solid ${VS.border}` }}>
          <div>
            <h2 className="text-[15px] font-bold" style={{ color: VS.text0 }}>Employee Information</h2>
            <p className="text-[11px] mt-0.5" style={{ color: VS.text2 }}>Your saved profile details</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:opacity-90"
              style={{ background: VS.accent, color: '#fff' }}>
              Edit
            </button>
            <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: VS.text1 }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid #3c3c3c', borderTopColor: VS.accent }} />
            </div>
          ) : !profile ? (
            <div className="rounded-lg p-8 text-center" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
              <FileText className="h-10 w-10 mx-auto mb-3" style={{ color: VS.text2, opacity: 0.4 }} />
              <p className="text-[14px] font-medium" style={{ color: VS.text1 }}>No profile saved yet</p>
              <p className="text-[12px] mt-1 mb-4" style={{ color: VS.text2 }}>Fill in your employee details to get started.</p>
              <button onClick={onEdit}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all hover:opacity-90"
                style={{ background: VS.accent, color: '#fff' }}>
                Fill in Profile
              </button>
            </div>
          ) : (
            <>
              {section('Personal Information', <>
                {row('Full Name', profile.legalName)}
                {row('Date of Birth', fmtDate(profile.dateOfBirth))}
                {row('Email', profile.emailAddress)}
                {row('Cell Phone', profile.cellPhone)}
                {row('Home Phone', profile.homePhone)}
                {row('Marital Status', profile.maritalStatus)}
                {row('Address', address)}
              </>)}

              {(profile.spouseName || profile.spouseEmployer || profile.spouseWorkPhone) && section('Spouse', <>
                {row('Name', profile.spouseName)}
                {row('Employer', profile.spouseEmployer)}
                {row('Work Phone', profile.spouseWorkPhone)}
              </>)}

              {section('Emergency Contact', <>
                {row('Name', profile.emergencyContactName)}
                {row('Address', profile.emergencyContactAddress)}
                {row('Primary Phone', profile.emergencyContactPhone)}
                {row('Cell Phone', profile.emergencyContactCell)}
                {row('Relationship', profile.emergencyContactRelation)}
              </>)}

              {section('Bank Details', <>
                {row('Bank Name', profile.bankName)}
                {row('Account Number', profile.accountNumber)}
                {row('Wise Username', profile.wiseUsername)}
              </>)}

              {profile.validIdFilename && section('Valid ID', <>
                {row('File', profile.validIdFilename)}
                {profile.validIdUrl && profile.validIdUrl.startsWith('data:image') && (
                  <img src={profile.validIdUrl} alt="Valid ID"
                    className="mt-2 rounded-lg max-w-[240px] max-h-[170px] object-cover"
                    style={{ border: `1px solid ${VS.border}` }} />
                )}
              </>)}

              {profile.contractSignedAt && section('Contract', <>
                {row('Signed On', fmtDate(profile.contractSignedAt))}
                {profile.contractSignature && (
                  <div className="mt-2">
                    <p className="text-[11px] mb-1" style={{ color: VS.text2 }}>Signature</p>
                    <img src={profile.contractSignature} alt="Signature"
                      className="rounded-lg bg-white p-1" style={{ maxWidth: 200, maxHeight: 60, border: `1px solid ${VS.border}` }} />
                  </div>
                )}
              </>)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
