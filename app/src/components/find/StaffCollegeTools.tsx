import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { coachTitleLabel } from '../../lib/collegeLabels'
import { formatDate } from '../../lib/dates'
import { str } from '../../lib/forms'
import { markVerified, saveCoach, saveCollegeFacts, type MasterRecord } from '../../lib/masterApi'
import { useMasterRecord, useMasterWrite } from '../../lib/masterHooks'
import { coachEditSchema, collegeEditSchema, EMPLOYMENT_OPTIONS, STATUS_OPTIONS, type CoachEditValues, type CollegeEditValues } from '../../lib/masterSchemas'
import type { Row } from '../../lib/dbClient'
import { COACH_TITLE_OPTIONS } from '../../lib/listLabels'
import { Button, CheckboxField, Field, Message, OutlineButton, SecondaryButton, SelectField } from '../ui'

function FactsForm({ record, programId, onDone }: { record: MasterRecord; programId: number; onDone: () => void }) {
  const { program, college } = record
  const write = useMasterWrite((v: CollegeEditValues) => saveCollegeFacts(programId, Number(program.unitid), v))
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CollegeEditValues>({
    resolver: zodResolver(collegeEditSchema),
    defaultValues: {
      programUrl: str(program.program_url),
      questionnaireUrl: str(program.questionnaire_url),
      campsUrl: str(program.camps_url),
      instagramUrl: str(program.instagram_url),
      xUrl: str(program.x_url),
      lastSeasonRecord: str(program.last_season_record),
      websiteUrl: str(college.website_url),
      costUrl: str(college.cost_url),
      status: str(program.status) as CollegeEditValues['status'],
    },
  })
  return (
    <form
      noValidate
      aria-label="Edit college information"
      onSubmit={handleSubmit((v) => write.run(v).then(onDone, () => undefined))}
      className="flex flex-col gap-3 rounded border border-slate-300 bg-white p-3"
    >
      <h3 className="font-semibold">Edit college information</h3>
      <p className="text-sm text-slate-600">Changes are seen by every athlete and are recorded with your name.</p>
      <Field label="Volleyball program page" type="url" error={errors.programUrl?.message} {...register('programUrl')} />
      <Field label="Recruiting questionnaire" type="url" error={errors.questionnaireUrl?.message} {...register('questionnaireUrl')} />
      <Field label="Camps page" type="url" error={errors.campsUrl?.message} {...register('campsUrl')} />
      <Field label="Instagram" type="url" error={errors.instagramUrl?.message} {...register('instagramUrl')} />
      <Field label="X (Twitter)" type="url" error={errors.xUrl?.message} {...register('xUrl')} />
      <Field label="Last season record" error={errors.lastSeasonRecord?.message} {...register('lastSeasonRecord')} />
      <Field label="College website" type="url" error={errors.websiteUrl?.message} {...register('websiteUrl')} />
      <Field label="Cost of attendance page" type="url" error={errors.costUrl?.message} {...register('costUrl')} />
      <SelectField label="Program status" options={STATUS_OPTIONS} error={errors.status?.message} {...register('status')} />
      {write.error && <Message kind="error">{write.error}</Message>}
      <Button type="submit" disabled={write.pending}>
        {write.pending ? 'Saving…' : 'Save college information'}
      </Button>
      <SecondaryButton type="button" onClick={onDone}>
        Cancel
      </SecondaryButton>
    </form>
  )
}

function CoachForm({ record, programId, coach, onDone }: { record: MasterRecord; programId: number; coach?: Row; onDone: () => void }) {
  const write = useMasterWrite((v: CoachEditValues) => saveCoach({ programId, id: coach ? Number(coach.id) : undefined }, v, record.coaches))
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CoachEditValues>({
    resolver: zodResolver(coachEditSchema),
    defaultValues: {
      fullName: str(coach?.full_name),
      title: (str(coach?.title) || 'assistant') as CoachEditValues['title'],
      email: str(coach?.email),
      phone: str(coach?.phone),
      staffPageUrl: str(coach?.staff_page_url),
      recruitsNote: str(coach?.recruits_note),
      employmentStatus: (str(coach?.employment_status) || 'current') as CoachEditValues['employmentStatus'],
      isPrimary: coach?.is_primary_recruiting_contact === true,
    },
  })
  return (
    <form
      noValidate
      aria-label={coach ? 'Edit coach' : 'Add a coach'}
      onSubmit={handleSubmit((v) => write.run(v).then(onDone, () => undefined))}
      className="flex flex-col gap-3 rounded border border-slate-300 bg-white p-3"
    >
      <h3 className="font-semibold">{coach ? 'Edit this coach' : 'Add a coach'}</h3>
      <Field label="Name" error={errors.fullName?.message} {...register('fullName')} />
      <SelectField label="Role" options={COACH_TITLE_OPTIONS} error={errors.title?.message} {...register('title')} />
      <Field label="Email" type="email" error={errors.email?.message} {...register('email')} />
      <Field label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
      <Field label="Staff page" type="url" error={errors.staffPageUrl?.message} {...register('staffPageUrl')} />
      <Field label="Note" hint="For example: prefers a text first." error={errors.recruitsNote?.message} {...register('recruitsNote')} />
      <SelectField label="Still at the program?" options={EMPLOYMENT_OPTIONS} error={errors.employmentStatus?.message} {...register('employmentStatus')} />
      <CheckboxField label="Main recruiting contact" error={errors.isPrimary?.message} {...register('isPrimary')} />
      {write.error && <Message kind="error">{write.error}</Message>}
      <Button type="submit" disabled={write.pending}>
        {write.pending ? 'Saving…' : 'Save coach'}
      </Button>
      <SecondaryButton type="button" onClick={onDone}>
        Cancel
      </SecondaryButton>
    </form>
  )
}

/** D4: coordinators correct the shared college data. Shown on the college page to staff and admin only. */
export default function StaffCollegeTools({ programId }: { programId: number }) {
  const master = useMasterRecord(programId)
  const [editing, setEditing] = useState<'facts' | 'new' | number | null>(null)
  const verify = useMasterWrite(() => markVerified(programId))

  if (master.isPending) {
    return (
      <p role="status" className="text-slate-600">
        Loading staff tools…
      </p>
    )
  }
  if (master.isError || !master.data) {
    return <Message kind="error">We could not load the staff tools for this college.</Message>
  }
  const record = master.data
  const verifiedOn = str(record.program.last_verified_on)

  return (
    <section aria-labelledby="staff-tools" className="flex flex-col gap-3 rounded border-2 border-slate-300 p-3">
      <h2 id="staff-tools" className="text-lg font-semibold">
        Staff tools
      </h2>
      <p className="text-sm text-slate-600">
        Verified {verifiedOn ? formatDate(verifiedOn) : 'never'}
        {record.verifiedByName && ` by ${record.verifiedByName}`}.
      </p>
      {verify.error && <Message kind="error">{verify.error}</Message>}
      {verify.saved && !verify.error && <Message kind="info">Marked as verified today.</Message>}
      <div className="flex flex-wrap gap-2">
        <OutlineButton type="button" onClick={() => setEditing('facts')}>
          Edit college information
        </OutlineButton>
        <SecondaryButton type="button" disabled={verify.pending} onClick={() => void verify.run(undefined).catch(() => undefined)}>
          Mark as verified today
        </SecondaryButton>
      </div>
      {editing === 'facts' && <FactsForm record={record} programId={programId} onDone={() => setEditing(null)} />}

      <h3 className="font-semibold">Coaches (shared records)</h3>
      {record.coaches.length === 0 && <p className="text-sm text-slate-600">No coaches are listed yet.</p>}
      <ul aria-label="Shared coaches" className="flex flex-col gap-2">
        {record.coaches.map((c) =>
          editing === Number(c.id) ? (
            <li key={String(c.id)}>
              <CoachForm record={record} programId={programId} coach={c} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={String(c.id)} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-300 bg-white p-3">
              <span>
                <span className="font-medium">{str(c.full_name)}</span>
                <span className="block text-sm text-slate-600">
                  {coachTitleLabel(c.title)}
                  {c.is_primary_recruiting_contact === true && ' · Main recruiting contact'}
                  {c.employment_status === 'departed' && ' · Left the program'}
                </span>
              </span>
              <SecondaryButton type="button" className="min-h-9 px-3 text-sm" aria-label={`Edit ${str(c.full_name)}`} onClick={() => setEditing(Number(c.id))}>
                Edit
              </SecondaryButton>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <CoachForm record={record} programId={programId} onDone={() => setEditing(null)} />
      ) : (
        <OutlineButton type="button" onClick={() => setEditing('new')}>
          Add a coach
        </OutlineButton>
      )}
    </section>
  )
}
