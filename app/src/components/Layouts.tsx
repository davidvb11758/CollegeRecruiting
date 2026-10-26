import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/authContext'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 items-center justify-center px-1 text-sm ${isActive ? 'font-semibold text-red-900' : 'text-slate-600'}`

const ATHLETE_TABS = [
  { to: '/home', label: 'Home' },
  { to: '/list', label: 'My List' },
  { to: '/find', label: 'Find' },
  { to: '/profile', label: 'Profile' },
  { to: '/more', label: 'More' },
]

/** Athlete screens: content with a bottom bar that fits a 360px phone. First login goes to profile creation. */
export function AthleteLayout() {
  const { state } = useAuth()
  if (state.status === 'signedIn' && !state.account.athleteId) return <Navigate to="/profile/create" replace />
  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-16">
      <Outlet />
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 border-t border-slate-300 bg-white">
        <div className="mx-auto flex max-w-3xl">
          {ATHLETE_TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={linkClass}>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

const STAFF_TABS = [
  { to: '/staff', label: 'Roster', end: true },
  { to: '/staff/find', label: 'Find Colleges', end: false },
  { to: '/staff/account', label: 'Account', end: false },
]

/** Staff and admin screens: a top bar. */
export function StaffLayout() {
  return (
    <div className="mx-auto min-h-dvh max-w-5xl">
      <nav aria-label="Main" className="sticky top-0 border-b border-slate-300 bg-white">
        <div className="flex items-center">
          {STAFF_TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={linkClass}>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <Outlet />
    </div>
  )
}
