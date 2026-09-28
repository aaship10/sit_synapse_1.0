import { useEffect, useRef, useState } from 'react';
import { Mic, Check } from 'lucide-react';
import { SYMPTOM_PRESETS } from '../data/symptomPresets.js';
import { startDictation } from '../data/speech.js';

function appendText(current, addition) {
  const base = current.trim();
  if (!base) return addition;
  return /[.;,]$/.test(base) ? `${base} ${addition}` : `${base}; ${addition}`;
}

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
 * Free-text symptom description with AssemblyAI voice dictation and preset tags.
 * value: string; onChange(nextValue)
 */
export default function SymptomInput({ id = 'symptoms', value, onChange }) {
  const [listening, setListening] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState('');
  const [partial, setPartial] = useState('');
  const dictationRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => () => dictationRef.current?.stop(), []);

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
          if (text) onChange(appendText(valueRef.current, text));
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

  const hasTag = (tag) => value.toLowerCase().includes(tag.toLowerCase());

  return (
    <div>
      <div className="relative">
        <textarea
          id={id}
          rows={4}
          className="input h-auto resize-y py-2.5 pr-14 leading-6"
          placeholder="Describe what the driver reported or what you observed — e.g. loss of power on grades, black smoke under load…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={toggleMic}
          disabled={connecting}
          aria-pressed={listening}
          aria-label={listening ? 'Stop voice input' : 'Start voice input'}
          className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-btn transition-colors ${
            listening
              ? 'bg-severity-critical text-white'
              : 'border border-border bg-surface text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:opacity-60'
          }`}
        >
          <Mic size={18} />
          {listening && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-severity-critical" />}
        </button>
      </div>

      <p className="mt-2 text-[13px] text-text-secondary">
        Voice input: say <span className="font-medium text-text-primary">“semicolon”</span> to start describing a new symptom.
      </p>

      {(connecting || listening || notice) && (
        <p className={`mt-1 text-[13px] ${listening ? 'text-severity-critical' : 'text-text-secondary'}`}>
          {connecting && 'Connecting to speech service…'}
          {listening && (partial ? `Listening… “${partial}”` : 'Listening… speak your notes, then tap the mic to stop.')}
          {!connecting && !listening && notice}
        </p>
      )}

      <div className="mt-4">
        <div className="field-hint mb-2">Common symptoms</div>
        <div className="flex flex-wrap gap-2">
          {SYMPTOM_PRESETS.map((tag) => {
            const active = hasTag(tag);
            return (
              <button
                key={tag}
                type="button"
                disabled={active}
                onClick={() => onChange(appendText(value, tag))}
                className={`inline-flex items-center gap-1.5 rounded-btn border px-3 py-1.5 text-[14px] transition-colors ${
                  active
                    ? 'cursor-default border-primary bg-primary-light text-primary'
                    : 'border-border bg-surface text-text-primary hover:border-primary hover:text-primary'
                }`}
              >
                {active && <Check size={14} />}
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
