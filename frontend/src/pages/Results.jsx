import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Sparkles } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.jsx';
import SeverityBanner from '../components/SeverityBanner.jsx';
import RagCauseCard from '../components/RagCauseCard.jsx';
import FeedbackPanel from '../components/FeedbackPanel.jsx';
import FaultCodeTag from '../components/FaultCodeTag.jsx';
import { getDiagnosis, submitFeedback } from '../data/api.js';
import { formatDate, formatMiles, formatTime, formatVehicle } from '../utils/format.js';

const SEVERITY_REASON = {
  critical: 'One or more matched faults are tagged Critical severity — do not operate until inspected.',
  warning: 'Matched faults include High or Medium severity issues — schedule service soon.',
  safe: 'Matched faults are Low severity — safe to operate, schedule routine service.',
};

/** Turns **bold** markers from the Groq answer into <strong>, without a full markdown parser. */
function renderInlineMarkdown(line) {
  const parts = line.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

function SuggestedDiagnosis({ text }) {
  if (!text) return null;
  const lines = text.split('\n').filter((l) => l.trim());
  return (
    <section className="panel px-6 py-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={18} className="text-primary" />
        <h3>Suggested diagnosis</h3>
      </div>
      <div className="space-y-2 text-[14px] leading-6 text-text-primary">
        {lines.map((line, i) => (
          <p key={i}>{renderInlineMarkdown(line)}</p>
        ))}
      </div>
    </section>
  );
}

function VehicleDetails({ d }) {
  const rows = [
    d.vehicle && ['Vehicle', formatVehicle(d.vehicle)],
    d.vehicle?.unit && ['Unit', d.vehicle.unit, true],
    d.vehicle?.engine && ['Engine', d.vehicle.engine],
    d.vehicle?.vin && ['VIN', d.vehicle.vin, true],
    d.mileage && ['Odometer', formatMiles(d.mileage), true],
  ].filter(Boolean);

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>Vehicle details</h3>
      </div>
      {rows.length > 0 ? (
        <dl className="divide-y divide-border px-5">
          {rows.map(([k, v, mono]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-[14px] text-text-secondary">{k}</dt>
              <dd className={`text-right ${mono ? 'font-mono text-[13px]' : 'text-[14px]'}`}>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-5 py-4 text-[14px] text-text-secondary">No vehicle details provided.</p>
      )}
      {d.symptoms && (
        <div className="border-t border-border px-5 py-4">
          <div className="text-[14px] text-text-secondary">Reported symptoms</div>
          <p className="mt-1 text-[14px]">{d.symptoms}</p>
        </div>
      )}
    </section>
  );
}

function ResultMeta({ d }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {d.vehicle && (
        <>
          <span>
            {formatVehicle(d.vehicle)}
            {d.vehicle.unit && (
              <>
                {' '}
                · Unit <span className="font-mono text-[14px]">{d.vehicle.unit}</span>
              </>
            )}
          </span>
          <span className="text-border">|</span>
        </>
      )}
      <span>
        {formatDate(d.createdAt)} <span className="font-mono text-[14px]">{formatTime(d.createdAt)}</span>
      </span>
      {d.faultCodes?.length > 0 && (
        <>
          <span className="text-border">|</span>
          <span className="flex flex-wrap gap-1.5">
            {d.faultCodes.map((c) => (
              <FaultCodeTag key={c} code={c} />
            ))}
          </span>
        </>
      )}
    </span>
  );
}

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [diagnosis, setDiagnosis] = useState(undefined); // undefined = loading, null = not found

  useEffect(() => {
    let cancelled = false;
    setDiagnosis(undefined);
    getDiagnosis(id).then((d) => !cancelled && setDiagnosis(d));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (diagnosis === undefined) {
    return <p className="py-16 text-center text-text-secondary">Loading diagnosis…</p>;
  }
  if (diagnosis === null) {
    return (
      <div className="panel mx-auto max-w-lg px-8 py-10 text-center">
        <h1>Diagnosis not found</h1>
        <p className="mt-2 text-text-secondary">
          No diagnosis exists with ID <span className="font-mono">{id}</span>.
        </p>
        <Link to="/" className="btn-primary mt-6">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const d = diagnosis;

  return (
    <>
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-text-secondary hover:text-text-primary">
        <ArrowLeft size={16} /> Dashboard
      </Link>

      <PageHeader title="Diagnosis results" description={<ResultMeta d={d} />} />

      <SeverityBanner level={d.severity} reason={SEVERITY_REASON[d.severity]} />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-6">
          <SuggestedDiagnosis text={d.answer} />

          <div>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2>Ranked causes</h2>
              <span className="text-[14px] text-text-secondary">Most relevant first</span>
            </div>
            <div className="space-y-4">
              {d.causes.map((cause) => (
                <RagCauseCard key={cause.rank} cause={cause} defaultExpanded={cause.rank === 1} />
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <FeedbackPanel key={d.id} diagnosisId={d.id} initialValue={d.feedback} onSubmit={submitFeedback} />
          <VehicleDetails d={d} />
        </aside>
      </div>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-border pt-6">
        <button className="btn-primary" onClick={() => navigate('/new-diagnosis')}>
          <Plus size={18} /> New Diagnosis
        </button>
        <Link to="/" className="btn-secondary">
          Back to Dashboard
        </Link>
      </div>
    </>
  );
}
