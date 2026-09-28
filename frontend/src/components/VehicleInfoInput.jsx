import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { decodeVin, VIN_PATTERN } from '../data/nhtsa.js';

const MODES = [
  { key: 'manual', label: 'Manual entry' },
  { key: 'vin', label: 'VIN lookup' },
];

const CURRENT_YEAR = new Date().getFullYear();

function TextField({ id, label, value, onChange, placeholder }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} className="input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function VinResult({ result }) {
  const fields = [
    ['Make', result.make],
    ['Model', result.model || '—'],
    ['Year', result.year],
    ['Engine', result.engine || '—'],
    ['Body class', result.bodyClass || '—'],
    ['GVWR', result.gvwr || '—'],
  ];
  return (
    <div className="mt-4 rounded-card bg-surface-muted px-5 py-4">
      <div className="mb-3 flex items-center gap-2 text-[14px] font-medium text-severity-safe">
        <CheckCircle2 size={16} /> Decoded via NHTSA
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[13px] text-text-secondary">{k}</dt>
            <dd className="text-[15px] font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {result.warning && (
        <p className="mt-3 text-[13px] text-text-secondary">
          <span className="font-medium">Note from NHTSA:</span> {result.warning}
        </p>
      )}
    </div>
  );
}

/**
 * Vehicle identification: manual Make/Model/Year or VIN decode.
 * onChange(vehicle | null) — vehicle is { source, make, model, year, vin?, engine? }
 */
export default function VehicleInfoInput({ onChange }) {
  const [mode, setMode] = useState('manual');
  const [manual, setManual] = useState({ make: '', model: '', year: '' });
  const [vin, setVin] = useState('');
  const [vinState, setVinState] = useState({ status: 'idle', result: null, error: '' });

  useEffect(() => {
    if (mode === 'manual') {
      const { make, model, year } = manual;
      onChange(make && model && year ? { source: 'manual', make, model, year: Number(year) } : null);
    } else {
      onChange(vinState.result ? { source: 'vin', ...vinState.result } : null);
    }
  }, [mode, manual, vinState.result, onChange]);

  const handleDecode = async () => {
    setVinState({ status: 'loading', result: null, error: '' });
    try {
      const result = await decodeVin(vin);
      setVinState({ status: 'done', result, error: '' });
    } catch (err) {
      setVinState({ status: 'error', result: null, error: err.message });
    }
  };

  const vinValid = VIN_PATTERN.test(vin);

  return (
    <div>
      <div className="mb-6 inline-flex rounded-btn border border-border p-0.5" role="tablist">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={mode === m.key}
            onClick={() => setMode(m.key)}
            className={`rounded-[3px] px-4 py-1.5 text-[14px] font-medium transition-colors ${
              mode === m.key ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'manual' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="make"
            label="Make"
            placeholder="e.g. Freightliner"
            value={manual.make}
            onChange={(make) => setManual((m) => ({ ...m, make }))}
          />
          <TextField
            id="model"
            label="Model"
            placeholder="e.g. Cascadia"
            value={manual.model}
            onChange={(model) => setManual((m) => ({ ...m, model }))}
          />
          <div>
            <label htmlFor="year" className="field-label">
              Year
            </label>
            <input
              id="year"
              type="number"
              inputMode="numeric"
              className="input font-mono"
              placeholder={String(CURRENT_YEAR)}
              min="1980"
              max={CURRENT_YEAR + 1}
              value={manual.year}
              onChange={(e) => setManual((m) => ({ ...m, year: e.target.value }))}
            />
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="vin" className="field-label">
            Vehicle identification number (VIN)
          </label>
          <div className="flex max-w-xl gap-2">
            <input
              id="vin"
              className="input font-mono uppercase tracking-wider"
              placeholder="17-character VIN"
              maxLength={17}
              value={vin}
              onChange={(e) => {
                setVin(e.target.value.toUpperCase().replace(/\s/g, ''));
                if (vinState.status !== 'idle') setVinState({ status: 'idle', result: null, error: '' });
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault(); // don't submit the surrounding diagnosis form
                if (vinValid) handleDecode();
              }}
            />
            <button type="button" className="btn-primary shrink-0" disabled={!vinValid || vinState.status === 'loading'} onClick={handleDecode}>
              {vinState.status === 'loading' && <Loader2 size={16} className="animate-spin" />}
              Decode
            </button>
          </div>
          <p className="mt-2 font-mono text-[13px] text-text-secondary">{vin.length}/17</p>

          {vinState.status === 'error' && (
            <p className="mt-3 flex items-start gap-2 text-[14px] text-severity-critical">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {vinState.error}
            </p>
          )}
          {vinState.result && <VinResult result={vinState.result} />}
        </div>
      )}
    </div>
  );
}
