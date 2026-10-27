import { Link } from 'react-router-dom'
import { AuthPage } from '../components/ui'
import { useAuth } from '../lib/authContext'

export default function SessionExpired() {
  const { clearNotice } = useAuth()
  return (
    <AuthPage title="You have been signed out">
      <p className="text-muted">Your session ended. Sign in again to continue.</p>
      <Link to="/sign-in" onClick={clearNotice} className="min-h-11 rounded bg-gold px-4 py-2.5 text-center font-medium text-ink">
        Sign in
      </Link>
    </AuthPage>
  )
}
