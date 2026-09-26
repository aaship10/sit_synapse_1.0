import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export const DIAGNOSIS_STEPS = [
  'Decoding fault codes',
  'Searching service docs',
  'Cross-referencing symptoms',
  'Ranking causes',
];

/**
 * Modal checklist shown while a diagnosis runs.
 * currentStep: index of the step in progress (steps before it render as done;
 * steps.length means everything is complete).
 */
export default function MultiStepLoader({ open, currentStep, steps = DIAGNOSIS_STEPS }) {
  if (!open) return null;
  const progress = Math.min(100, (currentStep / steps.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 p-4" role="dialog" aria-modal="true" aria-labelledby="loader-title">
      <div className="w-full max-w-md rounded-card bg-surface shadow-xl">
        <div className="px-6 pb-2 pt-6">
          <h2 id="loader-title">Running diagnosis</h2>
          <p className="mt-1 text-[14px] text-text-secondary">This usually takes a few seconds.</p>
        </div>

        <ol className="space-y-4 px-6 py-5" aria-live="polite">
          {steps.map((label, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (
              <li key={label} className="flex items-center gap-3">
                {done && <CheckCircle2 size={20} className="shrink-0 text-severity-safe" />}
                {active && <Loader2 size={20} className="shrink-0 animate-spin text-primary" />}
                {!done && !active && <Circle size={20} className="shrink-0 text-border" />}
                <span
                  className={`text-[15px] ${
                    active ? 'font-medium text-text-primary' : done ? 'text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  {label}
                  {active && '…'}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="h-1 overflow-hidden rounded-b-card bg-surface-muted">
          <div className="h-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
