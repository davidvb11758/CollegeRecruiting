import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Routes } from 'react-router-dom'
import { RequireRole, RootRedirect, SignedOutOnly } from './components/Guards'
import { AthleteLayout, StaffLayout } from './components/Layouts'
import { AuthProvider } from './lib/auth'
import Account from './pages/Account'
import CreateProfile from './pages/CreateProfile'
import ForgotPassword from './pages/ForgotPassword'
import NotFound from './pages/NotFound'
import Placeholder from './pages/Placeholder'
import ResetPassword from './pages/ResetPassword'
import SessionExpired from './pages/SessionExpired'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'

const queryClient = new QueryClient()

export default function App() {
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
              <Route path="/find" element={<Placeholder title="Find Colleges" />} />
              <Route path="/profile" element={<Placeholder title="Profile" />} />
              <Route path="/more" element={<Account />} />
            </Route>
          </Route>

          <Route element={<RequireRole roles={['staff', 'admin']} />}>
            <Route element={<StaffLayout />}>
              <Route path="/staff" element={<Placeholder title="Roster" />} />
              <Route path="/staff/find" element={<Placeholder title="Find Colleges" />} />
              <Route path="/staff/account" element={<Account />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </QueryClientProvider>
  )
}
