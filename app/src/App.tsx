import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import { RequireRole, RootRedirect, SignedOutOnly } from './components/Guards'
import { AthleteLayout, StaffLayout } from './components/Layouts'
import { Splash } from './components/ui'
import { AuthProvider } from './lib/auth'
import Account from './pages/Account'
import CollegeDetail, { StaffCollegeDetail } from './pages/CollegeDetail'
import CreateProfile from './pages/CreateProfile'
import Find, { StaffFind } from './pages/Find'
import Home from './pages/Home'
import ListHub from './pages/ListHub'
import MyList from './pages/MyList'
import ForgotPassword from './pages/ForgotPassword'
import NotFound from './pages/NotFound'
import Preferences from './pages/Preferences'
import Profile from './pages/Profile'
import ResetPassword from './pages/ResetPassword'
import SessionExpired from './pages/SessionExpired'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'

// The staff screens are only downloaded by staff.
const Roster = lazy(() => import('./pages/Roster'))
const StaffAthlete = lazy(() => import('./pages/StaffAthlete'))

// One quick retry smooths over a brief network drop; tests fail fast instead.
const makeQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: import.meta.env.MODE === 'test' ? false : 1 } } })

export default function App() {
  // Created per app instance, so nothing cached in one test or session leaks into another.
  const [queryClient] = useState(makeQueryClient)
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/" element={<RootRedirect />} />

              <Route element={<SignedOutOnly />}>
                <Route path="/sign-in" element={<SignIn />} />
                <Route path="/sign-up" element={<SignUp />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
              </Route>
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/session-expired" element={<SessionExpired />} />

              <Route element={<RequireRole roles={['athlete']} />}>
                <Route path="/profile/create" element={<CreateProfile />} />
                <Route element={<AthleteLayout />}>
                  <Route path="/home" element={<Home />} />
                  <Route path="/list" element={<MyList />} />
                  <Route path="/list/:listId/*" element={<ListHub />} />
                  <Route path="/find" element={<Find />} />
                  <Route path="/find/:programId" element={<CollegeDetail />} />
                  <Route path="/profile/*" element={<Profile />} />
                  <Route path="/preferences" element={<Preferences />} />
                  <Route path="/more" element={<Account />} />
                </Route>
              </Route>

              <Route element={<RequireRole roles={['staff', 'admin']} />}>
                <Route element={<StaffLayout />}>
                  <Route path="/staff" element={<Roster />} />
                  <Route path="/staff/athlete/:athleteId/*" element={<StaffAthlete />} />
                  <Route path="/staff/find" element={<StaffFind />} />
                  <Route path="/staff/find/:programId" element={<StaffCollegeDetail />} />
                  <Route path="/staff/account" element={<Account />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
