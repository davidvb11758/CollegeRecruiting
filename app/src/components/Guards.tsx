import { Navigate, Outlet } from 'react-router-dom'
import { homePath, useAuth, type Role } from '../lib/authContext'
import { Button, Message, Splash } from './ui'

/** Hook: the loading or retry screen while the session or account is not ready; null once it is. */
function usePending() {
  const { state, refresh } = useAuth()
  if (state.status === 'loading') return <Splash />
  if (state.status === 'error') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <Message kind="error">We could not load your account. Check your connection and try again.</Message>
        <Button onClick={refresh}>Try again</Button>
      </main>
    )
  }
  return null
}

/** Signed-in pages. Anyone else goes to sign-in; the wrong role goes to their own home page. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { state, notice } = useAuth()
  const waiting = usePending()
  if (waiting) return waiting
  if (state.status !== 'signedIn') return <Navigate to={notice === 'expired' ? '/session-expired' : '/sign-in'} replace />
  if (!roles.includes(state.account.role)) return <Navigate to={homePath(state.account)} replace />
  return <Outlet />
}

/** Sign-in, sign-up and forgot-password: only for people who are signed out. */
export function SignedOutOnly() {
  const { state } = useAuth()
  if (state.status === 'loading') return <Splash />
  if (state.status === 'signedIn') return <Navigate to={homePath(state.account)} replace />
  return <Outlet />
}

/** "/" sends everyone to the right place. */
export function RootRedirect() {
  const { state } = useAuth()
  const waiting = usePending()
  if (waiting) return waiting
  if (state.status === 'signedIn') return <Navigate to={homePath(state.account)} replace />
  return <Navigate to="/sign-in" replace />
}
