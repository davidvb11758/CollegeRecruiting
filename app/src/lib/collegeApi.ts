import type { SupabaseClient } from '@supabase/supabase-js'
import { applyFilters, type Filters, type QueryChain } from './findFilters'
import type { Row } from './profileApi'
import { getSupabase } from './supabase'

export const PAGE_SIZE = 25

function client(): SupabaseClient {
  const supabase = getSupabase()
  if (!supabase) throw new Error('The app is not connected to a database')
  return supabase
}

function ok<T>(result: { data?: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

const SEARCH_COLUMNS =
  'program_id, unitid, college_name, program_name, city, state, division_code, division_label, conference, control, campus_setting, enrollment, size_band, selectivity, division_rank, competitiveness_band'

export type SearchPage = { rows: Row[]; count: number }

/** One page of results (page 0 is the first). The count is the number of programs matching all filters. */
export async function searchPrograms(filters: Filters, page: number): Promise<SearchPage> {
  const from = page * PAGE_SIZE
  // supabase-js's own query types are too deep for the compiler here, so the chain is typed by the few methods used.
  const base = client().from('program_search').select(SEARCH_COLUMNS, { count: 'exact' }) as unknown as QueryChain
  const result = await applyFilters(base, filters).range(from, from + PAGE_SIZE - 1)
  if (result.error) throw result.error
  return { rows: (result.data ?? []) as Row[], count: result.count ?? 0 }
}

export type ConferenceOption = { name: string; division_code: string }

export async function fetchConferences(): Promise<ConferenceOption[]> {
  const rows = ok<ConferenceOption[]>(await client().from('conference').select('name, division_code').order('name'))
  // A conference name can exist in two divisions; the filter works on the name, so list each name once.
  return [...new Map(rows.map((c) => [c.name, c])).values()]
}

export type CollegeDetail = {
  program: Row
  programExtra: Row
  college: Row
  coaches: Row[]
}

export async function fetchCollegeDetail(programId: number, athleteId: string | null): Promise<CollegeDetail | null> {
  const sb = client()
  const program = ok<Row | null>(await sb.from('program_search').select('*').eq('program_id', programId).maybeSingle())
  if (!program) return null
  const [programExtra, college, coaches] = await Promise.all([
    sb.from('college_program').select('camps_url, instagram_url, x_url, last_season_record, campus_label').eq('id', programId).maybeSingle(),
    sb.from('college').select('admit_rate, religious_affiliation, tuition_year, enrollment_term, zip').eq('unitid', program.unitid).maybeSingle(),
    sb.from('college_coach').select('*').eq('program_id', programId).order('id'),
  ])
  const mine = (c: Row) => c.owner_athlete_id == null || c.owner_athlete_id === athleteId
  return {
    program,
    programExtra: ok<Row | null>(programExtra) ?? {},
    college: ok<Row | null>(college) ?? {},
    // Staff can also read private contacts of their athletes; only the shared ones and this athlete's own belong here.
    coaches: ok<Row[]>(coaches).filter((c) => mine(c) && c.employment_status !== 'departed'),
  }
}

export type ListEntry = { id: string; program_id: number; archived_at: string | null }

export async function fetchListEntries(athleteId: string): Promise<ListEntry[]> {
  return ok<ListEntry[]>(await client().from('athlete_college').select('id, program_id, archived_at').eq('athlete_id', athleteId))
}

/** Adds a college to the athlete's list. The database enforces the 30-college limit and one entry per college. */
export async function addToList(athleteId: string, programId: number): Promise<void> {
  ok(await client().from('athlete_college').insert({ athlete_id: athleteId, program_id: programId }))
}

/** A college that was archived comes back to the list (the entry keeps its history). */
export async function restoreToList(entryId: string): Promise<void> {
  ok(await client().from('athlete_college').update({ archived_at: null }).eq('id', entryId))
}
