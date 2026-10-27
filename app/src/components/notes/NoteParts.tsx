import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { clubDateOf, formatDate } from '../../lib/dates'
import { dismissNote, sendNote, type Note } from '../../lib/noteApi'
import { useNoteWrite } from '../../lib/noteHooks'
import { noteSchema, type NoteValues } from '../../lib/noteSchemas'
import { Button, Message, SecondaryButton, SelectField, TextAreaField } from '../ui'

const KIND_OPTIONS = [
  { value: 'note', label: 'Note' },
  { value: 'question', label: 'Question' },
]

function KindBadge({ kind }: { kind: Note['kind'] }) {
  return <span className="w-fit rounded bg-line px-2 py-0.5 text-xs font-medium">{kind === 'question' ? 'Question' : 'Note'}</span>
}

/** Who and when, for example "Coach Kim · Nov 3". */
const byline = (n: Note, who: string) => `${who} · ${formatDate(clubDateOf(n.createdAt))}`

/** A note waiting to be read, with its Dismiss button. `replyTo` adds a link to the conversation. */
export function NoteCard({ note, who, replyTo, onDismiss, busy }: { note: Note; who: string; replyTo?: string; onDismiss: () => void; busy: boolean }) {
  return (
    <li className="flex flex-col gap-2 rounded border border-gold bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={note.kind} />
        <span className="text-sm text-muted">{byline(note, who)}</span>
      </div>
      <p className="whitespace-pre-line">{note.body}</p>
      <div className="flex flex-wrap items-center gap-2">
        <SecondaryButton type="button" className="min-h-9 px-3 text-sm" disabled={busy} onClick={onDismiss}>
          Dismiss
        </SecondaryButton>
        {replyTo && (
          <Link to={replyTo} className="flex min-h-9 items-center text-sm text-gold underline">
            Reply
          </Link>
        )}
      </div>
    </li>
  )
}

/** The notes waiting for the signed-in person. Nothing is shown when there are none. */
export function NoteInbox({
  notes,
  label,
  whoOf,
  replyFor,
}: {
  notes: Note[]
  label: string
  /** The name shown for the sender of this note. */
  whoOf: (n: Note) => string
  replyFor: (n: Note) => string
}) {
  const dismiss = useNoteWrite((id: string) => dismissNote(id))
  if (notes.length === 0) return null
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{label}</h2>
      {dismiss.error && <Message kind="error">{dismiss.error}</Message>}
      <ul className="flex flex-col gap-2">
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} who={whoOf(n)} replyTo={replyFor(n)} busy={dismiss.pending} onDismiss={() => void dismiss.run(n.id).catch(() => undefined)} />
        ))}
      </ul>
    </section>
  )
}

/** Write a note or a question. `to` says who will get it ("your coordinator", "the athlete"). */
export function NoteComposer({ athleteId, to }: { athleteId: string; to: string }) {
  const write = useNoteWrite((v: NoteValues) => sendNote(athleteId, v))
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NoteValues>({ resolver: zodResolver(noteSchema), defaultValues: { kind: 'note', body: '' } })
  const submit = handleSubmit((v) => write.run(v).then(() => reset({ kind: v.kind, body: '' }), () => undefined))
  return (
    <form noValidate aria-label="Send a note" onSubmit={submit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Send a note or question to {to}</h2>
      <SelectField label="This is a" options={KIND_OPTIONS} {...register('kind')} />
      <TextAreaField label="Your message" hint="Up to 1000 characters." error={errors.body?.message} {...register('body')} />
      {write.error && <Message kind="error">{write.error}</Message>}
      {write.saved && !write.error && <Message kind="info">Sent.</Message>}
      <Button type="submit" disabled={write.pending}>
        {write.pending ? 'Sending…' : 'Send'}
      </Button>
    </form>
  )
}

/** The whole conversation, newest first. A note addressed to me that I have not dismissed is marked New. */
export function NoteList({ notes }: { notes: Note[] }) {
  const dismiss = useNoteWrite((id: string) => dismissNote(id))
  if (notes.length === 0) return <p className="text-sm text-muted">No notes yet.</p>
  return (
    <div className="flex flex-col gap-2">
      {dismiss.error && <Message kind="error">{dismiss.error}</Message>}
      <ul aria-label="Notes" className="flex flex-col gap-2">
        {notes.map((n) => {
          const isNew = n.forMe && !n.dismissed
          return (
            <li key={n.id} className={`flex flex-col gap-2 rounded border p-3 ${isNew ? 'border-gold bg-surface' : 'border-line bg-surface'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <KindBadge kind={n.kind} />
                <span className="text-sm text-muted">{byline(n, n.mine ? 'You' : n.senderName)}</span>
                {isNew && <span className="text-sm font-medium text-gold">New</span>}
              </div>
              <p className="whitespace-pre-line">{n.body}</p>
              {isNew && (
                <SecondaryButton type="button" className="min-h-9 w-fit px-3 text-sm" disabled={dismiss.pending} onClick={() => void dismiss.run(n.id).catch(() => undefined)}>
                  Dismiss
                </SecondaryButton>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
