import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.jsx';
import HistoryTable from '../components/HistoryTable.jsx';
import { getRagDiagnosisHistory } from '../data/api.js';

function StatTile({ label, value, hint }) {
  return (
    <div className="panel px-6 py-5">
      <div className="text-[14px] text-text-secondary">{label}</div>
      <div className="mt-2 font-mono text-[28px] font-semibold leading-none text-text-primary">{value}</div>
      {hint && <div className="mt-2 text-[13px] text-text-secondary">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    getRagDiagnosisHistory().then(setRows);
  }, []);

  const recent = rows?.slice(0, 5) ?? [];
  const awaitingFeedback = rows?.filter((r) => !r.feedback).length ?? '—';
  const critical = rows?.filter((r) => r.severity === 'critical').length ?? '—';
  const rated = rows?.filter((r) => r.feedback) ?? [];
  const helpfulRate = rated.length
    ? `${Math.round((rated.filter((r) => r.feedback === 'positive').length / rated.length) * 100)}%`
    : '—';

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Recent diagnoses and items that need your attention."
        actions={
          <button className="btn-primary" onClick={() => navigate('/new-diagnosis')}>
            <Plus size={18} />
            New Diagnosis
          </button>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatTile label="Total diagnoses" value={rows?.length ?? '—'} hint="All time, this browser" />
        <StatTile label="Awaiting feedback" value={awaitingFeedback} hint="Rate results to improve accuracy" />
        <StatTile label="Rated helpful" value={helpfulRate} hint={`${critical} critical-severity cases`} />
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Recent diagnoses</h2>
          <Link to="/history" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary hover:underline">
            View all history <ArrowRight size={16} />
          </Link>
        </div>
        <HistoryTable rows={recent} loading={!rows} />
      </section>
    </>
  );
}
