import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, MapPin } from 'lucide-react'
import { register } from '../api/auth'
import { ApiError } from '../api/client'
import '../styles/auth.css'

interface FieldErrors {
  displayName?: string
  email?: string
  password?: string
  confirm?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function friendlyMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'EMAIL_ALREADY_EXISTS':
        return 'An account with this email already exists. Try signing in.'
      case 'VALIDATION_FAILED':
        return 'Please check the information you entered.'
      case 'PASSWORD_TOO_LONG':
        return 'Password must not exceed 72 UTF-8 bytes (BCrypt limit).'
      case 'MALFORMED_REQUEST':
        return 'Please check the information you entered.'
      default:
        return err.message || 'Something went wrong. Please try again.'
    }
  }
  return 'Network error — is the backend running?'
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function validate(): boolean {
    const next: FieldErrors = {}
    if (displayName.length > 120) next.displayName = 'Max 120 characters.'
    if (!email.trim()) next.email = 'Email is required.'
    else if (email.length > 320 || !EMAIL_RE.test(email.trim()))
      next.email = 'Enter a valid email address.'
    if (!password) next.password = 'Password is required.'
    else if (password.length < 8) next.password = 'Password must be at least 8 characters.'
    else if (password.length > 200) next.password = 'Password must be at most 200 characters.'
    else if (new TextEncoder().encode(password).length > 72)
      next.password = 'Password must not exceed 72 UTF-8 bytes.'
    if (confirm !== password) next.confirm = 'Passwords do not match.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!validate() || submitting) return
    setSubmitting(true)
    try {
      await register({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
      })
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (err) {
      setFormError(friendlyMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">
            <MapPin size={20} />
          </div>
          <div className="brand-name">QuantumRoute AI</div>
        </div>

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Start optimizing routes across your networks.</p>

        {formError && <div className="form-error" role="alert">{formError}</div>}
        {success && (
          <div className="form-success" role="status">
            Account created — redirecting you to sign in…
          </div>
        )}

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="displayName">Display name <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input
              id="displayName"
              type="text"
              autoComplete="name"
              placeholder="Ayush"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              aria-invalid={!!errors.displayName}
            />
            {errors.displayName && (
              <span className="field-error">{errors.displayName}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <span className="field-error" id="email-error">{errors.email}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-hint' : undefined}
              />
              <button
                type="button"
                className="reveal-btn"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span className="field-hint" id="password-hint">8–200 characters, max 72 UTF-8 bytes.</span>
            {errors.password && (
              <span className="field-error">{errors.password}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!errors.confirm}
              aria-describedby={errors.confirm ? 'confirm-error' : undefined}
            />
            {errors.confirm && (
              <span className="field-error" id="confirm-error">{errors.confirm}</span>
            )}
          </div>

          <button type="submit" className="submit-btn" disabled={submitting || success}>
            {submitting && <span className="spinner" aria-hidden="true" />}
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
