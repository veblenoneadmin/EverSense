import { useState, useEffect } from 'react';
import { useSession } from '../lib/auth-client';
import { useApiClient } from '../lib/api-client';
import { Users, Search, ChevronDown, ChevronUp, Landmark, Phone, MapPin, Shield, Building2, X } from 'lucide-react';
import { VS } from '../lib/theme';

interface EmployeeProfile {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  legalName: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  tfn: string | null;
  superFundName: string | null;
  superMemberNumber: string | null;
  bankName: string | null;
  bsb: string | null;
  accountNumber: string | null;
  accountName: string | null;
  employmentType: string | null;
  startDate: string | null;
}

const ROLE_COLOR: Record<string, string> = {
  OWNER: VS.yellow, ADMIN: VS.blue, STAFF: VS.teal, CLIENT: VS.text2,
  HALL_OF_JUSTICE: '#f59e0b', ACCOUNTANT: VS.purple,
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-[11px] font-medium shrink-0 w-32" style={{ color: VS.text2 }}>{label}</span>
      <span className="text-[12px]" style={{ color: value ? VS.text0 : VS.text2 }}>{value || '—'}</span>
    </div>
  );
}

function DetailSection({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5" style={{ color: VS.accent }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: VS.text2 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export function EmployeeDirectory() {
  const { data: session } = useSession();
  const apiClient = useApiClient();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    apiClient.fetch('/api/employee-profiles/all')
      .then((d: any) => setProfiles(d.profiles || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = profiles.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.userName?.toLowerCase().includes(q) || p.userEmail?.toLowerCase().includes(q) || p.legalName?.toLowerCase().includes(q));
  });

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: VS.text0 }}>Employee Directory</h1>
          <p className="text-[13px] mt-1" style={{ color: VS.text2 }}>
            {profiles.length} employee profile{profiles.length !== 1 ? 's' : ''} on file
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: VS.text2 }} />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#007acc]/50"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text0 }}
            placeholder="Search employees…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
          <Users className="h-10 w-10 mx-auto mb-3" style={{ color: VS.text2, opacity: 0.4 }} />
          <p className="text-[14px] font-medium" style={{ color: VS.text1 }}>No employee profiles yet</p>
          <p className="text-[12px] mt-1" style={{ color: VS.text2 }}>
            Employees can fill in their profile from the "My Profile" page in the sidebar.
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
          {/* Table header */}
          <div className="grid grid-cols-[1fr_120px_120px_120px_100px] px-5 py-3 text-[11px] font-semibold uppercase tracking-wider"
            style={{ borderBottom: `1px solid ${VS.border}`, color: VS.text2 }}>
            <span>Employee</span>
            <span>Role</span>
            <span>Type</span>
            <span>Start Date</span>
            <span className="text-center">Bank</span>
          </div>

          {/* Rows */}
          {filtered.map((p, i) => {
            const isExp = expanded === p.id;
            const hasBank = !!(p.bankName || p.bsb || p.accountNumber);
            return (
              <div key={p.id}>
                <div
                  onClick={() => setExpanded(isExp ? null : p.id)}
                  className="grid grid-cols-[1fr_120px_120px_120px_100px] px-5 py-3 items-center cursor-pointer hover:bg-white/[0.02] transition-colors"
                  style={{ borderBottom: isExp ? 'none' : `1px solid ${VS.border}` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isExp ? <ChevronUp className="h-3 w-3 shrink-0" style={{ color: VS.text2 }} /> : <ChevronDown className="h-3 w-3 shrink-0" style={{ color: VS.text2 }} />}
                    <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ background: `${VS.accent}22`, color: VS.accent }}>
                      {(p.userName || p.userEmail)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate" style={{ color: VS.text0 }}>{p.userName || '—'}</div>
                      <div className="text-[11px] truncate" style={{ color: VS.text2 }}>{p.userEmail}</div>
                    </div>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium w-fit"
                    style={{ background: `${ROLE_COLOR[p.userRole] || VS.text2}18`, color: ROLE_COLOR[p.userRole] || VS.text2 }}>
                    {p.userRole?.toLowerCase()}
                  </span>
                  <span className="text-[12px]" style={{ color: VS.text1 }}>{p.employmentType || '—'}</span>
                  <span className="text-[12px]" style={{ color: VS.text1 }}>{fmtDate(p.startDate)}</span>
                  <span className="text-[11px] text-center" style={{ color: hasBank ? VS.teal : VS.text2 }}>
                    {hasBank ? '✓' : '—'}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div className="px-12 pb-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                    style={{ borderBottom: `1px solid ${VS.border}`, background: `${VS.accent}04` }}>
                    <DetailSection title="Personal" icon={Users}>
                      <DetailRow label="Legal Name" value={p.legalName} />
                      <DetailRow label="Date of Birth" value={fmtDate(p.dateOfBirth)} />
                      <DetailRow label="Phone" value={p.phone} />
                    </DetailSection>
                    <DetailSection title="Address" icon={MapPin}>
                      <DetailRow label="Street" value={p.streetAddress} />
                      <DetailRow label="City" value={p.city} />
                      <DetailRow label="State" value={p.state} />
                      <DetailRow label="Postcode" value={p.postcode} />
                    </DetailSection>
                    <DetailSection title="Tax & Super" icon={Shield}>
                      <DetailRow label="TFN" value={p.tfn} />
                      <DetailRow label="Super Fund" value={p.superFundName} />
                      <DetailRow label="Member No." value={p.superMemberNumber} />
                    </DetailSection>
                    <DetailSection title="Bank Details" icon={Landmark}>
                      <DetailRow label="Bank" value={p.bankName} />
                      <DetailRow label="BSB" value={p.bsb} />
                      <DetailRow label="Account No." value={p.accountNumber} />
                      <DetailRow label="Account Name" value={p.accountName} />
                    </DetailSection>
                    <DetailSection title="Emergency Contact" icon={Phone}>
                      <DetailRow label="Name" value={p.emergencyContactName} />
                      <DetailRow label="Phone" value={p.emergencyContactPhone} />
                      <DetailRow label="Relation" value={p.emergencyContactRelation} />
                    </DetailSection>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
