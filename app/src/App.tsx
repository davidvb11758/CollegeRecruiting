import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { RequireRole, RootRedirect, SignedOutOnly } from './components/Guards'
import { AthleteLayout, StaffLayout } from './components/Layouts'
import { AuthProvider } from './lib/auth'
import Account from './pages/Account'
import CollegeDetail, { StaffCollegeDetail } from './pages/CollegeDetail'
import CreateProfile from './pages/CreateProfile'
import Find, { StaffFind } from './pages/Find'
import ForgotPassword from './pages/ForgotPassword'
import NotFound from './pages/NotFound'
import Placeholder from './pages/Placeholder'
import Preferences from './pages/Preferences'
import Profile from './pages/Profile'
import ResetPassword from './pages/ResetPassword'
import SessionExpired from './pages/SessionExpired'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'

// One quick retry smooths over a brief network drop; tests fail fast instead.
const makeQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: import.meta.env.MODE === 'test' ? false : 1 } } })

export default function App() {
  // Created per app instance, so nothing cached in one test or session leaks into another.
  const [queryClient] = useState(makeQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
              <Route path="/home" element={<Placeholder title="Home" />} />
              <Route path="/list" element={<Placeholder title="My List" />} />
              <Route path="/find" element={<Find />} />
              <Route path="/find/:programId" element={<CollegeDetail />} />
              <Route path="/profile/*" element={<Profile />} />
              <Route path="/preferences" element={<Preferences />} />
              <Route path="/more" element={<Account />} />
            </Route>
          </Route>

          <Route element={<RequireRole roles={['staff', 'admin']} />}>
            <Route element={<StaffLayout />}>
              <Route path="/staff" element={<Placeholder title="Roster" />} />
              <Route path="/staff/find" element={<StaffFind />} />
              <Route path="/staff/find/:programId" element={<StaffCollegeDetail />} />
              <Route path="/staff/account" element={<Account />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </QueryClientProvider>
  )
}
