import Completeness from '../components/profile/Completeness'
import PreferencesForm from '../components/profile/PreferencesForm'
import WithProfile from '../components/profile/WithProfile'
import { useAuth } from '../lib/authContext'

/** A3: My College Preferences for one athlete. Takes an athlete id so the staff area can reuse it. */
export function PreferencesScreen({ athleteId }: { athleteId: string }) {
  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">My College Preferences</h1>
      <WithProfile athleteId={athleteId}>
        {(profile, lookups) => (
          <>
            <Completeness profile={profile} />
            <PreferencesForm athleteId={athleteId} profile={profile} lookups={lookups} />
          </>
        )}
      </WithProfile>
    </main>
  )
}

export default function Preferences() {
  const { state } = useAuth()
  if (state.status !== 'signedIn' || !state.account.athleteId) return null
  return <PreferencesScreen athleteId={state.account.athleteId} />
}
