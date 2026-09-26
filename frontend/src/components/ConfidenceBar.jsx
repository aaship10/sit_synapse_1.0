/** Horizontal confidence meter. percent: 0–100 */
export default function ConfidenceBar({ percent, className = '' }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label="Confidence"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${value}%` }} />
      </div>
      <span className="w-11 text-right font-mono text-[13px] font-medium text-text-primary">{value}%</span>
    </div>
  );
}
