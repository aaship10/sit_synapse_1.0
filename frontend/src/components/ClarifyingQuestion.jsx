import { useState } from 'react';
import { CircleHelp } from 'lucide-react';

/** Callout asking the technician a follow-up question to refine the ranking. */
export default function ClarifyingQuestion({ question, why, options = [] }) {
  const [answer, setAnswer] = useState(null);
  return (
    <section className="rounded-card border border-border border-l-4 border-l-severity-warning bg-surface px-5 py-5">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-severity-warning">
        <CircleHelp size={18} /> Clarifying question
      </div>
      <p className="mt-2 font-medium leading-6">{question}</p>
      {why && <p className="mt-2 text-[14px] text-text-secondary">{why}</p>}

      {options.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setAnswer(opt)}
              aria-pressed={answer === opt}
              className={`rounded-btn border px-3 py-1.5 text-[14px] transition-colors ${
                answer === opt
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-surface hover:border-primary hover:text-primary'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {answer && (
        <p className="mt-3 text-[13px] text-text-secondary">
          Answer recorded. Re-ranking will use this once the backend is connected.
        </p>
      )}
    </section>
  );
}
