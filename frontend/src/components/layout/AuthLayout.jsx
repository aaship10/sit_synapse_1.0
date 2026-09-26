import { Link } from 'react-router-dom';
import { Activity, ListChecks, FileSearch, ShieldCheck } from 'lucide-react';

const FEATURES = [
  { icon: FileSearch, text: 'Decode J1939 and OBD-II fault codes instantly' },
  { icon: ListChecks, text: 'Ranked, cited causes with step-by-step repair procedures' },
  { icon: ShieldCheck, text: 'Severity guidance so you know what can wait' },
];

/**
 * Split-screen shell for /login and /signup: branded panel on the left,
 * the form card on the right. Collapses to a single column on small screens.
 */
export default function AuthLayout({ title, description, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-primary-dark px-12 py-10 text-white lg:flex">
        <div>
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-white/10">
              <Activity size={20} strokeWidth={2.25} />
            </span>
            <span className="text-[19px] font-semibold tracking-tight">DiagnosticIQ</span>
          </Link>

          <h1 className="mt-16 max-w-sm text-[28px] font-semibold leading-[1.3] text-white">
            AI diagnostic copilot for heavy-duty truck technicians
          </h1>
          <p className="mt-3 max-w-sm text-white/70">
            Fault codes and symptoms in, a ranked, cited diagnosis out — built for the shop floor.
          </p>
        </div>

        <ul className="space-y-5">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-white/10">
                <Icon size={16} />
              </span>
              <span className="text-[14px] leading-6 text-white/80">{text}</span>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-primary text-white">
              <Activity size={18} strokeWidth={2.25} />
            </span>
            <span className="text-[17px] font-semibold tracking-tight text-primary">DiagnosticIQ</span>
          </div>

          <h1 className="text-h1">{title}</h1>
          {description && <p className="mt-1 text-text-secondary">{description}</p>}

          <div className="panel mt-6 px-6 py-6">{children}</div>

          {footer && <p className="mt-6 text-center text-[14px] text-text-secondary">{footer}</p>}
        </div>
      </div>
    </div>
  );
}
