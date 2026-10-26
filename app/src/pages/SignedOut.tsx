import { readEnv } from '../lib/env'

export default function SignedOut() {
  const configured = readEnv() !== null
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Rockets College Recruiting</h1>
      <p className="text-slate-600">Sign in to manage your college list, activity and next steps.</p>
      <p role="status" className="rounded border border-slate-300 bg-white p-3 text-sm text-slate-600">
        {configured ? 'Sign-in is coming soon.' : 'This app is not connected to a database yet.'}
      </p>
    </main>
  )
}
