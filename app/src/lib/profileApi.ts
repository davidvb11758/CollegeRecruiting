import type { SupabaseClient } from '@supabase/supabase-js'
import { blankToNull, numOrNull, todayString } from './forms'
import type {
  AcademicValues,
  AthleticValues,
  CreateProfileValues,
  HighlightsValues,
  PersonalValues,
  PreferencesValues,
} from './profileSchemas'
import { getSupabase } from './supabase'

export type Row = Record<string, unknown>

export type ProfileBundle = {
  athlete: Row
  athletic: Row | null
  academic: Row | null
  preference: Row | null
  guardians: Row[]
  videos: Row[]
  majors: Row[]
  divisions: Row[]
  completeness: { filled: number; total: number; pct: number } | null
}

export type Lookups = {
  positions: { code: string; label: string }[]
  states: { code: string; name: string }[]
  majors: { code: string; label: string }[]
  divisions: { code: string; label: string }[]
  teams: { id: string; name: string }[]
}

function client(): SupabaseClient {
  const supabase = getSupabase()
  if (!supabase) throw new Error('The app is not connected to a database')
  return supabase
}

/** supabase-js returns errors instead of throwing them; this makes every failure stop the save. */
function ok<T>(result: { data?: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

export async function fetchLookups(): Promise<Lookups> {
  const sb = client()
  const [positions, states, majors, divisions, teams] = await Promise.all([
    sb.from('player_position').select('code, label').order('sort_order'),
    sb.from('state').select('code, name').order('sort_order'),
    sb.from('major_category').select('code, label').order('sort_order'),
    sb.from('division').select('code, label').order('sort_order'),
    sb.from('team').select('id, name').order('name'),
  ])
  return {
    positions: ok(positions),
    states: ok(states),
    majors: ok(majors),
    divisions: ok(divisions),
    teams: ok(teams),
  }
}

export async function fetchProfile(athleteId: string): Promise<ProfileBundle> {
  const sb = client()
  const [athlete, athletic, academic, preference, guardians, videos, majors, divisions, completeness] = await Promise.all([
    sb.from('athlete').select('*').eq('id', athleteId).maybeSingle(),
    sb.from('athlete_athletic').select('*').eq('athlete_id', athleteId).maybeSingle(),
    sb.from('athlete_academic').select('*').eq('athlete_id', athleteId).maybeSingle(),
    sb.from('athlete_preference').select('*').eq('athlete_id', athleteId).maybeSingle(),
    sb.from('athlete_guardian').select('*').eq('athlete_id', athleteId).order('created_at'),
    sb.from('athlete_video_link').select('*').eq('athlete_id', athleteId).order('sort_order'),
    sb.from('athlete_major').select('*').eq('athlete_id', athleteId),
    sb.from('athlete_target_division').select('*').eq('athlete_id', athleteId),
    sb.from('athlete_completeness').select('filled, total, pct').eq('athlete_id', athleteId).maybeSingle(),
  ])
  const base = ok<Row | null>(athlete)
  if (!base) throw new Error('Athlete not found')
  return {
    athlete: base,
    athletic: ok<Row | null>(athletic),
    academic: ok<Row | null>(academic),
    preference: ok<Row | null>(preference),
    guardians: ok<Row[]>(guardians),
    videos: ok<Row[]>(videos),
    majors: ok<Row[]>(majors),
    divisions: ok<Row[]>(divisions),
    completeness: ok(completeness) as ProfileBundle['completeness'],
  }
}

/** First login. No `.select()` on purpose: the new row is only readable once the insert has finished. */
export async function createAthlete(userId: string, v: CreateProfileValues): Promise<void> {
  ok(
    await client().from('athlete').insert({
      user_id: userId,
      team_id: v.teamId,
      first_name: v.firstName.trim(),
      last_name: v.lastName.trim(),
      date_of_birth: v.dateOfBirth,
      graduation_year: Number(v.graduationYear),
      home_state: v.homeState,
    }),
  )
}

export async function savePersonal(athleteId: string, v: PersonalValues, existingGuardians: Row[]): Promise<void> {
  const sb = client()
  ok(
    await sb
      .from('athlete')
      .update({
        first_name: v.firstName.trim(),
        last_name: v.lastName.trim(),
        preferred_name: blankToNull(v.preferredName),
        date_of_birth: v.dateOfBirth,
        graduation_year: Number(v.graduationYear),
        home_city: blankToNull(v.homeCity),
        home_state: v.homeState,
        home_zip: blankToNull(v.homeZip),
        athlete_email: blankToNull(v.athleteEmail),
        athlete_phone: blankToNull(v.athletePhone),
        preferred_contact: blankToNull(v.preferredContact),
        jersey_number: blankToNull(v.jerseyNumber),
      })
      .eq('id', athleteId),
  )

  // Only one guardian can be the main contact at a time, so the order matters:
  // delete removed rows, demote, promote, then add new rows.
  const primary = v.guardians.length ? Number(v.primaryGuardian) : -1
  const rowOf = (g: PersonalValues['guardians'][number], index: number) => ({
    relationship: g.relationship,
    full_name: g.fullName.trim(),
    email: blankToNull(g.email),
    phone: blankToNull(g.phone),
    ok_to_share: g.okToShare,
    is_primary: index === primary,
  })
  const keptIds = new Set(v.guardians.map((g) => g.id).filter(Boolean))
  const removed = existingGuardians.map((g) => String(g.id)).filter((id) => !keptIds.has(id))
  if (removed.length) ok(await sb.from('athlete_guardian').delete().in('id', removed))
  const kept = v.guardians.map((g, i) => ({ g, i })).filter(({ g }) => g.id)
  for (const { g, i } of kept.filter(({ i }) => i !== primary)) {
    ok(await sb.from('athlete_guardian').update(rowOf(g, i)).eq('id', g.id))
  }
  for (const { g, i } of kept.filter(({ i }) => i === primary)) {
    ok(await sb.from('athlete_guardian').update(rowOf(g, i)).eq('id', g.id))
  }
  const added = v.guardians.map((g, i) => ({ g, i })).filter(({ g }) => !g.id)
  if (added.length) {
    ok(await sb.from('athlete_guardian').insert(added.map(({ g, i }) => ({ athlete_id: athleteId, ...rowOf(g, i) }))))
  }
}

export async function saveAthletic(athleteId: string, v: AthleticValues): Promise<void> {
  ok(
    await client()
      .from('athlete_athletic')
      .upsert(
        {
          athlete_id: athleteId,
          primary_position: v.primaryPosition,
          secondary_position: blankToNull(v.secondaryPosition),
          height_in: numOrNull(v.heightIn),
          standing_reach_in: numOrNull(v.standingReachIn),
          approach_touch_in: numOrNull(v.approachTouchIn),
          block_touch_in: numOrNull(v.blockTouchIn),
          dominant_hand: blankToNull(v.dominantHand),
          club_team_name: blankToNull(v.clubTeamName),
          club_coach_name: blankToNull(v.clubCoachName),
          club_coach_email: blankToNull(v.clubCoachEmail),
          club_coach_phone: blankToNull(v.clubCoachPhone),
          hs_coach_name: blankToNull(v.hsCoachName),
          hs_coach_email: blankToNull(v.hsCoachEmail),
          awards_text: blankToNull(v.awardsText),
          stats_summary_text: blankToNull(v.statsSummaryText),
          about_me_text: blankToNull(v.aboutMeText),
        },
        { onConflict: 'athlete_id' },
      ),
  )
}

/** Makes the stored majors of one kind equal the wanted list. Deletes first so the 3-major limit never trips. */
async function syncMajors(athleteId: string, kind: 'intended' | 'interest', existing: Row[], wanted: string[]): Promise<void> {
  const sb = client()
  const have = existing.filter((m) => m.kind === kind).map((m) => String(m.major_code))
  const removed = have.filter((c) => !wanted.includes(c))
  const added = wanted.filter((c) => !have.includes(c))
  if (removed.length) {
    ok(await sb.from('athlete_major').delete().eq('athlete_id', athleteId).eq('kind', kind).in('major_code', removed))
  }
  if (added.length) {
    ok(await sb.from('athlete_major').insert(added.map((major_code) => ({ athlete_id: athleteId, major_code, kind }))))
  }
}

export async function saveAcademic(athleteId: string, v: AcademicValues, existing: ProfileBundle): Promise<void> {
  const old = existing.academic
  const gpaChanged =
    numOrNull(v.gpaUnweighted) !== (old?.gpa_unweighted == null ? null : Number(old.gpa_unweighted)) ||
    numOrNull(v.gpaWeighted) !== (old?.gpa_weighted == null ? null : Number(old.gpa_weighted))
  const hasGpa = v.gpaUnweighted !== '' || v.gpaWeighted !== ''
  ok(
    await client()
      .from('athlete_academic')
      .upsert(
        {
          athlete_id: athleteId,
          hs_name: blankToNull(v.hsName),
          hs_city: blankToNull(v.hsCity),
          hs_state: blankToNull(v.hsState),
          gpa_unweighted: numOrNull(v.gpaUnweighted),
          gpa_weighted: numOrNull(v.gpaWeighted),
          gpa_updated_on: hasGpa ? (gpaChanged ? todayString() : (old?.gpa_updated_on ?? todayString())) : null,
          class_rank_text: blankToNull(v.classRankText),
          major_undecided: v.majorUndecided,
          act_composite: numOrNull(v.actComposite),
          planned_test_dates_text: blankToNull(v.plannedTestDatesText),
          ncaa_ec_status: blankToNull(v.ncaaEcStatus),
          naia_status: blankToNull(v.naiaStatus),
        },
        { onConflict: 'athlete_id' },
      ),
  )
  await syncMajors(athleteId, 'intended', existing.majors, v.intendedMajors)
}

export async function saveHighlights(athleteId: string, v: HighlightsValues, existing: ProfileBundle): Promise<void> {
  const sb = client()
  const keptIds = new Set(v.videos.map((x) => x.id).filter(Boolean))
  const removed = existing.videos.map((x) => String(x.id)).filter((id) => !keptIds.has(id))
  if (removed.length) ok(await sb.from('athlete_video_link').delete().in('id', removed))
  for (const [i, video] of v.videos.entries()) {
    const row = { label: video.label.trim(), url: video.url.trim(), sort_order: i }
    if (video.id) ok(await sb.from('athlete_video_link').update(row).eq('id', video.id))
    else ok(await sb.from('athlete_video_link').insert({ athlete_id: athleteId, ...row }))
  }
  // The links below live on the athletic record, which needs a main position first.
  if (existing.athletic) {
    ok(
      await sb
        .from('athlete_athletic')
        .update({
          instagram_handle: blankToNull(v.instagramHandle),
          tiktok_handle: blankToNull(v.tiktokHandle),
        })
        .eq('athlete_id', athleteId),
    )
  }
}

export async function savePreferences(athleteId: string, v: PreferencesValues, existing: ProfileBundle): Promise<void> {
  const sb = client()
  ok(
    await sb.from('athlete_preference').upsert(
      {
        athlete_id: athleteId,
        competitiveness_bands: v.bands.map(Number).sort((a, b) => a - b),
        playing_time_expectation: blankToNull(v.playingTime),
        preferred_regions: v.regions,
        school_sizes: v.schoolSizes,
        control_types: v.controlTypes,
        campus_settings: v.campusSettings,
        academic_importance: numOrNull(v.academicImportance),
        cost_need: blankToNull(v.costNeed),
        must_haves_text: blankToNull(v.mustHavesText),
        deal_breakers_text: blankToNull(v.dealBreakersText),
        ideal_school_text: blankToNull(v.idealSchoolText),
        last_reviewed_on: todayString(),
      },
      { onConflict: 'athlete_id' },
    ),
  )

  const have = existing.divisions.map((d) => String(d.division_code))
  const wanted = Object.entries(v.divisions).filter(([, interest]) => interest !== 'none')
  const removed = have.filter((code) => !wanted.some(([c]) => c === code))
  if (removed.length) {
    ok(await sb.from('athlete_target_division').delete().eq('athlete_id', athleteId).in('division_code', removed))
  }
  if (wanted.length) {
    ok(
      await sb
        .from('athlete_target_division')
        .upsert(wanted.map(([division_code, interest]) => ({ athlete_id: athleteId, division_code, interest })), {
          onConflict: 'athlete_id,division_code',
        }),
    )
  }
  await syncMajors(athleteId, 'interest', existing.majors, v.interestMajors)
}
