import { clubToday } from './dates'
import { client, ok, type Row } from './dbClient'
import { blankToNull } from './forms'
import type { CoachEditValues, CollegeEditValues } from './masterSchemas'

/** The source label written on a record a coordinator typed in. */
export const STAFF_SOURCE = 'Club staff edit'

export type MasterRecord = {
  program: Row
  college: Row
  /** Shared coach records only, former coaches included. Athletes' private contacts are not part of the master data. */
  coaches: Row[]
  /** Who last verified the program record, as a name; empty when unknown or when the load script did it. */
  verifiedByName: string
}

export async function fetchMasterRecord(programId: number): Promise<MasterRecord | null> {
  const sb = client()
  const program = ok<Row | null>(await sb.from('college_program').select('*').eq('id', programId).maybeSingle())
  if (!program) return null
  const [college, coaches] = await Promise.all([
    sb.from('college').select('*').eq('unitid', program.unitid).maybeSingle(),
    sb.from('college_coach').select('*').eq('program_id', programId).is('owner_athlete_id', null).order('id'),
  ])
  let verifiedByName = ''
  if (program.verified_by) {
    const who = ok<Row | null>(await sb.from('staff_profile').select('first_name, last_name').eq('user_id', program.verified_by).maybeSingle())
    if (who) verifiedByName = `${String(who.first_name)} ${String(who.last_name)}`.trim()
  }
  return { program, college: ok<Row | null>(college) ?? {}, coaches: ok<Row[]>(coaches), verifiedByName }
}

/**
 * Saves the program and the college. The program row is always written so the database stamps who verified the
 * record and when, even when only the college facts changed.
 */
export async function saveCollegeFacts(programId: number, unitid: number, v: CollegeEditValues): Promise<void> {
  const sb = client()
  ok(
    await sb
      .from('college')
      .update({ website_url: blankToNull(v.websiteUrl), cost_url: blankToNull(v.costUrl) })
      .eq('unitid', unitid),
  )
  ok(
    await sb
      .from('college_program')
      .update({
        program_url: blankToNull(v.programUrl),
        questionnaire_url: blankToNull(v.questionnaireUrl),
        camps_url: blankToNull(v.campsUrl),
        instagram_url: blankToNull(v.instagramUrl),
        x_url: blankToNull(v.xUrl),
        last_season_record: blankToNull(v.lastSeasonRecord),
        status: v.status,
        last_verified_on: clubToday(),
      })
      .eq('id', programId),
  )
}

/** "I checked this record and it is right": only the verification stamp changes. */
export async function markVerified(programId: number): Promise<void> {
  ok(await (client().from('college_program').update({ last_verified_on: clubToday() }).eq('id', programId)))
}

/**
 * Adds or changes a shared coach. Only one coach per program can be the main recruiting contact, so the old one is
 * cleared first; if the save then fails, the old one is put back.
 */
export async function saveCoach(target: { programId: number; id?: number }, v: CoachEditValues, others: Row[]): Promise<void> {
  const sb = client()
  const wantsPrimary = v.isPrimary && v.employmentStatus !== 'departed'
  const previous = wantsPrimary ? others.find((c) => c.is_primary_recruiting_contact === true && c.id !== target.id) : undefined
  if (previous) {
    ok(await sb.from('college_coach').update({ is_primary_recruiting_contact: false }).eq('id', previous.id))
  }
  const fields = {
    full_name: v.fullName.trim(),
    title: v.title,
    email: blankToNull(v.email),
    phone: blankToNull(v.phone),
    staff_page_url: blankToNull(v.staffPageUrl),
    recruits_note: blankToNull(v.recruitsNote),
    employment_status: v.employmentStatus,
    is_primary_recruiting_contact: wantsPrimary,
    last_verified_on: clubToday(),
  }
  try {
    if (target.id !== undefined) {
      ok(await sb.from('college_coach').update(fields).eq('id', target.id))
    } else {
      ok(await sb.from('college_coach').insert({ ...fields, program_id: target.programId, owner_athlete_id: null, source: STAFF_SOURCE }))
    }
  } catch (error) {
    if (previous) await sb.from('college_coach').update({ is_primary_recruiting_contact: true }).eq('id', previous.id)
    throw error
  }
}
