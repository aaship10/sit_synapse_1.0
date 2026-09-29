import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, X, Plus } from 'lucide-react';
import { normalizeFaultCode, EXAMPLE_FAULT_CODES } from '../utils/faultCodes.js';
import { decodeFaultCode } from '../data/api.js';
import { startDictation } from '../data/speech.js';

function friendlyMicError(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
    return 'Microphone access was blocked.';
  }
  if (err?.name === 'NotFoundError') {
    return 'No microphone was found on this device.';
  }
  return err?.message || 'Voice input stopped.';
}

/**
 * Splits "spn 102 fmi 3 enter" into the code text before the word "enter"
 * (trimmed of trailing punctuation), or returns null if this turn didn't say
 * "enter" at all -- so a code can be dictated across more than one pause
 * before it's committed.
 */
function extractEnterCommand(text) {
  const match = text.match(/\benter\b/i);
  if (!match) return null;
  return text.slice(0, match.index).replace(/[,.\s]+$/, '').trim();
}

/**
 * Type-and-enter chip input for fault codes.
 * value: string[] of normalized codes; onChange(nextCodes)
 *
 * Also supports voice entry: say the code, then say "enter" to add it --
 * the same commit action as pressing the Enter key, just spoken instead.
 */
export default function CodeChipInput({ id = 'fault-codes', value, onChange, draft: draftProp, onDraftChange, externalError = '' }) {
  const [localDraft, setLocalDraft] = useState('');
  const draft = draftProp ?? localDraft;
  const setDraft = onDraftChange ?? setLocalDraft;
  const [error, setError] = useState('');
  const shownError = error || externalError;
  const [decoded, setDecoded] = useState({}); // code -> { status: 'loading' | 'found' | 'unknown', data }
  const [listening, setListening] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState('');
  const [partial, setPartial] = useState('');
  const dictationRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => () => dictationRef.current?.stop(), []);

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

  const toggleMic = async () => {
    if (listening) {
      dictationRef.current?.stop();
      dictationRef.current = null;
      setListening(false);
      setPartial('');
      return;
    }

    setNotice('');
    setConnecting(true);
    try {
      const controller = await startDictation({
        onPartial: (text) => setPartial(text),
        onFinalTurn: (text) => {
          setPartial('');
          const before = extractEnterCommand(text);
          if (before === null) {
            // Didn't say "enter" yet -- keep building the draft across pauses.
            setDraft((d) => (d ? `${d} ${text}` : text));
            return;
          }
          const combined = [draftRef.current, before].filter(Boolean).join(' ').trim();
          setDraft(combined);
          if (combined) addCode(combined);
        },
        onError: (message) => {
          setNotice(message);
          setListening(false);
          setPartial('');
          dictationRef.current = null;
        },
        onSilence: () => {
          setNotice('No sound detected for 5 seconds — voice input stopped.');
          setListening(false);
          setPartial('');
          dictationRef.current = null;
        },
      });
      dictationRef.current = controller;
      setListening(true);
    } catch (err) {
      setNotice(friendlyMicError(err));
    } finally {
      setConnecting(false);
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
        <button
          type="button"
          onClick={toggleMic}
          disabled={connecting}
          aria-pressed={listening}
          aria-label={listening ? 'Stop voice input' : 'Start voice input'}
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-btn transition-colors ${
            listening
              ? 'bg-severity-critical text-white'
              : 'border border-border bg-surface text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:opacity-60'
          }`}
        >
          <Mic size={18} />
          {listening && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-severity-critical" />}
        </button>
        <button type="button" className="btn-secondary shrink-0" onClick={() => addCode(draft)} disabled={!draft.trim()}>
          <Plus size={16} />
          Add
        </button>
      </div>

      <p id={`${id}-hint`} className={`mt-2 text-[13px] ${shownError ? 'text-severity-critical' : 'text-text-secondary'}`}>
        {shownError || (
          <>
            Press Enter to add, or use the mic and say <span className="font-medium text-text-primary">“enter.”</span>{' '}
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

      {(connecting || listening || notice) && (
        <p className={`mt-1 text-[13px] ${listening ? 'text-severity-critical' : 'text-text-secondary'}`}>
          {connecting && 'Connecting to speech service…'}
          {listening && (partial ? `Listening… “${partial}”` : 'Listening… say a fault code, then say “enter” to add it.')}
          {!connecting && !listening && notice}
        </p>
      )}

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
