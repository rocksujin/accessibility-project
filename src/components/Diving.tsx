import './Diving.scss'

type Props = {
  url?: string
  label?: string
}

export function Diving({ url, label = 'Diving in…' }: Props) {
  return (
    <div
      className="diving"
      role="status"
      aria-live="polite"
      aria-label={url ? `Analyzing ${url}` : label}
    >
      <div className="diving__orb" aria-hidden="true" />
      <ul className="diving__bubbles" aria-hidden="true">
        <li /><li /><li /><li /><li />
      </ul>
      <p className="diving__text">
        <span>{label}</span>
        {url && <span className="diving__url">{url}</span>}
      </p>
    </div>
  )
}
