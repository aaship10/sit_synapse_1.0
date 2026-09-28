import { useState } from 'react';
import { CheckCircle2, RotateCcw, ThumbsUp, ThumbsDown, ArrowRight } from 'lucide-react';
import SeverityBadge from './SeverityBadge.jsx';

/**
 * Walks the technician through the ranked causes' diagnostic steps one at a
 * time instead of dumping the whole procedure at once: show a step, wait for
 * the technician to report what happened, ask whether that resolved it, and
 * only then reveal the next step -- personalized to what's actually happening
 * on this specific truck, not a static checklist.
 *
 * causes: [{ rank, faultName, systemCategory, severityLevel, steps: [{step, outcomes}] }]
 */
export default function GuidedDiagnosis({ causes }) {
  const causesWithSteps = causes.filter((c) => c.steps.length > 0);

  const [causeIdx, setCauseIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [log, setLog] = useState([]); // { causeName, stepText, outcome }
  const [status, setStatus] = useState('active'); // 'active' | 'resolved' | 'exhausted'

  if (causesWithSteps.length === 0) {
    return (
      <section className="panel px-6 py-5">
        <h3>Guided diagnosis</h3>
        <p className="mt-2 text-[14px] text-text-secondary">
          No structured diagnostic steps were found for this symptom. Review the matched causes above and use your own
          judgment, or try rephrasing the symptom.
        </p>
      </section>
    );
  }

  const cause = causesWithSteps[causeIdx];
  const step = cause.steps[stepIdx];
  const isLastStepOfCause = stepIdx === cause.steps.length - 1;
  const isLastCause = causeIdx === causesWithSteps.length - 1;

  const jumpToCause = (i) => {
    setCauseIdx(i);
    setStepIdx(0);
    setSelectedOutcome(null);
    setStatus('active');
  };

  const restart = () => {
    setCauseIdx(0);
    setStepIdx(0);
    setSelectedOutcome(null);
    setLog([]);
    setStatus('active');
  };

  const handleResolved = (resolved) => {
    setLog((l) => [...l, { causeName: cause.faultName, stepText: step.step, outcome: selectedOutcome }]);
    if (resolved) {
      setStatus('resolved');
      return;
    }
    setSelectedOutcome(null);
    if (!isLastStepOfCause) {
      setStepIdx((i) => i + 1);
    } else if (!isLastCause) {
      setCauseIdx((i) => i + 1);
      setStepIdx(0);
    } else {
      setStatus('exhausted');
    }
  };

  const Trail = () =>
    log.length > 0 && (
      <ul className="mb-5 space-y-2 border-b border-border pb-5">
        {log.map((entry, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-text-secondary">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-severity-safe" />
            <span>
              <span className="text-text-primary">{entry.stepText}</span>
              {entry.outcome && <> — {entry.outcome}</>}
              {' '}
              <span className="text-text-secondary">({entry.causeName})</span>
            </span>
          </li>
        ))}
      </ul>
    );

  const CauseSelector = () => (
    <div className="mb-5 flex flex-wrap gap-2">
      {causesWithSteps.map((c, i) => (
        <button
          key={c.rank}
          type="button"
          onClick={() => jumpToCause(i)}
          className={`inline-flex items-center gap-1.5 rounded-btn border px-2.5 py-1 text-[13px] transition-colors ${
            i === causeIdx
              ? 'border-primary bg-primary-light text-primary'
              : 'border-border bg-surface text-text-secondary hover:text-text-primary'
          }`}
        >
          {c.faultName}
          <SeverityBadge level={c.severityLevel} />
        </button>
      ))}
    </div>
  );

  if (status === 'resolved') {
    return (
      <section className="panel px-6 py-5">
        <h3>Guided diagnosis</h3>
        <CauseSelector />
        <Trail />
        <div className="flex items-start gap-3 rounded-card bg-severity-safe-bg px-4 py-4">
          <ThumbsUp size={20} className="mt-0.5 shrink-0 text-severity-safe" />
          <div>
            <div className="font-medium text-severity-safe">Resolved</div>
            <p className="mt-1 text-[14px] text-text-primary">
              Fixed via <span className="font-medium">{cause.faultName}</span> — "{step.step}".
            </p>
          </div>
        </div>
        <button type="button" className="btn-secondary mt-4" onClick={restart}>
          <RotateCcw size={16} /> Start over
        </button>
      </section>
    );
  }

  if (status === 'exhausted') {
    return (
      <section className="panel px-6 py-5">
        <h3>Guided diagnosis</h3>
        <CauseSelector />
        <Trail />
        <div className="flex items-start gap-3 rounded-card bg-severity-warning-bg px-4 py-4">
          <ThumbsDown size={20} className="mt-0.5 shrink-0 text-severity-warning" />
          <div>
            <div className="font-medium text-severity-warning">Not resolved</div>
            <p className="mt-1 text-[14px] text-text-primary">
              None of the steps across the matched causes fixed it. Escalate to a specialist or review the suggested
              diagnosis above for other angles.
            </p>
          </div>
        </div>
        <button type="button" className="btn-secondary mt-4" onClick={restart}>
          <RotateCcw size={16} /> Start over
        </button>
      </section>
    );
  }

  return (
    <section className="panel px-6 py-5">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h3>Guided diagnosis</h3>
        <span className="text-[13px] text-text-secondary">
          Step {stepIdx + 1} of {cause.steps.length} — {cause.faultName}
        </span>
      </div>

      <CauseSelector />
      <Trail />

      <div className="flex gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[13px] font-semibold text-white">
          {stepIdx + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-6 text-text-primary">{step.step}</p>

          {step.outcomes.length > 0 && (
            <div className="mt-3">
              <div className="field-hint mb-2">What did you find?</div>
              <div className="flex flex-wrap gap-2">
                {step.outcomes.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setSelectedOutcome(o)}
                    className={`rounded-btn border px-3 py-1.5 text-[14px] transition-colors ${
                      selectedOutcome === o
                        ? 'border-primary bg-primary-light text-primary'
                        : 'border-border bg-surface text-text-primary hover:border-primary hover:text-primary'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(selectedOutcome || step.outcomes.length === 0) && (
            <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
              <span className="text-[14px] text-text-secondary">Did this resolve the issue?</span>
              <button type="button" className="btn-secondary" onClick={() => handleResolved(true)}>
                <ThumbsUp size={16} /> Yes
              </button>
              <button type="button" className="btn-secondary" onClick={() => handleResolved(false)}>
                <ThumbsDown size={16} /> No
                {!(isLastStepOfCause && isLastCause) && <ArrowRight size={14} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
