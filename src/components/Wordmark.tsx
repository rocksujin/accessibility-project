import './Wordmark.scss'

type Props = {
  as?: 'h1' | 'span' | 'div'
  size?: 'sm' | 'lg'
}

export function Wordmark({ as: Tag = 'span', size = 'sm' }: Props) {
  return (
    <Tag className={`wordmark wordmark--${size}`} aria-label="kayai">
      <span className="wordmark__mark" aria-hidden="true" />
      <span className="wordmark__text" aria-hidden="true">kayai</span>
    </Tag>
  )
}
