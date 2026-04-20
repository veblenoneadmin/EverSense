import { Link } from 'react-router-dom';
import { CheckSquare, Clock, BarChart3, Users, Shield, ArrowRight, Zap, FileText, Calendar, X, Check, Sparkles } from 'lucide-react';
import { EverSenseLogo } from '../components/EverSenseLogo';

const VS = {
  bg0: '#1e1e1e', bg1: '#252526', bg2: '#2d2d2d', bg3: '#333333',
  border: '#3c3c3c', border2: '#454545',
  text0: '#f0f0f0', text1: '#c0c0c0', text2: '#909090',
  accent: '#007acc', teal: '#4ec9b0', blue: '#569cd6', purple: '#c586c0', orange: '#ce9178', yellow: '#dcdcaa',
};

const FEATURES = [
  { icon: CheckSquare, title: 'Task Management', desc: 'Kanban boards, team tasks, dependencies, and smart priorities', color: VS.accent },
  { icon: Clock,       title: 'Time Tracking',   desc: 'Built-in timers, attendance, and automated timesheets',          color: VS.teal },
  { icon: BarChart3,   title: 'KPI & Reports',   desc: 'Real-time performance metrics for you and your team',            color: VS.purple },
  { icon: Calendar,    title: 'Milestones',      desc: 'Break projects into milestones and track completion',            color: VS.orange },
  { icon: FileText,    title: 'Contracts',       desc: 'Generate, sign, and manage employment contracts in-app',         color: VS.yellow },
  { icon: Users,       title: 'Team Collaboration', desc: 'Comments, @mentions, attachments, and activity feeds',        color: VS.blue },
];

export function Landing() {
  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: VS.bg0, color: VS.text0 }}>
      {/* Pulsing background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute" style={{ background: 'radial-gradient(ellipse at 20% 30%, rgba(0,122,204,0.08) 0%, transparent 60%)', inset: 0 }} />
        <div className="absolute" style={{ background: 'radial-gradient(ellipse at 80% 70%, rgba(78,201,176,0.05) 0%, transparent 60%)', inset: 0 }} />
        <div className="absolute rounded-full blur-3xl animate-pulse" style={{ top: '10%', left: '10%', width: 480, height: 480, background: 'rgba(0,122,204,0.08)' }} />
        <div className="absolute rounded-full blur-3xl animate-pulse" style={{ bottom: '10%', right: '10%', width: 440, height: 440, background: 'rgba(78,201,176,0.06)', animationDelay: '1.5s' }} />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5">
        <EverSenseLogo height={38} width={190} />
        <div className="flex items-center gap-3">
          <Link to="/login"
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all hover:opacity-90"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text1, textDecoration: 'none' }}>
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-12 pb-16 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6 text-[11px] font-semibold uppercase tracking-wider"
          style={{ background: `${VS.accent}18`, color: VS.accent, border: `1px solid ${VS.accent}33` }}>
          <Zap className="h-3 w-3" /> Intelligent Platform
        </div>

        <h1 className="text-[40px] md:text-[56px] font-bold leading-[1.1] mb-5" style={{ color: VS.text0 }}>
          Run your agency<br />
          <span style={{ background: `linear-gradient(90deg, ${VS.accent}, ${VS.teal})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            with one platform.
          </span>
        </h1>

        <p className="text-[15px] md:text-[17px] max-w-2xl mb-8" style={{ color: VS.text2, lineHeight: 1.6 }}>
          Task management, time tracking, client reporting, and team collaboration — built for modern creative and technical agencies. One login. One source of truth.
        </p>

        <div className="flex items-center gap-3 flex-wrap justify-center">
          <Link to="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-[14px] font-semibold transition-all hover:opacity-90"
            style={{ background: VS.accent, color: '#fff', textDecoration: 'none' }}>
            Sign In <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#features"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-[14px] font-medium transition-all hover:opacity-90"
            style={{ background: VS.bg2, border: `1px solid ${VS.border}`, color: VS.text1, textDecoration: 'none' }}>
            Learn More
          </a>
        </div>

        <div className="mt-8 flex items-center gap-2 text-[12px]" style={{ color: VS.text2 }}>
          <Shield className="h-3.5 w-3.5" style={{ color: VS.teal }} />
          Invitation-only — internal platform for Veblen Group
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="relative z-10 px-6 md:px-12 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: VS.accent }}>Everything you need</p>
          <h2 className="text-[28px] md:text-[36px] font-bold" style={{ color: VS.text0 }}>Built for how agencies actually work</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl p-5 transition-all hover:translate-y-[-2px]"
              style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
              <div className="h-10 w-10 rounded-lg flex items-center justify-center mb-3"
                style={{ background: `${f.color}18`, border: `1px solid ${f.color}33` }}>
                <f.icon className="h-5 w-5" style={{ color: f.color }} />
              </div>
              <h3 className="text-[15px] font-bold mb-1.5" style={{ color: VS.text0 }}>{f.title}</h3>
              <p className="text-[13px]" style={{ color: VS.text2, lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Interface Preview — look and feel */}
      <section className="relative z-10 px-6 md:px-12 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: VS.teal }}>Look & Feel</p>
          <h2 className="text-[28px] md:text-[36px] font-bold mb-3" style={{ color: VS.text0 }}>A developer-inspired interface</h2>
          <p className="text-[14px] max-w-2xl mx-auto" style={{ color: VS.text2 }}>
            VS Code dark theme, keyboard-friendly navigation, monospace accents. Fast, focused, no-nonsense.
          </p>
        </div>

        {/* Mockup dashboard */}
        <div className="rounded-2xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border2}`, boxShadow: '0 24px 80px rgba(0,122,204,0.15)' }}>
          {/* Window chrome */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ background: '#323233', borderBottom: `1px solid ${VS.border}` }}>
            <span className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
            <span className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
            <span className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
            <span className="ml-3 text-[11px]" style={{ color: VS.text2, fontFamily: 'monospace' }}>EverSense Ai — dashboard.tsx</span>
          </div>

          <div className="flex" style={{ minHeight: 360 }}>
            {/* Sidebar */}
            <div className="w-48 p-3 space-y-1 hidden sm:block" style={{ background: VS.bg1, borderRight: `1px solid ${VS.border}` }}>
              {['Dashboard', 'Tasks', 'Milestones', 'Calendar', 'Meetings', 'Projects', 'Reports', 'KPI Report'].map((item, i) => (
                <div key={item} className="flex items-center gap-2 px-3 py-1.5 rounded text-[12px]"
                  style={{ background: i === 1 ? `${VS.accent}22` : 'transparent', color: i === 1 ? VS.text0 : VS.text2, borderLeft: i === 1 ? `2px solid ${VS.accent}` : '2px solid transparent' }}>
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: i === 1 ? VS.accent : VS.text2, opacity: i === 1 ? 1 : 0.4 }} />
                  {item}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[11px]" style={{ color: VS.text2 }}>MY TASKS</p>
                  <p className="text-[16px] font-bold" style={{ color: VS.text0 }}>Active Board</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-2.5 py-1 rounded text-[10px] font-bold" style={{ background: `${VS.teal}22`, color: VS.teal }}>3 IN PROGRESS</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { col: 'To Do', color: VS.text2, cards: [{ t: 'Client onboarding', p: 'High', pc: VS.red }, { t: 'Update campaign briefs', p: 'Medium', pc: VS.yellow }] },
                  { col: 'In Progress', color: VS.accent, cards: [{ t: 'Meta Ads setup', p: 'Urgent', pc: VS.red }, { t: 'Q2 report draft', p: 'High', pc: VS.orange }] },
                  { col: 'Done', color: VS.teal, cards: [{ t: 'Logo revisions', p: 'Low', pc: VS.text2 }] },
                ].map(col => (
                  <div key={col.col} className="space-y-2">
                    <div className="flex items-center justify-between px-1 pb-1" style={{ borderBottom: `1px solid ${col.color}33` }}>
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: col.color }}>{col.col}</span>
                      <span className="text-[10px]" style={{ color: VS.text2 }}>{col.cards.length}</span>
                    </div>
                    {col.cards.map((c, i) => (
                      <div key={i} className="rounded-lg p-2.5" style={{ background: VS.bg2, border: `1px solid ${VS.border}` }}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${c.pc}22`, color: c.pc }}>{c.p}</span>
                        </div>
                        <p className="text-[12px] font-medium leading-tight" style={{ color: VS.text0 }}>{c.t}</p>
                        <div className="flex items-center gap-2 mt-2 text-[10px]" style={{ color: VS.text2 }}>
                          <Clock className="h-2.5 w-2.5" /> 2h 30m
                          <CheckSquare className="h-2.5 w-2.5 ml-1" /> 2/5
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-1.5 text-[10px]" style={{ background: VS.accent, color: '#fff', fontFamily: 'monospace' }}>
            <span>⎇ main</span>
            <span>EverSense Ai v1.0 · Intelligent Platform</span>
          </div>
        </div>
      </section>

      {/* Why EverSense — comparison */}
      <section className="relative z-10 px-6 md:px-12 py-16 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: VS.purple }}>
            <Sparkles className="inline h-3 w-3 mr-1" /> Why EverSense
          </p>
          <h2 className="text-[28px] md:text-[36px] font-bold mb-3" style={{ color: VS.text0 }}>Built different from the rest</h2>
          <p className="text-[14px] max-w-2xl mx-auto" style={{ color: VS.text2 }}>
            We didn't bolt features onto a generic tool. Every piece is designed for an agency's actual workflow.
          </p>
        </div>

        <div className="rounded-xl overflow-hidden" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
          <div className="grid grid-cols-5 px-5 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ borderBottom: `1px solid ${VS.border}`, color: VS.text2 }}>
            <div className="col-span-2">Feature</div>
            <div className="text-center" style={{ color: VS.accent }}>EverSense</div>
            <div className="text-center">ClickUp / Asana</div>
            <div className="text-center">Trello / Notion</div>
          </div>

          {[
            ['Task + Time in one view', true, 'addon', false],
            ['Auto attendance + 9h30 clockout', true, false, false],
            ['Team tasks with per-assignee progress', true, false, false],
            ['Contract signing built in', true, false, false],
            ['Employee profile + bank details', true, false, false],
            ['KPI tied to tracked time', true, 'partial', false],
            ['VS Code-style dark interface', true, false, false],
            ['Meeting transcripts (Fireflies)', true, false, false],
            ['No monthly per-seat fees', true, false, 'partial'],
          ].map(([feature, ever, competitor1, competitor2], i) => (
            <div key={i} className="grid grid-cols-5 px-5 py-3 text-[13px] items-center" style={{ borderBottom: i < 8 ? `1px solid ${VS.border}` : 'none' }}>
              <div className="col-span-2" style={{ color: VS.text1 }}>{feature as string}</div>
              <div className="text-center">
                <Check className="h-4 w-4 inline" style={{ color: VS.teal }} strokeWidth={3} />
              </div>
              <div className="text-center">
                {competitor1 === true ? <Check className="h-4 w-4 inline" style={{ color: VS.teal }} /> :
                 competitor1 === 'partial' ? <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${VS.yellow}22`, color: VS.yellow }}>Partial</span> :
                 competitor1 === 'addon' ? <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${VS.orange}22`, color: VS.orange }}>Paid Add-on</span> :
                 <X className="h-4 w-4 inline" style={{ color: VS.text2, opacity: 0.4 }} />}
              </div>
              <div className="text-center">
                {competitor2 === true ? <Check className="h-4 w-4 inline" style={{ color: VS.teal }} /> :
                 competitor2 === 'partial' ? <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${VS.yellow}22`, color: VS.yellow }}>Partial</span> :
                 <X className="h-4 w-4 inline" style={{ color: VS.text2, opacity: 0.4 }} />}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          {[
            { title: 'One platform', desc: 'No juggling between Slack, Asana, Toggl, DocuSign, and a dozen spreadsheets. It all lives here.' },
            { title: 'Built for agencies', desc: 'Client-specific projects, billable time, retainer tracking, invoice-ready hours — not generic PM.' },
            { title: 'Designed for speed', desc: 'Minimal clicks, keyboard shortcuts, instant search. Built by developers who use it every day.' },
          ].map(b => (
            <div key={b.title} className="rounded-xl p-4" style={{ background: VS.bg1, border: `1px solid ${VS.border}` }}>
              <p className="text-[13px] font-bold mb-1.5" style={{ color: VS.accent }}>{b.title}</p>
              <p className="text-[12px]" style={{ color: VS.text2, lineHeight: 1.6 }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 py-16 text-center">
        <div className="max-w-2xl mx-auto rounded-2xl p-10"
          style={{ background: `linear-gradient(135deg, ${VS.bg1}, ${VS.bg2})`, border: `1px solid ${VS.accent}33` }}>
          <h3 className="text-[22px] md:text-[28px] font-bold mb-3" style={{ color: VS.text0 }}>Ready to get started?</h3>
          <p className="text-[14px] mb-6" style={{ color: VS.text2 }}>Sign in with your team email to access your dashboard.</p>
          <Link to="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-[14px] font-semibold transition-all hover:opacity-90"
            style={{ background: VS.accent, color: '#fff', textDecoration: 'none' }}>
            Sign In to EverSense <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t py-6 px-6 text-center text-[11px]"
        style={{ borderColor: VS.border, color: VS.text2 }}>
        © {new Date().getFullYear()} Veblen Group — EverSense Ai · Internal Platform
      </footer>
    </div>
  );
}
