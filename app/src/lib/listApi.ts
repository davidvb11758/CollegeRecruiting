import { addDays, clubToday } from './dates'
import { client, ok, type Row } from './dbClient'
import { blankToNull } from './forms'
import { ACTIVITY_FOR_STEP, SETTLED_STAGES } from './listLabels'
import type { ActivityValues, CoachContactValues, NextStepValues, OverviewValues } from './listSchemas'

export type { Row }

// ---------------------------------------------------------------------------------------------
// My List and the college page
// ---------------------------------------------------------------------------------------------

/** Every list entry for the athlete (archived ones included; the screen filters), from the my_list view. */
export async function fetchMyList(athleteId: string): Promise<Row[]> {
  return ok<Row[]>(await client().from('my_list').select('*').eq('athlete_id', athleteId))
}

export type ListHub = {
  /** the athlete_college row: notes, why I like it, coach, questionnaire */
  entry: Row
  /** the my_list row: college name, last activity, current next step */
  summary: Row
  /** coaches of this program the athlete may see (shared, plus their own) */
  coaches: Row[]
}

export async function fetchListHub(listId: string, athleteId: string): Promise<ListHub | null> {
  const sb = client()
  const [entry, summary] = await Promise.all([
    sb.from('athlete_college').select('*').eq('id', listId).maybeSingle(),
    sb.from('my_list').select('*').eq('list_id', listId).maybeSingle(),
  ])
  const e = ok<Row | null>(entry)
  const s = ok<Row | null>(summary)
  if (!e || !s) return null
  const coaches = ok<Row[]>(await sb.from('college_coach').select('*').eq('program_id', e.program_id).order('id'))
  return {
    entry: e,
    summary: s,
    coaches: coaches.filter((c) => (c.owner_athlete_id == null || c.owner_athlete_id === athleteId) && c.employment_status !== 'departed'),
  }
}

export async function saveOverview(listId: string, v: OverviewValues, existing: Row): Promise<void> {
  ok(
    await client()
      .from('athlete_college')
      .update({
        priority: Number(v.priority),
        stage: v.stage,
        closed_reason: v.stage === 'closed' ? v.closedReason : null,
        main_coach_id: v.mainCoachId === '' ? null : Number(v.mainCoachId),
        why_i_like_text: blankToNull(v.whyILikeText),
        notes_text: blankToNull(v.notesText),
        // ticking records today; leaving it ticked keeps the original date
        questionnaire_completed_on: v.questionnaireDone ? (existing.questionnaire_completed_on ?? clubToday()) : null,
      })
      .eq('id', listId),
  )
}

export async function setMainCoach(listId: string, coachId: number | null): Promise<void> {
  ok(await client().from('athlete_college').update({ main_coach_id: coachId }).eq('id', listId))
}

/** Removing a college archives it. History stays, and the athlete can restore it. */
export async function archiveEntry(listId: string): Promise<void> {
  ok(await client().from('athlete_college').update({ archived_at: new Date().toISOString() }).eq('id', listId))
}

export async function restoreEntry(listId: string): Promise<void> {
  ok(await client().from('athlete_college').update({ archived_at: null }).eq('id', listId))
}

// ---------------------------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------------------------

/** The timeline for one college, newest first. Deleted entries are hidden; system entries are included. */
export async function fetchActivity(listId: string): Promise<Row[]> {
  const rows = ok<Row[]>(await client().from('activity_entry').select('*').eq('athlete_college_id', listId).is('deleted_at', null))
  return rows.sort(
    (a, b) => String(b.activity_date).localeCompare(String(a.activity_date)) || String(b.created_at).localeCompare(String(a.created_at)),
  )
}

export async function saveActivity(ctx: { athleteId: string; listId: string; id?: string }, v: ActivityValues): Promise<void> {
  const row = {
    activity_date: v.activityDate,
    activity_type_code: v.activityTypeCode,
    direction: blankToNull(v.direction),
    coach_ids: v.coachIds.map(Number),
    coach_name_text: v.coachIds.length === 0 ? blankToNull(v.coachNameText) : null,
    summary: v.summary.trim(),
    details_text: blankToNull(v.detailsText),
    outcome: blankToNull(v.outcome),
    follow_up_needed: v.followUpNeeded,
  }
  const sb = client()
  if (ctx.id) ok(await sb.from('activity_entry').update(row).eq('id', ctx.id))
  else ok(await sb.from('activity_entry').insert({ athlete_id: ctx.athleteId, athlete_college_id: ctx.listId, ...row }))
}

/** Entries are never removed; a delete hides them and keeps them in the change history. */
export async function deleteActivity(id: string): Promise<void> {
  ok(await client().from('activity_entry').update({ deleted_at: new Date().toISOString() }).eq('id', id))
}

// ---------------------------------------------------------------------------------------------
// Next steps (one open step per college)
// ---------------------------------------------------------------------------------------------

export async function fetchNextSteps(listId: string): Promise<Row[]> {
  const rows = ok<Row[]>(await client().from('next_step').select('*').eq('athlete_college_id', listId))
  return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

export async function saveNextStep(ctx: { athleteId: string; listId: string; id?: string }, v: NextStepValues): Promise<void> {
  const row = { description: v.description.trim(), due_date: v.dueDate, step_type_code: blankToNull(v.stepTypeCode) }
  const sb = client()
  if (ctx.id) ok(await sb.from('next_step').update(row).eq('id', ctx.id))
  else ok(await sb.from('next_step').insert({ athlete_id: ctx.athleteId, athlete_college_id: ctx.listId, ...row }))
}

export async function finishNextStep(id: string, status: 'done' | 'skipped'): Promise<void> {
  ok(await client().from('next_step').update({ status }).eq('id', id))
}

/** What "Log it?" starts from after a step is marked done. */
export function logFromStep(step: Row): Partial<ActivityValues> {
  return {
    activityTypeCode: ACTIVITY_FOR_STEP[String(step.step_type_code ?? '')] ?? 'other_note',
    summary: String(step.description ?? '').slice(0, 200),
  }
}

// ---------------------------------------------------------------------------------------------
// Contacts: the athlete's own coach records
// ---------------------------------------------------------------------------------------------

export async function saveOwnCoach(ctx: { athleteId: string; programId: number; id?: number }, v: CoachContactValues): Promise<void> {
  const row = {
    full_name: v.fullName.trim(),
    title: v.title,
    email: blankToNull(v.email),
    phone: blankToNull(v.phone),
    recruits_note: blankToNull(v.note),
  }
  const sb = client()
  if (ctx.id) ok(await sb.from('college_coach').update(row).eq('id', ctx.id))
  else ok(await sb.from('college_coach').insert({ program_id: ctx.programId, owner_athlete_id: ctx.athleteId, ...row }))
}

export async function deleteOwnCoach(id: number): Promise<void> {
  ok(await client().from('college_coach').delete().eq('id', id))
}

// ---------------------------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------------------------

export type HomeData = {
  /** open next steps, soonest first, with college name and bucket (overdue / this_week / later) */
  steps: Row[]
  /** colleges still being pursued that have been quiet for at least `silentDays` */
  silent: Row[]
  silentDays: number
  /** newest real (non-system) activity, with college names filled in */
  recent: Row[]
  /** staff names by user id, for "Added by Coach X" */
  staffNames: Record<string, string>
}

export async function fetchHome(athleteId: string): Promise<HomeData> {
  const sb = client()
  const [steps, list, settings, activity] = await Promise.all([
    sb.from('next_steps_due').select('*').eq('athlete_id', athleteId),
    sb.from('my_list').select('*').eq('athlete_id', athleteId).is('archived_at', null),
    sb.from('app_setting').select('key, value').eq('key', 'silent_days').maybeSingle(),
    sb.from('activity_entry').select('*').eq('athlete_id', athleteId).is('deleted_at', null).neq('source', 'system'),
  ])
  const setting = ok<Row | null>(settings)
  const silentDays = Number(setting?.value) > 0 ? Number(setting?.value) : 21
  const entries = ok<Row[]>(list)
  const nameOf = new Map(entries.map((e) => [String(e.list_id), String(e.college_name)]))
  const recent = ok<Row[]>(activity)
    .sort((a, b) => String(b.activity_date).localeCompare(String(a.activity_date)) || String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 8)
    .map((a): Row => ({ ...a, college_name: nameOf.get(String(a.athlete_college_id)) ?? '' }))

  const staffIds = [...new Set(recent.filter((a) => a.source === 'staff' && a.entered_by).map((a) => String(a.entered_by)))]
  const staffNames: Record<string, string> = {}
  if (staffIds.length) {
    for (const s of ok<Row[]>(await sb.from('staff_profile').select('user_id, first_name, last_name').in('user_id', staffIds))) {
      staffNames[String(s.user_id)] = `${s.first_name} ${s.last_name}`.trim()
    }
  }
  return {
    steps: ok<Row[]>(steps).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))),
    silent: entries
      .filter((e) => !SETTLED_STAGES.includes(String(e.stage)) && Number(e.days_silent) >= silentDays)
      .sort((a, b) => Number(b.days_silent) - Number(a.days_silent)),
    silentDays,
    recent,
    staffNames,
  }
}

/** A sensible due date for a new next step (a week out), in the club's day. */
export const defaultDueDate = (days = 7) => addDays(clubToday(), days)

// ---------------------------------------------------------------------------------------------
// Pick-lists
// ---------------------------------------------------------------------------------------------

export type ActivityTypeOption = { code: string; label: string; requires_direction: boolean; user_selectable: boolean }
export type StepTypeOption = { code: string; label: string; suggested_text: string | null }

export async function fetchActivityTypes(): Promise<ActivityTypeOption[]> {
  return ok<ActivityTypeOption[]>(await client().from('activity_type').select('code, label, requires_direction, user_selectable').order('sort_order'))
}

export async function fetchStepTypes(): Promise<StepTypeOption[]> {
  return ok<StepTypeOption[]>(await client().from('next_step_type').select('code, label, suggested_text').order('sort_order'))
}
