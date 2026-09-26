import { OctagonAlert, TriangleAlert, ShieldCheck } from 'lucide-react';
import { SEVERITY } from '../utils/severity.js';

const ICONS = { critical: OctagonAlert, warning: TriangleAlert, safe: ShieldCheck };

/** Full-width severity banner for a diagnosis result. */
export default function SeverityBanner({ level, reason }) {
  const s = SEVERITY[level];
  const Icon = ICONS[level];
  return (
    <div className={`flex items-start gap-4 rounded-card px-6 py-5 ${s.bg}`} role="status">
      <Icon size={28} className={`mt-0.5 shrink-0 ${s.text}`} />
      <div>
        <div className={`text-[13px] font-semibold uppercase tracking-wider ${s.text}`}>{s.label} severity</div>
        <div className="mt-0.5 text-[19px] font-semibold leading-7 text-text-primary">{s.headline}</div>
        <p className="mt-1 max-w-3xl text-text-primary/80">{reason}</p>
      </div>
    </div>
  );
}
