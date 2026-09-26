import { useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import ConfidenceBar from './ConfidenceBar.jsx';

function StepList({ title, steps }) {
  return (
    <div>
      <h4 className="mb-3 text-[15px] font-semibold">{title}</h4>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-6">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted font-mono text-[12px] font-medium text-text-secondary">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PartsTable({ parts }) {
  if (!parts.length) {
    return <p className="text-[14px] text-text-secondary">No parts required for this procedure.</p>;
  }
  return (
    <table className="w-full text-left text-[13px]">
      <thead>
        <tr className="border-b border-border text-text-secondary">
          <th className="py-2 pr-4 font-medium">Part number</th>
          <th className="py-2 pr-4 font-medium">Description</th>
          <th className="py-2 text-right font-medium">Qty</th>
        </tr>
      </thead>
      <tbody>
        {parts.map((p) => (
          <tr key={p.partNumber} className="border-b border-border last:border-0">
            <td className="py-2.5 pr-4 font-mono">{p.partNumber}</td>
            <td className="py-2.5 pr-4 text-[14px]">{p.description}</td>
            <td className="py-2.5 text-right font-mono">{p.qty}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Expandable ranked-cause card.
 * cause: { rank, title, confidence, summary, diagnosticSteps, repairSteps, parts, source }
 */
export default function DiagnosisCard({ cause, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = `cause-${cause.rank}-details`;
  const isTop = cause.rank === 1;

  return (
    <article className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-start gap-4 px-6 py-5 text-left transition-colors hover:bg-surface-muted/60"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-btn font-mono text-[15px] font-semibold ${
            isTop ? 'bg-primary text-white' : 'bg-surface-muted text-text-secondary'
          }`}
        >
          {cause.rank}
        </span>

        <div className="min-w-0 flex-1">
          <h3>{cause.title}</h3>
          <p className="mt-1 text-[14px] text-text-secondary">{cause.summary}</p>
        </div>

        <div className="hidden w-48 shrink-0 pt-1 sm:block">
          <div className="mb-1.5 text-[13px] text-text-secondary">Confidence</div>
          <ConfidenceBar percent={cause.confidence} />
        </div>

        <ChevronDown
          size={20}
          className={`mt-1.5 shrink-0 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div id={panelId} className="border-t border-border px-6 pb-6 pt-6">
          <div className="mb-6 sm:hidden">
            <div className="mb-1.5 text-[13px] text-text-secondary">Confidence</div>
            <ConfidenceBar percent={cause.confidence} />
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <StepList title="Diagnostic steps" steps={cause.diagnosticSteps} />
            <StepList title="Repair steps" steps={cause.repairSteps} />
          </div>

          <div className="mt-8">
            <h4 className="mb-2 text-[15px] font-semibold">Parts</h4>
            <PartsTable parts={cause.parts} />
          </div>

          <div className="mt-6 flex items-start gap-2 rounded-btn bg-surface-muted px-4 py-3 text-[14px] text-text-secondary">
            <FileText size={16} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-medium text-text-primary">Source:</span> {cause.source.document} — {cause.source.section},{' '}
              <span className="font-mono text-[13px]">p. {cause.source.page}</span>
            </span>
          </div>
        </div>
      )}
    </article>
  );
}
