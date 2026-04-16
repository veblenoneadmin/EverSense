import { useState, useEffect } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import { User, Phone, Briefcase, Landmark, Save, CheckCircle, AlertTriangle, Heart, Users, Upload, FileText } from 'lucide-react';
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
};

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${VS.border}` }}>
        <Icon className="h-4 w-4" style={{ color: VS.accent }} />
        <h2 className="text-[14px] font-bold" style={{ color: VS.text0 }}>{title}</h2>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </div>
  );
}

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

export function EmployeeProfile() {
  const { data: session } = useSession();
  const apiClient = useApiClient();
  const [form, setForm] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    apiClient.fetch('/api/employee-profiles/me')
      .then((d: any) => {
        if (d.profile) {
          const p = d.profile;
          const out: any = { ...EMPTY };
          for (const k of Object.keys(EMPTY)) {
            if (p[k] != null) {
              // Format dates
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
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof Profile) => (v: string) => setForm(prev => ({ ...prev, [field]: v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.fetch('/api/employee-profiles/me', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setToast({ msg: 'Profile saved successfully', ok: true });
    } catch (err: any) {
      setToast({ msg: err.message || 'Failed to save', ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid #3c3c3c', borderTopColor: VS.accent }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-[18px] font-bold" style={{ color: VS.text0 }}>Employee Profile</h1>
        <p className="text-[13px] mt-1" style={{ color: VS.text2 }}>
          Your personal, employment, and banking details. Only visible to you and authorized administrators.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Employee Information */}
        <Section title="Employee Information" icon={User}>
          <Field label="Full Name" value={form.legalName} onChange={set('legalName')} placeholder="As shown on ID" />
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
        </Section>

        {/* Spouse Information */}
        <Section title="Spouse Information" icon={Heart}>
          <Field label="Spouse's Name" value={form.spouseName} onChange={set('spouseName')} />
          <Field label="Spouse's Employer" value={form.spouseEmployer} onChange={set('spouseEmployer')} />
          <Field label="Spouse's Work Phone" value={form.spouseWorkPhone} onChange={set('spouseWorkPhone')} />
        </Section>

        {/* Job Information */}
        <Section title="Job Information" icon={Briefcase}>
          <Field label="Job Title" value={form.jobTitle} onChange={set('jobTitle')} />
          <Field label="Supervisor" value={form.supervisor} onChange={set('supervisor')} />
          <Field label="Client" value={form.client} onChange={set('client')} />
          <Field label="E-mail Address" value={form.workEmail} onChange={set('workEmail')} type="email" />
          <Field label="Cell Phone" value={form.workCellPhone} onChange={set('workCellPhone')} />
          <Field label="Start Date" value={form.startDate} onChange={set('startDate')} type="date" />
          <Field label="Salary" value={form.salary} onChange={set('salary')} placeholder="0.00" />
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Employment Type</label>
            <select className={inputCls} style={inputStyle} value={form.employmentType}
              onChange={e => setForm(prev => ({ ...prev, employmentType: e.target.value }))}>
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="casual">Casual</option>
              <option value="contractor">Contractor</option>
            </select>
          </div>
        </Section>

        {/* Emergency Contact */}
        <Section title="Emergency Contact Information" icon={Phone}>
          <Field label="Full Name" value={form.emergencyContactName} onChange={set('emergencyContactName')} />
          <Field label="Address" value={form.emergencyContactAddress} onChange={set('emergencyContactAddress')} colSpan="sm:col-span-2" />
          <Field label="Primary Phone" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} />
          <Field label="Cell Phone" value={form.emergencyContactCell} onChange={set('emergencyContactCell')} />
          <Field label="Relationship" value={form.emergencyContactRelation} onChange={set('emergencyContactRelation')} placeholder="Spouse, Parent, etc." />
        </Section>

        {/* Bank Details */}
        <Section title="Bank Details" icon={Landmark}>
          <Field label="Bank Name" value={form.bankName} onChange={set('bankName')} placeholder="e.g. Commonwealth Bank" />
          <Field label="Account Number" value={form.accountNumber} onChange={set('accountNumber')} />
          <Field label="Wise Username" value={form.wiseUsername} onChange={set('wiseUsername')} placeholder="@username" />
        </Section>

        {/* References */}
        <Section title="References (3)" icon={Users}>
          <Field label="Reference 1 — Name" value={form.ref1Name} onChange={set('ref1Name')} />
          <Field label="Reference 1 — Phone" value={form.ref1Phone} onChange={set('ref1Phone')} />
          <Field label="Reference 1 — Relationship" value={form.ref1Relationship} onChange={set('ref1Relationship')} />
          <Field label="Reference 2 — Name" value={form.ref2Name} onChange={set('ref2Name')} />
          <Field label="Reference 2 — Phone" value={form.ref2Phone} onChange={set('ref2Phone')} />
          <Field label="Reference 2 — Relationship" value={form.ref2Relationship} onChange={set('ref2Relationship')} />
          <Field label="Reference 3 — Name" value={form.ref3Name} onChange={set('ref3Name')} />
          <Field label="Reference 3 — Phone" value={form.ref3Phone} onChange={set('ref3Phone')} />
          <Field label="Reference 3 — Relationship" value={form.ref3Relationship} onChange={set('ref3Relationship')} />
        </Section>

        {/* Valid ID Upload */}
        <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
          <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${VS.border}` }}>
            <FileText className="h-4 w-4" style={{ color: VS.accent }} />
            <h2 className="text-[14px] font-bold" style={{ color: VS.text0 }}>Upload Valid ID</h2>
          </div>
          <div className="p-5">
            <p className="text-[12px] mb-3" style={{ color: VS.text2 }}>
              Upload a photo or scan of a valid government ID (passport, driver's license, etc.)
            </p>
            <div className="flex items-center gap-3">
              <label
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-all hover:opacity-90"
                style={{ background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text1 }}
              >
                <Upload className="h-4 w-4" />
                Choose File
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    // Convert to base64 data URL for simple storage
                    const reader = new FileReader();
                    reader.onload = () => {
                      setForm(prev => ({
                        ...prev,
                        validIdUrl: reader.result as string,
                        validIdFilename: file.name,
                      }));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {form.validIdFilename && (
                <span className="text-[12px]" style={{ color: VS.teal }}>{form.validIdFilename}</span>
              )}
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-all hover:opacity-90"
            style={{ background: VS.accent, color: '#fff' }}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
          <p className="text-[11px]" style={{ color: VS.text2 }}>
            Your data is only visible to authorized personnel.
          </p>
        </div>
      </form>

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
