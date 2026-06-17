import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import './Layout.scss'

export function Layout() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="site-main">
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
