import { NoteComposer, NoteList } from '../components/notes/NoteParts'
import { Button, Message } from '../components/ui'
import { useAuth } from '../lib/authContext'
import { useThread } from '../lib/noteHooks'
import { useScope } from '../lib/scope'

/**
 * Notes and questions between an athlete and their coordinators. The athlete sees it at "/notes"; a coordinator sees the
 * same conversation inside the athlete's account. Takes an athlete id so the staff area can reuse it.
 */
export function NotesScreen({ athleteId }: { athleteId: string }) {
  const { staffView } = useScope()
  const thread = useThread(athleteId)

  return (
    <main className="flex flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-semibold">Notes</h1>
      <p className="text-sm text-muted">
        {staffView
          ? 'Notes and questions between the athlete and their coordinators. The athlete sees a new note on their home screen until they dismiss it.'
          : 'Send a note or ask a question. Your coordinators see it on their home screen until they dismiss it, and they can write back here.'}
      </p>
      <NoteComposer athleteId={athleteId} to={staffView ? 'the athlete' : 'your coordinator'} />
      <section aria-label="Conversation" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Conversation</h2>
        {thread.isPending ? (
          <p role="status" className="text-muted">
            Loading…
          </p>
        ) : thread.isError ? (
          <div className="flex flex-col gap-3">
            <Message kind="error">We could not load the notes. Check your connection and try again.</Message>
            <Button onClick={() => void thread.refetch()}>Try again</Button>
          </div>
        ) : (
          <NoteList notes={thread.data} />
        )}
      </section>
    </main>
  )
}

export default function Notes() {
  const { state } = useAuth()
  if (state.status !== 'signedIn' || !state.account.athleteId) return null
  return <NotesScreen athleteId={state.account.athleteId} />
}
