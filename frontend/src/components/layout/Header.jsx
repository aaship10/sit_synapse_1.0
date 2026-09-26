import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Activity, LogOut } from 'lucide-react';
import { getSession, logout } from '../../utils/auth.js';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/new-diagnosis', label: 'New Diagnosis' },
  { to: '/history', label: 'History' },
];

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export default function Header() {
  const navigate = useNavigate();
  const session = getSession();
  const technician = session ?? { name: 'Technician', shop: '' };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-10 px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-primary text-white">
            <Activity size={18} strokeWidth={2.25} />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-primary">DiagnosticIQ</span>
        </Link>

        <nav className="flex h-full items-stretch gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center border-b-2 px-3 text-[13px] font-semibold uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-[14px] font-medium leading-5">{technician.name}</div>
            <div className="truncate text-[13px] leading-5 text-text-secondary">{technician.shop || 'Service technician'}</div>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-[13px] font-semibold text-primary">
            {initials(technician.name)}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-btn text-text-secondary hover:bg-surface-muted hover:text-text-primary"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
