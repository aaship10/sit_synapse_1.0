import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Password input with a show/hide toggle. Props mirror a plain <input>. */
export default function PasswordField({ id, label, value, onChange, autoComplete = 'current-password', hint }) {
  const [visible, setVisible] = useState(false);
  const hintId = useId();

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="input pr-11"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-describedby={hint ? hintId : undefined}
          required
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-text-secondary hover:text-text-primary"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-[13px] text-text-secondary">
          {hint}
        </p>
      )}
    </div>
  );
}
