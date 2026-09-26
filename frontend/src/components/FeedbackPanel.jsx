import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

function ChoiceButton({ active, activeClass, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`btn flex-1 border ${active ? activeClass : 'border-border bg-surface text-text-primary hover:bg-surface-muted'}`}
    >
      <Icon size={18} /> {label}
    </button>
  );
}

/**
 * Thumbs up/down feedback for a diagnosis, with an optional note on thumbs down.
 * onSubmit: (diagnosisId, value, note?) -> Promise -- the real store to write to
 * (Results.jsx passes data/api.js's submitFeedback, backed by the RAG history).
 */
export default function FeedbackPanel({ diagnosisId, initialValue = null, onSubmit }) {
  const [value, setValue] = useState(initialValue);
  const [note, setNote] = useState('');
  const [noteSent, setNoteSent] = useState(false);

  const choose = (v) => {
    setValue(v);
    setNoteSent(false);
    onSubmit(diagnosisId, v);
  };

  const sendNote = () => onSubmit(diagnosisId, 'negative', note.trim()).then(() => setNoteSent(true));

  return (
    <section className="panel px-5 py-5">
      <h3>Was this diagnosis helpful?</h3>
      <p className="mt-1 text-[14px] text-text-secondary">Your feedback improves future rankings.</p>
      <div className="mt-4 flex gap-2">
        <ChoiceButton
          active={value === 'positive'}
          activeClass="border-severity-safe bg-severity-safe-bg text-severity-safe"
          icon={ThumbsUp}
          label="Yes"
          onClick={() => choose('positive')}
        />
        <ChoiceButton
          active={value === 'negative'}
          activeClass="border-severity-critical bg-severity-critical-bg text-severity-critical"
          icon={ThumbsDown}
          label="No"
          onClick={() => choose('negative')}
        />
      </div>

      {value === 'positive' && <p className="mt-3 text-[14px] text-severity-safe">Thanks — feedback recorded.</p>}

      {value === 'negative' && !noteSent && (
        <div className="mt-4">
          <label htmlFor="feedback-note" className="field-label">
            What was the actual cause?
          </label>
          <textarea
            id="feedback-note"
            rows={3}
            className="input h-auto py-2"
            placeholder="e.g. Turbo actuator linkage seized"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" className="btn-secondary mt-3" disabled={!note.trim()} onClick={sendNote}>
            Send note
          </button>
        </div>
      )}
      {value === 'negative' && noteSent && (
        <p className="mt-3 text-[14px] text-text-secondary">Thanks — your note was sent.</p>
      )}
    </section>
  );
}
