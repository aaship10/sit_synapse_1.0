import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { normalizeFaultCode, EXAMPLE_FAULT_CODES } from '../utils/faultCodes.js';

/**
 * Type-and-enter chip input for fault codes.
 * value: string[] of normalized codes; onChange(nextCodes)
 */
export default function CodeChipInput({ id = 'fault-codes', value, onChange }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

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
          className={`input font-mono ${error ? 'border-severity-critical' : ''}`}
          placeholder="SPN 102 FMI 3, P0299 …"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={handleKeyDown}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
        />
        <button type="button" className="btn-secondary shrink-0" onClick={() => addCode(draft)} disabled={!draft.trim()}>
          <Plus size={16} />
          Add
        </button>
      </div>

      <p id={`${id}-hint`} className={`mt-2 text-[13px] ${error ? 'text-severity-critical' : 'text-text-secondary'}`}>
        {error || (
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
        <ul className="mt-4 flex flex-wrap gap-2">
          {value.map((code) => (
            <li
              key={code}
              className="inline-flex items-center gap-2 rounded-btn bg-primary-light px-2.5 py-1.5 font-mono text-[14px] font-medium text-primary"
            >
              {code}
              <button
                type="button"
                onClick={() => removeCode(code)}
                className="rounded-btn text-primary/70 hover:text-primary"
                aria-label={`Remove ${code}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
