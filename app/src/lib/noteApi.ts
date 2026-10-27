import { client, ok, type Row } from './dbClient'
import type { NoteValues } from './noteSchemas'

/** One note as the signed-in person sees it (the note_thread view). */
export type Note = {
  id: string
  athleteId: string
  athleteName: string
  sender: 'athlete' | 'staff'
  senderName: string
  kind: 'note' | 'question'
  body: string
  createdAt: string
  /** Addressed to me: a coordinator's note to the athlete, or the athlete's note to the coordinators assigned to them. */
  forMe: boolean
  /** I have dismissed it from my home screen. */
  dismissed: boolean
  /** I wrote it. */
  mine: boolean
}

const toNote = (r: Row): Note => ({
  id: String(r.note_id),
  athleteId: String(r.athlete_id),
  athleteName: String(r.athlete_name ?? ''),
  sender: r.sender === 'staff' ? 'staff' : 'athlete',
  senderName: String(r.sender_name ?? ''),
  kind: r.kind === 'question' ? 'question' : 'note',
  body: String(r.body ?? ''),
  createdAt: String(r.created_at),
  forMe: r.for_me === true,
  dismissed: r.dismissed === true,
  mine: r.mine === true,
})

/** Notes waiting for the signed-in person: addressed to them and not dismissed. Newest first. */
export async function fetchInbox(): Promise<Note[]> {
  const rows = ok<Row[]>(await client().from('note_thread').select('*').eq('for_me', true).eq('dismissed', false).order('created_at', { ascending: false }))
  return rows.map(toNote)
}

/** The whole conversation about one athlete, in both directions, newest first. */
export async function fetchThread(athleteId: string): Promise<Note[]> {
  const rows = ok<Row[]>(await client().from('note_thread').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }))
  return rows.map(toNote)
}

/** The sender, author and time are set by the database from who is signed in. */
export async function sendNote(athleteId: string, v: NoteValues): Promise<void> {
  ok(await client().from('athlete_note').insert({ athlete_id: athleteId, kind: v.kind, body: v.body.trim() }))
}

/** Takes the note off my home screen. It stays in the conversation, and other people's home screens are not affected. */
export async function dismissNote(noteId: string): Promise<void> {
  ok(await client().from('athlete_note_dismissal').insert({ note_id: noteId }))
}
