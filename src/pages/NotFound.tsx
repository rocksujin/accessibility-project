import { Link } from 'react-router-dom'
import './Placeholder.scss'

export function NotFound() {
  return (
    <div className="placeholder">
      <h1>Page not found</h1>
      <p>
        The page you’re looking for doesn’t exist. <Link to="/">Go home</Link>.
      </p>
    </div>
  )
}
