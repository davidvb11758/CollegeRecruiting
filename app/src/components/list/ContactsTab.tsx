import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { str } from '../../lib/forms'
import { deleteOwnCoach, saveOwnCoach, setMainCoach, type ListHub, type Row } from '../../lib/listApi'
import { useListWrite } from '../../lib/listHooks'
import { COACH_TITLE_OPTIONS } from '../../lib/listLabels'
import { coachContactSchema, type CoachContactValues } from '../../lib/listSchemas'
import CoachCard from '../CoachCard'
import { Button, Field, Message, OutlineButton, SecondaryButton, SelectField } from '../ui'

function ContactForm({ athleteId, programId, coach, onDone }: { athleteId: string; programId: number; coach?: Row; onDone: () => void }) {
  const write = useListWrite((v: CoachContactValues) => saveOwnCoach({ athleteId, programId, id: coach ? Number(coach.id) : undefined }, v))
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CoachContactValues>({
    resolver: zodResolver(coachContactSchema),
    defaultValues: {
      fullName: str(coach?.full_name),
      title: (str(coach?.title) || 'assistant') as CoachContactValues['title'],
      email: str(coach?.email),
      phone: str(coach?.phone),
      note: str(coach?.recruits_note),
    },
  })
  return (
    <form noValidate aria-label={coach ? 'Edit contact' : 'Add a contact'} onSubmit={handleSubmit((v) => write.run(v).then(onDone, () => undefined))} className="flex flex-col gap-3 rounded border border-line bg-surface p-3">
      <h3 className="font-semibold">{coach ? 'Change this contact' : 'Add a contact'}</h3>
      <Field label="Name" error={errors.fullName?.message} {...register('fullName')} />
      <SelectField label="Role" options={COACH_TITLE_OPTIONS} error={errors.title?.message} {...register('title')} />
      <Field label="Email" type="email" error={errors.email?.message} {...register('email')} />
      <Field label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
      <Field label="Note" hint="For example: met at the camp." error={errors.note?.message} {...register('note')} />
      {write.error && <Message kind="error">{write.error}</Message>}
      <Button type="submit" disabled={write.pending}>
        {write.pending ? 'Saving…' : 'Save contact'}
      </Button>
      <SecondaryButton type="button" onClick={onDone}>
        Cancel
      </SecondaryButton>
    </form>
  )
}

/** A8c: the program's coaches (shared records plus the athlete's own), and adding a contact of your own. */
export default function ContactsTab({ listId, athleteId, hub }: { listId: string; athleteId: string; hub: ListHub }) {
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const main = useListWrite((coachId: number | null) => setMainCoach(listId, coachId))
  const remove = useListWrite((id: number) => deleteOwnCoach(id))
  const mainId = hub.entry.main_coach_id
  const programId = Number(hub.entry.program_id)

  return (
    <div className="flex flex-col gap-3">
      {hub.coaches.length === 0 && <p className="text-sm text-muted">No coach contacts are listed for this program. Add one you have found.</p>}
      {(main.error || remove.error) && <Message kind="error">{main.error ?? remove.error}</Message>}
      <ul aria-label="Coaches" className="flex flex-col gap-2">
        {hub.coaches.map((c) => {
          const isMain = mainId === c.id
          const own = c.owner_athlete_id != null
          return editing !== 'new' && editing && editing.id === c.id ? (
            <li key={String(c.id)}>
              <ContactForm athleteId={athleteId} programId={programId} coach={c} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <CoachCard
              key={String(c.id)}
              coach={c}
              badge={isMain ? <span className="w-fit rounded bg-gold px-2 py-0.5 text-xs font-medium text-ink">Main contact</span> : undefined}
              actions={
                <div className="flex flex-wrap gap-2">
                  {isMain ? (
                    <SecondaryButton type="button" className="min-h-9 px-3 text-sm" disabled={main.pending} onClick={() => void main.run(null).catch(() => undefined)}>
                      Not my main contact
                    </SecondaryButton>
                  ) : (
                    <SecondaryButton type="button" className="min-h-9 px-3 text-sm" disabled={main.pending} onClick={() => void main.run(Number(c.id)).catch(() => undefined)}>
                      Make main contact
                    </SecondaryButton>
                  )}
                  {own && (
                    <>
                      <SecondaryButton type="button" className="min-h-9 px-3 text-sm" onClick={() => setEditing(c)}>
                        Edit
                      </SecondaryButton>
                      {confirming === c.id ? (
                        <>
                          <Button type="button" className="min-h-9 px-3 text-sm" disabled={remove.pending} onClick={() => void remove.run(Number(c.id)).then(() => setConfirming(null), () => undefined)}>
                            Yes, delete
                          </Button>
                          <SecondaryButton type="button" className="min-h-9 px-3 text-sm" onClick={() => setConfirming(null)}>
                            Keep it
                          </SecondaryButton>
                        </>
                      ) : (
                        <SecondaryButton type="button" className="min-h-9 px-3 text-sm" onClick={() => setConfirming(Number(c.id))}>
                          Delete
                        </SecondaryButton>
                      )}
                    </>
                  )}
                </div>
              }
            />
          )
        })}
      </ul>
      {editing === 'new' ? (
        <ContactForm athleteId={athleteId} programId={programId} onDone={() => setEditing(null)} />
      ) : (
        <OutlineButton type="button" onClick={() => setEditing('new')}>
          Add a contact
        </OutlineButton>
      )}
    </div>
  )
}
