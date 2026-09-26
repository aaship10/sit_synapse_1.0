import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown, ChevronRight } from 'lucide-react';
import SeverityBadge from './SeverityBadge.jsx';
import FaultCodeTag from './FaultCodeTag.jsx';
import { formatDate, formatTime, formatVehicle } from '../utils/format.js';

function FeedbackStatus({ value }) {
  if (value === 'positive') {
    return (
      <span className="inline-flex items-center gap-1.5 text-severity-safe">
        <ThumbsUp size={14} /> Helpful
      </span>
    );
  }
  if (value === 'negative') {
    return (
      <span className="inline-flex items-center gap-1.5 text-severity-critical">
        <ThumbsDown size={14} /> Not helpful
      </span>
    );
  }
  return <span className="text-text-secondary">Awaiting</span>;
}

const COLUMNS = ['Date', 'Vehicle', 'Fault codes', 'Top cause', 'Severity', 'Feedback'];

/**
 * Diagnosis history table. Rows come from getDiagnosisHistory()/getRecentDiagnoses().
 * Row click navigates to the result page.
 */
export default function HistoryTable({ rows, loading = false, emptyMessage = 'No diagnoses found.' }) {
  const navigate = useNavigate();
  const open = (id) => navigate(`/diagnosis/${id}`);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface-muted text-text-secondary">
            {COLUMNS.map((col) => (
              <th key={col} className="px-4 py-3 font-medium first:pl-6">
                {col}
              </th>
            ))}
            <th className="w-10 pr-4" aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-6 py-10 text-center text-[14px] text-text-secondary">
                Loading diagnoses…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-6 py-10 text-center text-[14px] text-text-secondary">
                {emptyMessage}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                onClick={() => open(row.id)}
                onKeyDown={(e) => e.key === 'Enter' && open(row.id)}
                className="group cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-primary-light focus:bg-primary-light focus:outline-none"
              >
                <td className="whitespace-nowrap px-4 py-3.5 pl-6 align-top">
                  <div className="text-[14px]">{formatDate(row.createdAt)}</div>
                  <div className="font-mono text-text-secondary">{formatTime(row.createdAt)}</div>
                </td>
                <td className="px-4 py-3.5 align-top">
                  <div className="text-[14px] font-medium">{formatVehicle(row.vehicle)}</div>
                  <div className="text-text-secondary">
                    Unit <span className="font-mono">{row.vehicle.unit}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 align-top">
                  <div className="flex flex-col items-start gap-1">
                    {row.faultCodes.map((c) => (
                      <FaultCodeTag key={c} code={c} />
                    ))}
                  </div>
                </td>
                <td className="max-w-[280px] px-4 py-3.5 align-top text-[14px]">{row.topCause}</td>
                <td className="px-4 py-3.5 align-top">
                  <SeverityBadge level={row.severity} />
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 align-top">
                  <FeedbackStatus value={row.feedback} />
                </td>
                <td className="pr-4 align-middle text-text-secondary">
                  <ChevronRight size={18} className="opacity-0 transition-opacity group-hover:opacity-100" />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
