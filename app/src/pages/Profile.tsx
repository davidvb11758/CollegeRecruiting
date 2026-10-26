import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import AcademicForm from '../components/profile/AcademicForm'
import AthleticForm from '../components/profile/AthleticForm'
import Completeness from '../components/profile/Completeness'
import HighlightsForm from '../components/profile/HighlightsForm'
import PersonalForm from '../components/profile/PersonalForm'
import WithProfile from '../components/profile/WithProfile'
import { useAuth } from '../lib/authContext'

const TABS = [
  { to: 'personal', label: 'Personal' },
  { to: 'athletic', label: 'Athletic' },
  { to: 'academics', label: 'Academics' },
  { to: 'highlights', label: 'Highlights' },
]

/** A2: the four profile tabs for one athlete. Takes an athlete id so the staff area can reuse it. */
export function ProfileScreen({ athleteId, base }: { athleteId: string; base: string }) {
  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <WithProfile athleteId={athleteId}>
        {(profile, lookups) => (
          <>
            <Completeness profile={profile} />
            <nav aria-label="Profile sections" className="flex border-b border-slate-300">
              {TABS.map((t) => (
                <NavLink
                  key={t.to}
                  to={`${base}/${t.to}`}
                  className={({ isActive }) =>
                    `flex min-h-11 flex-1 items-center justify-center text-sm ${isActive ? 'border-b-2 border-red-900 font-semibold text-red-900' : 'text-slate-600'}`
                  }
                >
                  {t.label}
                </NavLink>
              ))}
            </nav>
            <Routes>
              <Route index element={<Navigate to="personal" replace />} />
              <Route path="personal" element={<PersonalForm athleteId={athleteId} profile={profile} lookups={lookups} />} />
              <Route path="athletic" element={<AthleticForm athleteId={athleteId} profile={profile} lookups={lookups} />} />
              <Route path="academics" element={<AcademicForm athleteId={athleteId} profile={profile} lookups={lookups} />} />
              <Route path="highlights" element={<HighlightsForm athleteId={athleteId} profile={profile} />} />
            </Routes>
          </>
        )}
      </WithProfile>
    </main>
  )
}

export default function Profile() {
  const { state } = useAuth()
  if (state.status !== 'signedIn' || !state.account.athleteId) return null
  return <ProfileScreen athleteId={state.account.athleteId} base="/profile" />
}
