import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { Brand, ShieldMark } from '../components/Brand'
import { API_BASE, ApiError, apiFetch, isApiMode } from '../lib/api'

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset'

export function Auth() {
  const [params] = useSearchParams()
  const [mode, setMode] = useState<AuthMode>(params.get('mode') === 'signup' ? 'signup' : params.get('token') ? 'reset' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [sent, setSent] = useState(false)
  const [devResetToken, setDevResetToken] = useState('')
  const [error, setError] = useState('')
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const requested = params.get('mode') as AuthMode | null
    if (requested && ['signin', 'signup', 'forgot', 'reset'].includes(requested)) setMode(requested)
    else if (params.get('token')) setMode('reset')
  }, [params])

  function changeMode(next: AuthMode) {
    setMode(next)
    setSent(false)
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      if (mode === 'forgot') {
        if (isApiMode()) {
          try {
            const result = await apiFetch<{ dev_reset_token?: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
            setDevResetToken(result.dev_reset_token ?? '')
          } catch (reason) { if (API_BASE || (reason instanceof ApiError && reason.status < 500)) throw reason }
        }
        setSent(true)
        return
      }
      if (mode === 'reset') {
        if (isApiMode()) {
          try { await apiFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: params.get('token') ?? devResetToken, password }) }) } catch (reason) { if (API_BASE || (reason instanceof ApiError && reason.status < 500)) throw reason }
        }
        setSent(true)
        window.setTimeout(() => changeMode('signin'), 900)
        return
      }
      if (mode === 'signup' && !displayName.trim()) {
        setError('Display name is required.')
        return
      }
      await signIn(email, password, mode, displayName.trim() || undefined)
      const from = (location.state as { from?: string } | null)?.from ?? '/app'
      navigate(from, { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replace(/\{.*\}/, '').trim() : 'Unable to complete that request.')
    }
  }

  return <div className="auth-page"><div className="auth-glow auth-glow-one" /><div className="auth-glow auth-glow-two" /><header className="auth-header"><Brand /><Link to="/" className="back-link"><ArrowLeft size={14} /> Back to home</Link></header><main className="auth-main"><div className="auth-side"><div className="auth-side-mark"><ShieldMark size={30} /></div><div className="eyebrow crimson-text">The governance layer</div><h1>Move fast.<br /><em>Stay accountable.</em></h1><p>ControlPlane gives every AI inference a policy boundary, a live safety gate, and an explanation you can replay.</p><div className="auth-side-points"><span><CheckCircle2 size={15} /> Real-time governance pipeline</span><span><CheckCircle2 size={15} /> Event-sourced audit trail</span><span><CheckCircle2 size={15} /> Trust scoring and verification</span></div></div><section className="auth-card glass-panel"><div className="auth-mobile-brand"><ShieldMark size={28} /></div>{mode !== 'forgot' && mode !== 'reset' && <div className="auth-tabs"><button className={mode === 'signin' ? 'active' : ''} onClick={() => changeMode('signin')}>Sign in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')}>Create account</button></div>}{mode === 'forgot' && <button className="auth-back-mode" onClick={() => changeMode('signin')}><ArrowLeft size={14} /> Back to sign in</button>}{mode === 'reset' && <div className="auth-back-mode"><LockKeyhole size={14} /> Set a new password</div>}{error && <div className="auth-error">{error}</div>}{sent ? <div className="auth-success"><div className="success-icon"><Mail size={22} /></div><h2>Check your inbox</h2><p>We sent a single-use reset link to <b>{email}</b>. In local demo mode, the link is returned by the API.</p>{devResetToken && <button className="button button-ghost button-full" onClick={() => { setSent(false); setMode('reset') }}>Continue with local reset token <ArrowRight size={14} /></button>}<button className="text-link" onClick={() => changeMode('signin')}>Return to sign in <ArrowRight size={14} /></button></div> : <><div className="auth-heading"><h2>{mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Start governing' : mode === 'forgot' ? 'Reset your password' : 'Choose a new password'}</h2><p>{mode === 'signin' ? 'Access your ControlPlane console.' : mode === 'signup' ? 'Create a workspace in under a minute.' : mode === 'forgot' ? 'We will email a secure reset link.' : 'Make it long and memorable.'}</p></div><form className="auth-form" onSubmit={submit}>{mode === 'signup' && <label>Username<div className="input-wrap"><UserRound size={16} /><input type="text" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your username" /></div></label>}{mode !== 'reset' && <label>Email address<div className="input-wrap"><Mail size={16} /><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></div></label>}{mode !== 'forgot' && <label>{mode === 'signup' ? 'Create password' : 'Password'}<div className="input-wrap"><LockKeyhole size={16} /><input type={showPassword ? 'text' : 'password'} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Show password">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label>}{mode === 'signup' && <label className="check-label"><input type="checkbox" defaultChecked /> <span>I agree to the <u>terms</u> and <u>privacy policy</u>.</span></label>}{mode === 'signin' && <div className="form-row"><label className="check-label"><input type="checkbox" defaultChecked /> <span>Remember me</span></label><button type="button" className="inline-link" onClick={() => changeMode('forgot')}>Forgot password?</button></div>}<button className="button button-crimson button-full" type="submit">{mode === 'signin' ? 'Sign in to ControlPlane' : mode === 'signup' ? 'Create workspace' : mode === 'forgot' ? 'Send reset link' : 'Update password'} <ArrowRight size={16} /></button></form>{mode !== 'forgot' && mode !== 'reset' && <><div className="auth-divider"><span /> <small>or continue with</small> <span /></div><button className="sso-button"><Sparkles size={15} /> Continue with SSO <small>Enterprise</small></button></>}</>}</section></main><footer className="auth-footer"><span><ShieldCheck size={14} /> Your prompts stay behind your tenant boundary.</span><span>© 2026 ControlPlane.ai</span></footer></div>
}
