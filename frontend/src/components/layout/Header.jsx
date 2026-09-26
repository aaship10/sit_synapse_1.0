import { NavLink, Link } from 'react-router-dom';
import { Activity } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/new-diagnosis', label: 'New Diagnosis' },
  { to: '/history', label: 'History' },
];

const TECHNICIAN = { name: 'J. Morales', role: 'Service technician' };

export default function Header() {
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
            <div className="text-[14px] font-medium leading-5">{TECHNICIAN.name}</div>
            <div className="text-[13px] leading-5 text-text-secondary">{TECHNICIAN.role}</div>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-[13px] font-semibold text-primary">
            JM
          </span>
        </div>
      </div>
    </header>
  );
}
