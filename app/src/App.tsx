import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Routes } from 'react-router-dom'
import NotFound from './pages/NotFound'
import SignedOut from './pages/SignedOut'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<SignedOut />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </QueryClientProvider>
  )
}
