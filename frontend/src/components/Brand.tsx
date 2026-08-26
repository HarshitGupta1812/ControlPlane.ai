import { Link } from 'react-router-dom'

export function ShieldMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 44" fill="none" aria-hidden="true">
      <path d="M20 2.5 36 8.2v11.4c0 10.2-6.6 17.2-16 21.8C10.6 36.8 4 29.8 4 19.6V8.2L20 2.5Z" fill="currentColor" fillOpacity=".13" stroke="currentColor" strokeWidth="2.5" />
      <path d="M20 8.1 30.7 12v7.7c0 6.8-4.1 11.5-10.7 15.1-6.6-3.6-10.7-8.3-10.7-15.1V12L20 8.1Z" fill="currentColor" fillOpacity=".16" />
      <path d="m13.2 21.2 4.2 4.2 9.8-10" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="20.5" r="17.5" stroke="currentColor" strokeOpacity=".32" />
    </svg>
  )
}

export function Brand({ compact = false, link = true }: { compact?: boolean; link?: boolean }) {
  const content = (
    <span className="brand-lockup">
      <span className="brand-mark"><ShieldMark size={compact ? 27 : 31} /></span>
      {!compact && <span className="brand-wordmark">control<span>plane</span><b>.ai</b></span>}
    </span>
  )
  return link ? <Link to="/" className="brand-link" aria-label="ControlPlane home">{content}</Link> : content
}
