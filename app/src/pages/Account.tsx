import { Link } from 'react-router-dom'
import NewPasswordForm from '../components/NewPasswordForm'
import { SecondaryButton } from '../components/ui'
import { useAuth } from '../lib/authContext'

const ROLE_LABEL = { athlete: 'Athlete', staff: 'Staff', admin: 'Administrator' } as const

/** Account details, change password and sign out. Shared by the athlete "More" tab and the staff "Account" tab. */
export default function Account() {
  const { state, signOut } = useAuth()
  if (state.status !== 'signedIn') return null
  const { account } = state
  return (
    <main className="flex flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-600">Name</dt>
        <dd>{account.displayName}</dd>
        <dt className="text-slate-600">Email</dt>
        <dd className="break-all">{account.email}</dd>
        <dt className="text-slate-600">Role</dt>
        <dd>{ROLE_LABEL[account.role]}</dd>
      </dl>
      {account.role === 'athlete' && (
        <Link to="/preferences" className="min-h-11 max-w-md rounded border border-slate-300 bg-white px-4 py-2.5 font-medium text-red-900">
          My College Preferences
        </Link>
      )}
      <section className="flex max-w-md flex-col gap-3">
        <h2 className="text-lg font-semibold">Change password</h2>
        <NewPasswordForm submitLabel="Change password" />
      </section>
      <SecondaryButton onClick={() => void signOut()} className="max-w-md">
        Sign out
      </SecondaryButton>
    </main>
  )
}
