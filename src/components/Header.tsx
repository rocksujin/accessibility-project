import { useEffect, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Wordmark } from './Wordmark'
import './Header.scss'

const NAV_ITEMS = [
  { to: '/analyze', label: 'Audit' },
  { to: '/keyboard', label: 'Focus Flow' },
  { to: '/component', label: 'Snippet Check' },
]

export function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const headerClass = [
    'site-header',
    scrolled ? 'is-scrolled' : '',
    open ? 'is-menu-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
    <header className={headerClass}>
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand" aria-label="kayai — home">
          <Wordmark size="sm" />
        </Link>

        <button
          type="button"
          className="site-header__toggle"
          aria-expanded={open}
          aria-controls="primary-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`site-header__burger ${open ? 'is-open' : ''}`} aria-hidden="true" />
        </button>

        <nav
          id="primary-nav"
          className={`site-header__nav ${open ? 'is-open' : ''}`}
          aria-label="Primary"
        >
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} onClick={() => setOpen(false)}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>

    <div
      className={`site-header__backdrop ${open ? 'is-open' : ''}`}
      aria-hidden="true"
      onClick={() => setOpen(false)}
    />
    </>
  )
}
