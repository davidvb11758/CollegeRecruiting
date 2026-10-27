import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="text-gold underline">
        Back to the start
      </Link>
    </main>
  )
}
