import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * The last safety net: if a screen crashes while drawing, the family sees a plain message and a way back instead of a
 * blank page. Nothing is sent anywhere; the details go to the browser console for whoever is helping.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The app stopped on an unexpected error', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
        <div role="alert" className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-slate-700">The page stopped unexpectedly. Your saved information is safe. Reload the page to try again.</p>
        </div>
        <button className="min-h-11 rounded bg-red-900 px-4 font-medium text-white" onClick={() => window.location.assign('/')}>
          Reload
        </button>
      </main>
    )
  }
}
