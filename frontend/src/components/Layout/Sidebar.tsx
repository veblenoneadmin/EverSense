import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSession } from '../../lib/auth-client';
import { EverSenseLogo } from '../EverSenseLogo';
import {
  LayoutDashboard,
  CheckSquare,
  Clock,
  Settings,
  BarChart3,
  Building2,
  Users,
  Shield,
  Star,
  CalendarDays,
  FileBarChart,
  Video,
} from 'lucide-react';

// VS Code Dark+ tokens — match MainLayout
const VS = {
  bg1:      '#252526',
  bg2:      '#2d2d2d',
  border:   '#3c3c3c',
  text0:    '#f0f0f0',
  text1:    '#c0c0c0',
  text2:    '#909090',
  accent:   '#007acc',
  accentBg: 'rgba(0,122,204,0.15)',
};

const navItems = [
  { name: 'Dashboard',      href: '/dashboard',  icon: LayoutDashboard, roles: ['OWNER', 'ADMIN', 'STAFF', 'CLIENT'] },
  { name: 'Tasks',          href: '/tasks',       icon: CheckSquare,     roles: ['OWNER', 'ADMIN', 'STAFF', 'CLIENT'] },
  { name: 'Calendar',       href: '/calendar',    icon: CalendarDays,    roles: ['OWNER', 'ADMIN', 'STAFF', 'CLIENT'] },
  { name: 'Meetings',       href: '/meetings',    icon: Video,           roles: ['OWNER', 'ADMIN', 'STAFF'] },
  { name: 'Skills',         href: '/skills',      icon: Star,            roles: ['OWNER', 'ADMIN', 'STAFF'] },
  { name: 'Projects',       href: '/projects',    icon: Building2,       roles: ['OWNER', 'ADMIN', 'STAFF', 'CLIENT'] },
  { name: 'Time Logs',      href: '/timesheets',  icon: Clock,           roles: ['OWNER', 'ADMIN', 'STAFF', 'CLIENT'] },
  { name: 'Clients',        href: '/clients',     icon: Users,           roles: ['OWNER', 'ADMIN'] },
  { name: 'Reports',        href: '/reports',     icon: BarChart3,       roles: ['OWNER', 'ADMIN', 'STAFF'] },
  { name: 'KPI Report',     href: '/kpi-report',  icon: FileBarChart,    roles: ['OWNER', 'ADMIN', 'STAFF'] },
  { name: 'Administration', href: '/admin',       icon: Shield,          roles: ['OWNER', 'ADMIN'] },
  { name: 'Settings',       href: '/settings',    icon: Settings,        roles: ['OWNER', 'ADMIN', 'STAFF', 'CLIENT'] },
];

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { data: session } = useSession();
  const [userRole, setUserRole] = useState<string>('CLIENT');

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch('/api/organizations')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.organizations?.length > 0) {
          setUserRole(data.organizations[0].role || 'CLIENT');
        }
      })
      .catch(() => {});
  }, [session]);

  const visible = navItems.filter(item => item.roles.includes(userRole));

  return (
    <div
      className="fixed inset-y-0 left-0 z-50 w-60 flex flex-col"
      style={{ background: VS.bg1, borderRight: `1px solid ${VS.border}` }}
    >
      {/* Logo */}
      <div
        className="flex h-14 items-center gap-3 px-4 shrink-0"
        style={{ borderBottom: `1px solid ${VS.border}` }}
      >
        <EverSenseLogo height={36} width={211} />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visible.map(item => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href ||
            (item.href !== '/dashboard' && location.pathname.startsWith(item.href));

          return (
            <NavLink
              key={item.name}
              to={item.href}
              style={({ isActive: active }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 10px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: active ? 500 : 400,
                color: active ? VS.text0 : VS.text2,
                background: active ? VS.accentBg : 'transparent',
                borderLeft: active ? `2px solid ${VS.accent}` : '2px solid transparent',
                textDecoration: 'none',
                transition: 'background 0.15s, color 0.15s',
              })}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = VS.bg2;
                  (e.currentTarget as HTMLElement).style.color = VS.text1;
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = VS.text2;
                }
              }}
            >
              <Icon size={15} />
              {item.name}
            </NavLink>
          );
        })}
      </nav>

    </div>
  );
};

export default Sidebar;
