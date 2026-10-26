import { Navigate } from 'react-router-dom'
import { SecondaryButton } from '../components/ui'
import { useAuth } from '../lib/authContext'

/** First login for an athlete: no athlete record yet. The form itself is built in WP6. */
export default function CreateProfile() {
  const { state, signOut } = useAuth()
  if (state.status === 'signedIn' && state.account.athleteId) return <Navigate to="/home" replace />
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Create your athlete profile</h1>
      <p className="text-slate-600">This step is not ready yet.</p>
      <SecondaryButton onClick={() => void signOut()}>Sign out</SecondaryButton>
    </main>
  )
}
