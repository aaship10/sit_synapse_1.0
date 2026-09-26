import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader.jsx';
import HistoryTable from '../components/HistoryTable.jsx';
import { getDiagnosisHistory } from '../data/mockData.js';
import { getRagDiagnosisHistory } from '../data/api.js';
import { SEVERITY, SEVERITY_LEVELS } from '../utils/severity.js';
import { formatVehicle } from '../utils/format.js';

const vehicleKey = (v) => (v ? `${formatVehicle(v)} · Unit ${v.unit}` : 'No vehicle');

export default function History() {
  const [rows, setRows] = useState(null);
  const [vehicle, setVehicle] = useState('');
  const [severity, setSeverity] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    Promise.all([getDiagnosisHistory(), getRagDiagnosisHistory()]).then(([mock, real]) => {
      setRows([...real, ...mock].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });
  }, []);

  const vehicleOptions = useMemo(
    () => [...new Set((rows ?? []).map((r) => vehicleKey(r.vehicle)))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (vehicle && vehicleKey(r.vehicle) !== vehicle) return false;
      if (severity && r.severity !== severity) return false;
      if (!q) return true;
      const haystack = [vehicleKey(r.vehicle), r.topCause, r.id, ...r.faultCodes].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, vehicle, severity, query]);

  const hasFilters = vehicle || severity || query;
  const clearFilters = () => {
    setVehicle('');
    setSeverity('');
    setQuery('');
  };

  return (
    <>
      <PageHeader title="History" description="All past diagnoses. Select a row to open the full result." />

      <section className="panel">
        <div className="flex flex-wrap items-end gap-4 border-b border-border px-6 py-4">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="history-search" className="field-label">
              Search
            </label>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                id="history-search"
                className="input pl-9"
                placeholder="Fault code, cause, or unit number"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="w-full sm:w-72">
            <label htmlFor="history-vehicle" className="field-label">
              Vehicle
            </label>
            <select id="history-vehicle" className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
              <option value="">All vehicles</option>
              {vehicleOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-44">
            <label htmlFor="history-severity" className="field-label">
              Severity
            </label>
            <select id="history-severity" className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">All severities</option>
              {SEVERITY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {SEVERITY[level].label}
                </option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <button type="button" className="btn-ghost" onClick={clearFilters}>
              <X size={16} /> Clear
            </button>
          )}
        </div>

        <div className="px-6 py-3 text-[13px] text-text-secondary">
          {rows ? `Showing ${filtered.length} of ${rows.length} diagnoses` : 'Loading…'}
        </div>

        <div className="border-t border-border">
          <HistoryTable rows={filtered} loading={!rows} emptyMessage="No diagnoses match these filters." />
        </div>
      </section>
    </>
  );
}
