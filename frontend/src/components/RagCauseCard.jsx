import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import SeverityBadge from './SeverityBadge.jsx';

function DiagnosticStepList({ steps }) {
  if (!steps.length) {
    return <p className="text-[14px] text-text-secondary">No diagnostic procedure recorded for this fault.</p>;
  }
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted font-mono text-[12px] font-medium text-text-secondary">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] leading-6">{s.step}</p>
            {s.outcomes?.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {s.outcomes.map((o) => (
                  <span
                    key={o}
                    className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[12px] text-text-secondary"
                  >
                    {o}
                  </span>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Expandable card for a service-doc (RAG) match.
 * cause: { rank, faultName, systemCategory, severityLevel, matchedSymptoms, steps }
 */
export default function RagCauseCard({ cause, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = `cause-${cause.rank}-details`;

  return (
    <article className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-start gap-4 px-6 py-5 text-left transition-colors hover:bg-surface-muted/60"
      >
        {/* Numbering only - these are symptom-similarity matches, not a ranking of causes. */}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-surface-muted font-mono text-[15px] font-semibold text-text-secondary">
          {cause.rank}
        </span>

        <div className="min-w-0 flex-1">
          <h3>{cause.faultName}</h3>
          <p className="mt-1 text-[14px] text-text-secondary">{cause.systemCategory}</p>
        </div>

        <SeverityBadge level={cause.severityLevel} className="mt-1 shrink-0" />

        <ChevronDown
          size={20}
          className={`mt-1.5 shrink-0 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div id={panelId} className="border-t border-border px-6 pb-6 pt-6">
          {cause.matchedSymptoms.length > 0 && (
            <div className="mb-6">
              <h4 className="mb-2 text-[15px] font-semibold">Matched symptoms</h4>
              <ul className="list-inside list-disc space-y-1 text-[14px] text-text-secondary">
                {cause.matchedSymptoms.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <h4 className="mb-3 text-[15px] font-semibold">Diagnostic steps</h4>
          <DiagnosticStepList steps={cause.steps} />
        </div>
      )}
    </article>
  );
}
