import { useEffect, useRef, useState } from 'react';
import { Mic, Check } from 'lucide-react';
import { SYMPTOM_PRESETS } from '../data/mockData.js';

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

function appendText(current, addition) {
  const base = current.trim();
  if (!base) return addition;
  return /[.;,]$/.test(base) ? `${base} ${addition}` : `${base}; ${addition}`;
}

/**
 * Free-text symptom description with voice dictation and preset tags.
 * value: string; onChange(nextValue)
 */
export default function SymptomInput({ id = 'symptoms', value, onChange }) {
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState('');
  const recognitionRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const toggleMic = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    if (!SpeechRecognition) {
      setNotice('Voice input isn’t supported in this browser. Try Chrome or Edge.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .slice(e.resultIndex)
        .filter((r) => r.isFinal)
        .map((r) => r[0].transcript.trim())
        .join(' ');
      if (transcript) onChange(appendText(valueRef.current, transcript));
    };
    rec.onerror = (e) => {
      setNotice(e.error === 'not-allowed' ? 'Microphone access was blocked.' : 'Voice input stopped.');
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setNotice('');
    setListening(true);
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
          aria-pressed={listening}
          aria-label={listening ? 'Stop voice input' : 'Start voice input'}
          className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-btn transition-colors ${
            listening
              ? 'bg-severity-critical text-white'
              : 'border border-border bg-surface text-text-secondary hover:bg-surface-muted hover:text-text-primary'
          }`}
        >
          <Mic size={18} />
          {listening && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-severity-critical" />}
        </button>
      </div>

      {(listening || notice) && (
        <p className={`mt-2 text-[13px] ${listening ? 'text-severity-critical' : 'text-text-secondary'}`}>
          {listening ? 'Listening… speak your notes, then tap the mic to stop.' : notice}
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
