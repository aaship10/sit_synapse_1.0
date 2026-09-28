import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { signup } from '../utils/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate({ name, email, shop, password, confirmPassword, agreed }) {
  if (!name.trim()) return 'Enter your full name.';
  if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
  if (!shop.trim()) return 'Enter your shop or fleet name.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password !== confirmPassword) return 'Passwords don’t match.';
  if (!agreed) return 'You must accept the terms to continue.';
  return '';
}

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', shop: '', password: '', confirmPassword: '' });
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState('');

  const update = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const message = validate({ ...form, agreed });
    if (message) {
      setError(message);
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      await signup(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <AuthLayout
      title="Create an account"
      description="Set up access for you and your shop."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
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
          <label htmlFor="name" className="field-label">
            Full name
          </label>
          <input
            id="name"
            className="input"
            placeholder="Jordan Morales"
            value={form.name}
            onChange={(e) => update('name')(e.target.value)}
            autoComplete="name"
            required
          />
        </div>

        <div>
          <label htmlFor="signup-email" className="field-label">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            className="input"
            placeholder="you@yourshop.com"
            value={form.email}
            onChange={(e) => update('email')(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label htmlFor="shop" className="field-label">
            Shop / fleet name
          </label>
          <input
            id="shop"
            className="input"
            placeholder="Fleetworks Diesel & Repair"
            value={form.shop}
            onChange={(e) => update('shop')(e.target.value)}
            autoComplete="organization"
            required
          />
        </div>

        <PasswordField
          id="signup-password"
          label="Password"
          value={form.password}
          onChange={update('password')}
          autoComplete="new-password"
          hint="At least 8 characters."
        />

        <PasswordField
          id="confirm-password"
          label="Confirm password"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          autoComplete="new-password"
        />

        <label htmlFor="agree" className="flex items-start gap-2 text-[14px] text-text-secondary">
          <input
            id="agree"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
          />
          <span>I agree to the terms of service and privacy policy.</span>
        </label>

        <button type="submit" className="btn-primary w-full" disabled={status === 'loading'}>
          {status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          Create account
        </button>
      </form>
    </AuthLayout>
  );
}
