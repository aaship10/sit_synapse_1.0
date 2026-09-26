import { SEVERITY } from '../utils/severity.js';

/** Severity pill. level: 'critical' | 'warning' | 'safe' */
export default function SeverityBadge({ level, className = '' }) {
  const s = SEVERITY[level];
  if (!s) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold uppercase leading-none tracking-wider ${s.bg} ${s.text} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}
