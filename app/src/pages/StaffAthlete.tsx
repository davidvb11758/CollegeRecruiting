import { useMemo, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Button, Message } from '../components/ui'
import { useAuth } from '../lib/authContext'
import { formatDate } from '../lib/dates'
import { useLookups, useProfile } from '../lib/profileHooks'
import { ScopeContext, staffAthletePrefix } from '../lib/scope'
import { useHistory } from '../lib/staffHooks'
import { CollegeDetailScreen } from './CollegeDetail'
import { FindScreen } from './Find'
import { HomeScreen } from './Home'
import { ListHubScreen } from './ListHub'
import { NotesScreen } from './Notes'
import { MyListScreen } from './MyList'
import { PreferencesScreen } from './Preferences'
import { ProfileScreen } from './Profile'

const TABS = [
  { to: 'home', label: 'Home' },
  { to: 'list', label: 'List' },
  { to: 'find', label: 'Find' },
  { to: 'profile', label: 'Profile' },
  { to: 'preferences', label: 'Preferences' },
  { to: 'notes', label: 'Notes' },
  { to: 'history', label: 'History' },
]

/** The change history for one athlete: who changed what and when, with coordinators named. */
function HistoryScreen({ athleteId }: { athleteId: string }) {
  const history = useHistory(athleteId)
  const [staffOnly, setStaffOnly] = useState(false)
  const items = useMemo(() => (history.data ?? []).filter((i) => !staffOnly || i.byStaff), [history.data, staffOnly])
  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">History</h1>
      {history.isPending ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : history.isError ? (
        <div className="flex flex-col gap-3">
          <Message kind="error">We could not load the history.</Message>
          <Button onClick={() => void history.refetch()}>Try again</Button>
        </div>
      ) : (
        <>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={staffOnly} onChange={(e) => setStaffOnly(e.target.checked)} />
            Show only changes made by staff
          </label>
          {items.length === 0 ? (
            <p className="text-sm text-muted">{staffOnly ? 'Staff have not changed anything yet.' : 'No changes recorded yet.'}</p>
          ) : (
            <ul aria-label="Changes" className="flex flex-col gap-2">
              {items.map((i) => (
                <li key={i.id} className="flex flex-col rounded border border-line bg-surface p-3">
                  <span className="text-sm text-muted">
                    {formatDate(i.changedAt.slice(0, 10))} · {i.who}
                  </span>
                  <span className="font-medium">
                    {i.kind}: {i.area}
                  </span>
                  {i.fields.length > 0 && <span className="text-sm text-muted">{i.fields.slice(0, 8).join(', ')}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}

/** S2: a coordinator works inside one athlete's account. Every athlete screen is reused with the athlete's id. */
export default function StaffAthlete() {
  const { athleteId = '' } = useParams()
  const { state } = useAuth()
  const profile = useProfile(athleteId)
  const lookups = useLookups()
  const prefix = staffAthletePrefix(athleteId)
  const scope = useMemo(() => ({ prefix, staffView: true }), [prefix])
  const me = state.status === 'signedIn' ? state.account.displayName : ''

  const back = (
    <Link to="/staff" className="flex min-h-11 items-center text-gold underline">
      ← Roster
    </Link>
  )
  if (profile.isPending) {
    return (
      <main className="px-4 py-6">
        {back}
        <p role="status" className="text-muted">
          Loading…
        </p>
      </main>
    )
  }
  if (profile.isError || !profile.data) {
    return (
      <main className="flex flex-col gap-3 px-4 py-6">
        {back}
        <Message kind="error">This athlete was not found, or is not assigned to you.</Message>
      </main>
    )
  }

  const a = profile.data.athlete
  const name = `${String(a.first_name)} ${String(a.last_name)}`
  const team = lookups.data?.teams.find((t) => t.id === a.team_id)?.name ?? ''

  return (
    <ScopeContext.Provider value={scope}>
      <div className="mx-auto max-w-3xl">
        <div role="status" aria-label="Who you are editing" className="mx-4 mt-3 rounded border border-gold bg-gold/10 p-3 text-sm text-fg">
          <p className="font-medium">
            Editing {name}&apos;s account{me ? ` as ${me}` : ''}
          </p>
          <p>
            {team && `${team} · `}Class of {String(a.graduation_year)}. Your name is recorded on every change you make.
          </p>
        </div>
        <div className="px-4">{back}</div>
        <nav aria-label="Athlete sections" className="mx-4 flex overflow-x-auto border-b border-line">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={`${prefix}/${t.to}`}
              className={({ isActive }) =>
                `flex min-h-11 flex-1 items-center justify-center whitespace-nowrap px-2 text-sm ${isActive ? 'border-b-2 border-gold font-semibold text-gold' : 'text-muted'}`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <Routes>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomeScreen athleteId={athleteId} />} />
          <Route path="list" element={<MyListScreen athleteId={athleteId} base={`${prefix}/list`} />} />
          <Route path="list/:listId/*" element={<ListHubScreen athleteId={athleteId} base={`${prefix}/list`} />} />
          <Route path="find" element={<FindScreen base={`${prefix}/find`} athleteId={athleteId} />} />
          <Route path="find/:programId" element={<CollegeDetailScreen base={`${prefix}/find`} athleteId={athleteId} />} />
          <Route path="profile/*" element={<ProfileScreen athleteId={athleteId} base={`${prefix}/profile`} />} />
          <Route path="preferences" element={<PreferencesScreen athleteId={athleteId} />} />
          <Route path="notes" element={<NotesScreen athleteId={athleteId} />} />
          <Route path="history" element={<HistoryScreen athleteId={athleteId} />} />
        </Routes>
      </div>
    </ScopeContext.Provider>
  )
}
