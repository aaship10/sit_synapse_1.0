import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Plus } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.jsx';
import SeverityBanner from '../components/SeverityBanner.jsx';
import DiagnosisCard from '../components/DiagnosisCard.jsx';
import ClarifyingQuestion from '../components/ClarifyingQuestion.jsx';
import FeedbackPanel from '../components/FeedbackPanel.jsx';
import FaultCodeTag from '../components/FaultCodeTag.jsx';
import { getDiagnosis } from '../data/mockData.js';
import { formatDate, formatHours, formatMiles, formatTime, formatVehicle } from '../utils/format.js';

function RepairEstimate({ estimate }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-2.5">
      <Clock size={20} className="text-primary" />
      <div>
        <div className="text-[13px] leading-4 text-text-secondary">Est. repair time</div>
        <div className="font-mono text-[16px] font-semibold leading-6">{formatHours(estimate)}</div>
      </div>
    </div>
  );
}

function VehicleDetails({ d }) {
  const rows = [
    ['Vehicle', formatVehicle(d.vehicle)],
    ['Unit', d.vehicle.unit, true],
    ['Engine', d.vehicle.engine],
    ['VIN', d.vehicle.vin, true],
    ['Odometer', formatMiles(d.mileage), true],
    ['Technician', d.technician],
  ];
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>Vehicle details</h3>
      </div>
      <dl className="divide-y divide-border px-5">
        {rows.map(([k, v, mono]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5">
            <dt className="text-[14px] text-text-secondary">{k}</dt>
            <dd className={`text-right ${mono ? 'font-mono text-[13px]' : 'text-[14px]'}`}>{v}</dd>
          </div>
        ))}
      </dl>
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
      <span>
        {formatVehicle(d.vehicle)} · Unit <span className="font-mono text-[14px]">{d.vehicle.unit}</span>
      </span>
      <span className="text-border">|</span>
      <span>
        {formatDate(d.createdAt)} <span className="font-mono text-[14px]">{formatTime(d.createdAt)}</span>
      </span>
      <span className="text-border">|</span>
      <span className="flex flex-wrap gap-1.5">
        {d.faultCodes.map((c) => (
          <FaultCodeTag key={c} code={c} />
        ))}
      </span>
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

      <PageHeader title="Diagnosis results" description={<ResultMeta d={d} />} actions={<RepairEstimate estimate={d.repairEstimate} />} />

      <SeverityBanner level={d.severity} reason={d.severityReason} />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2>Ranked causes</h2>
            <span className="text-[14px] text-text-secondary">Most probable first</span>
          </div>
          <div className="space-y-4">
            {d.causes.map((cause) => (
              <DiagnosisCard key={cause.rank} cause={cause} defaultExpanded={cause.rank === 1} />
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <ClarifyingQuestion {...d.clarifyingQuestion} />
          <FeedbackPanel key={d.id} diagnosisId={d.id} initialValue={d.feedback} />
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
