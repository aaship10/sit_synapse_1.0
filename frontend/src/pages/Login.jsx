import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { login } from '../utils/auth.js';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState('');

  const redirectTo = location.state?.from?.pathname ?? '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setError('');
    try {
      await login({ email, password });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      description="Access your shop's diagnostic history and run new diagnoses."
      footer={
        <>
          New technician?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && (
          <div className="flex items-start gap-2 rounded-btn bg-severity-critical-bg px-3.5 py-3 text-[14px] text-severity-critical">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            placeholder="you@yourshop.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />

        <div className="flex items-center justify-between">
          <label htmlFor="remember" className="flex items-center gap-2 text-[14px] text-text-secondary">
            <input
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
            />
            Remember me
          </label>
          <button
            type="button"
            className="text-[14px] font-medium text-primary hover:underline"
            onClick={() => setError('Password reset isn’t available in this preview — contact your shop admin.')}
          >
            Forgot password?
          </button>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={status === 'loading'}>
          {status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          Sign in
        </button>

        <p className="text-center text-[13px] text-text-secondary">
          Demo account: <span className="font-mono">j.morales@fleetworks.com</span> / <span className="font-mono">trucking123</span>
        </p>
      </form>
    </AuthLayout>
  );
}
