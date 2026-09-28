import { useEffect, useState } from 'react';
import { Loader2, X, Plus } from 'lucide-react';
import { normalizeFaultCode, EXAMPLE_FAULT_CODES } from '../utils/faultCodes.js';
import { decodeFaultCode } from '../data/api.js';

/**
 * Type-and-enter chip input for fault codes.
 * value: string[] of normalized codes; onChange(nextCodes)
 */
export default function CodeChipInput({ id = 'fault-codes', value, onChange, draft: draftProp, onDraftChange, externalError = '' }) {
  const [localDraft, setLocalDraft] = useState('');
  const draft = draftProp ?? localDraft;
  const setDraft = onDraftChange ?? setLocalDraft;
  const [error, setError] = useState('');
  const shownError = error || externalError;
  const [decoded, setDecoded] = useState({}); // code -> { status: 'loading' | 'found' | 'unknown', data }

  useEffect(() => {
    value.forEach((code) => {
      if (decoded[code]) return;
      setDecoded((d) => ({ ...d, [code]: { status: 'loading' } }));
      decodeFaultCode(code).then((data) =>
        setDecoded((d) => ({ ...d, [code]: { status: data ? 'found' : 'unknown', data } }))
      );
    });
  }, [value, decoded]);

  const addCode = (raw) => {
    const input = raw.trim();
    if (!input) return;
    const code = normalizeFaultCode(input);
    if (!code) {
      setError('Enter a J1939 code (e.g. SPN 102 FMI 3 or 102/3) or an OBD-II code (e.g. P0299).');
      return;
    }
    if (value.includes(code)) {
      setError(`${code} is already added.`);
      return;
    }
    onChange([...value, code]);
    setDraft('');
    setError('');
  };

  const removeCode = (code) => onChange(value.filter((c) => c !== code));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCode(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      removeCode(value[value.length - 1]);
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          id={id}
          className={`input font-mono ${shownError ? 'border-severity-critical' : ''}`}
          placeholder="SPN 102 FMI 3, P0299 …"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={handleKeyDown}
          aria-invalid={!!shownError}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
        />
        <button type="button" className="btn-secondary shrink-0" onClick={() => addCode(draft)} disabled={!draft.trim()}>
          <Plus size={16} />
          Add
        </button>
      </div>

      <p id={`${id}-hint`} className={`mt-2 text-[13px] ${shownError ? 'text-severity-critical' : 'text-text-secondary'}`}>
        {shownError || (
          <>
            Press Enter to add.{' '}
            {value.length === 0 && (
              <>
                Try:{' '}
                {EXAMPLE_FAULT_CODES.map((code, i) => (
                  <span key={code}>
                    {i > 0 && ', '}
                    <button type="button" className="font-mono text-primary hover:underline" onClick={() => addCode(code)}>
                      {code}
                    </button>
                  </span>
                ))}
              </>
            )}
          </>
        )}
      </p>

      {value.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {value.map((code) => {
            const d = decoded[code];
            return (
              <li key={code} className="rounded-card border border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 rounded-btn bg-primary-light px-2 py-1 font-mono text-[14px] font-medium text-primary">
                    {code}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCode(code)}
                    className="rounded-btn p-1 text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                    aria-label={`Remove ${code}`}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="mt-2 text-[14px] leading-5">
                  {(!d || d.status === 'loading') && (
                    <span className="inline-flex items-center gap-2 text-text-secondary">
                      <Loader2 size={14} className="animate-spin" /> Decoding…
                    </span>
                  )}
                  {d?.status === 'found' && (
                    <>
                      <div className="font-medium text-text-primary">{d.data.component}</div>
                      <div className="mt-0.5 text-text-secondary">{d.data.description}</div>
                    </>
                  )}
                  {d?.status === 'unknown' && (
                    <span className="text-text-secondary">Not found in the J1939 database — will be sent as entered.</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
