/** Stand-in for a screen that a later work package builds, so the navigation can be used and tested now. */
export default function Placeholder({ title }: { title: string }) {
  return (
    <main className="flex flex-col gap-2 px-4 py-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-slate-600">This screen is not ready yet.</p>
    </main>
  )
}
