import { Database, Info } from 'lucide-react';
import FaultCodeTag from './FaultCodeTag.jsx';
import SeverityBadge from './SeverityBadge.jsx';

function CodeRow({ c }) {
  if (!c.found) {
    return (
      <li className="px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <FaultCodeTag code={c.code} />
          <span className="text-[14px] text-severity-critical">{c.error}</span>
        </div>
      </li>
    );
  }
  const rec = c.manufacturerRecord;
  return (
    <li className="px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FaultCodeTag code={c.code} />
            <span className="text-[15px] font-medium">{c.component}</span>
          </div>
          <p className="mt-1 text-[14px] text-text-secondary">{c.meaning}</p>
        </div>
        {c.severityLevel && <SeverityBadge level={c.severityLevel} className="shrink-0" />}
      </div>

      <div className="mt-3 text-[13px]">
        {c.manufacturerSpecific ? (
          <div className="rounded-card bg-primary-light px-3 py-2">
            <div className="font-medium text-primary">
              Manufacturer record · {rec.manufacturer} {rec.manufacturer_system}
            </div>
            <div className="mt-0.5 text-text-primary">{rec.description}</div>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-text-secondary">
            <Info size={14} /> Generic SAE J1939 decode only — no manufacturer-specific record for this code.
          </span>
        )}
        {!c.manufacturerSpecific && c.otherManufacturerRecords?.length > 0 && (
          <div className="mt-2 text-text-secondary">
            Reference from another brand ({c.otherManufacturerRecords[0].manufacturer}):{' '}
            {c.otherManufacturerRecords[0].description}
          </div>
        )}
      </div>
    </li>
  );
}

/** Exact-match J1939 results from the SQL branch, plus OBD-II pass-through codes. */
export default function CodeLookupPanel({ codeResults = [], obdCodes = [] }) {
  if (!codeResults.length && !obdCodes.length) return null;
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-primary" />
          <h3>Fault code lookup</h3>
        </div>
        <span className="text-[13px] text-text-secondary">J1939 database · exact match</span>
      </div>
      <ul className="divide-y divide-border">
        {codeResults.map((c) => (
          <CodeRow key={c.code} c={c} />
        ))}
        {obdCodes.map((code) => (
          <li key={code} className="flex flex-wrap items-center gap-3 px-6 py-4">
            <FaultCodeTag code={code} />
            <span className="text-[14px] text-text-secondary">
              OBD-II code — not in the J1939 database; interpreted from general knowledge.
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
