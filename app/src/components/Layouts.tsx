import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/authContext'

/** `edge` is the side of the tab that carries the gold indicator of the current section. */
const linkClass =
  (edge: 'top' | 'bottom') =>
  ({ isActive }: { isActive: boolean }) =>
    `flex min-h-14 flex-1 items-center justify-center px-1 text-sm ${edge === 'top' ? 'border-t-2' : 'border-b-2'} ${
      isActive ? 'border-gold font-semibold text-gold' : 'border-transparent text-muted'
    }`

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
    <div className="mx-auto min-h-dvh max-w-3xl pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <Outlet />
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-3xl">
          {ATHLETE_TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={linkClass('top')}>
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

/** Staff and admin screens: a top bar. The Roster tab stays lit while a coordinator works inside an athlete's account. */
export function StaffLayout() {
  const { pathname } = useLocation()
  const insideAthlete = pathname.startsWith('/staff/athlete/')
  return (
    <div className="mx-auto min-h-dvh max-w-5xl">
      <nav aria-label="Main" className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="flex items-center">
          {STAFF_TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={(state) => linkClass('bottom')({ isActive: state.isActive || (t.to === '/staff' && insideAthlete) })}
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <Outlet />
    </div>
  )
}
