import { useState, useEffect } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import { User, Phone, MapPin, Shield, Building2, Landmark, Save, CheckCircle, AlertTriangle } from 'lucide-react';
import { VS } from '../lib/theme';

const inputCls = 'w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#007acc]/50 transition-all';
const inputStyle: React.CSSProperties = { background: VS.bg3, border: `1px solid ${VS.border2}`, color: VS.text0 };
const labelCls = 'block text-[12px] font-semibold mb-1.5';

interface Profile {
  legalName: string; dateOfBirth: string; phone: string;
  streetAddress: string; city: string; state: string; postcode: string; country: string;
  emergencyContactName: string; emergencyContactPhone: string; emergencyContactRelation: string;
  tfn: string; superFundName: string; superMemberNumber: string;
  bankName: string; bsb: string; accountNumber: string; accountName: string;
  employmentType: string; startDate: string;
}

const EMPTY: Profile = {
  legalName: '', dateOfBirth: '', phone: '',
  streetAddress: '', city: '', state: '', postcode: '', country: 'Australia',
  emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
  tfn: '', superFundName: '', superMemberNumber: '',
  bankName: '', bsb: '', accountNumber: '', accountName: '',
  employmentType: 'full-time', startDate: '',
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
          setForm({
            legalName: p.legalName || '',
            dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split('T')[0] : '',
            phone: p.phone || '',
            streetAddress: p.streetAddress || '',
            city: p.city || '',
            state: p.state || '',
            postcode: p.postcode || '',
            country: p.country || 'Australia',
            emergencyContactName: p.emergencyContactName || '',
            emergencyContactPhone: p.emergencyContactPhone || '',
            emergencyContactRelation: p.emergencyContactRelation || '',
            tfn: p.tfn || '',
            superFundName: p.superFundName || '',
            superMemberNumber: p.superMemberNumber || '',
            bankName: p.bankName || '',
            bsb: p.bsb || '',
            accountNumber: p.accountNumber || '',
            accountName: p.accountName || '',
            employmentType: p.employmentType || 'full-time',
            startDate: p.startDate ? new Date(p.startDate).toISOString().split('T')[0] : '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

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
      {/* Header */}
      <div>
        <h1 className="text-[18px] font-bold" style={{ color: VS.text0 }}>Employee Profile</h1>
        <p className="text-[13px] mt-1" style={{ color: VS.text2 }}>
          Your personal and banking details for payroll. This information is only visible to you and authorized administrators.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Personal Information */}
        <Section title="Personal Information" icon={User}>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Legal Full Name</label>
            <input className={inputCls} style={inputStyle} value={form.legalName} onChange={set('legalName')} placeholder="As shown on ID" />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Date of Birth</label>
            <input className={inputCls} style={inputStyle} type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Phone Number</label>
            <input className={inputCls} style={inputStyle} value={form.phone} onChange={set('phone')} placeholder="+61 400 000 000" />
          </div>
        </Section>

        {/* Address */}
        <Section title="Address" icon={MapPin}>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelCls} style={{ color: VS.text2 }}>Street Address</label>
            <input className={inputCls} style={inputStyle} value={form.streetAddress} onChange={set('streetAddress')} placeholder="123 Example Street" />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>City / Suburb</label>
            <input className={inputCls} style={inputStyle} value={form.city} onChange={set('city')} placeholder="Sydney" />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>State</label>
            <input className={inputCls} style={inputStyle} value={form.state} onChange={set('state')} placeholder="NSW" />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Postcode</label>
            <input className={inputCls} style={inputStyle} value={form.postcode} onChange={set('postcode')} placeholder="2000" />
          </div>
        </Section>

        {/* Emergency Contact */}
        <Section title="Emergency Contact" icon={Phone}>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Contact Name</label>
            <input className={inputCls} style={inputStyle} value={form.emergencyContactName} onChange={set('emergencyContactName')} placeholder="Full name" />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Contact Phone</label>
            <input className={inputCls} style={inputStyle} value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} placeholder="+61 400 000 000" />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Relationship</label>
            <input className={inputCls} style={inputStyle} value={form.emergencyContactRelation} onChange={set('emergencyContactRelation')} placeholder="Spouse, Parent, etc." />
          </div>
        </Section>

        {/* Employment */}
        <Section title="Employment" icon={Building2}>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Employment Type</label>
            <select className={inputCls} style={inputStyle} value={form.employmentType} onChange={set('employmentType')}>
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="casual">Casual</option>
              <option value="contractor">Contractor</option>
            </select>
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Start Date</label>
            <input className={inputCls} style={inputStyle} type="date" value={form.startDate} onChange={set('startDate')} />
          </div>
        </Section>

        {/* Tax & Super */}
        <Section title="Tax & Superannuation" icon={Shield}>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Tax File Number (TFN)</label>
            <input className={inputCls} style={inputStyle} value={form.tfn} onChange={set('tfn')} placeholder="000 000 000" />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Super Fund Name</label>
            <input className={inputCls} style={inputStyle} value={form.superFundName} onChange={set('superFundName')} placeholder="e.g. AustralianSuper" />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Super Member Number</label>
            <input className={inputCls} style={inputStyle} value={form.superMemberNumber} onChange={set('superMemberNumber')} />
          </div>
        </Section>

        {/* Bank Details */}
        <Section title="Bank Details" icon={Landmark}>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Bank Name</label>
            <input className={inputCls} style={inputStyle} value={form.bankName} onChange={set('bankName')} placeholder="e.g. Commonwealth Bank" />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>BSB</label>
            <input className={inputCls} style={inputStyle} value={form.bsb} onChange={set('bsb')} placeholder="000-000" maxLength={7} />
          </div>
          <div>
            <label className={labelCls} style={{ color: VS.text2 }}>Account Number</label>
            <input className={inputCls} style={inputStyle} value={form.accountNumber} onChange={set('accountNumber')} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} style={{ color: VS.text2 }}>Account Name</label>
            <input className={inputCls} style={inputStyle} value={form.accountName} onChange={set('accountName')} placeholder="Name on bank account" />
          </div>
        </Section>

        {/* Save button */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-all hover:opacity-90"
            style={{ background: VS.accent, color: '#fff' }}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
          <p className="text-[11px]" style={{ color: VS.text2 }}>
            Your data is encrypted and only visible to authorized personnel.
          </p>
        </div>
      </form>

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
