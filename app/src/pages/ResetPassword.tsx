import { Link, useNavigate } from 'react-router-dom'
import NewPasswordForm from '../components/NewPasswordForm'
import { AuthPage, Message, Splash } from '../components/ui'
import { useAuth } from '../lib/authContext'

/** The page a password-reset email link opens. The link signs the person in just long enough to set a new password. */
export default function ResetPassword() {
  const { state } = useAuth()
  const navigate = useNavigate()

  if (state.status === 'loading') return <Splash />
  if (state.status !== 'signedIn') {
    return (
      <AuthPage title="Reset your password">
        <Message kind="error">This reset link has expired or was already used. Request a new one.</Message>
        <Link to="/forgot-password" className="text-gold underline">
          Send a new link
        </Link>
      </AuthPage>
    )
  }
  return (
    <AuthPage title="Choose a new password">
      <NewPasswordForm submitLabel="Save password" onDone={() => navigate('/', { replace: true })} />
    </AuthPage>
  )
}
