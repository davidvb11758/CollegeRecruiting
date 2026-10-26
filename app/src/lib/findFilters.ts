/** The Find Colleges filters, how they live in the page address, and how they become a database query. */

export type SortKey = 'name' | 'level' | 'state'

export type Filters = {
  q: string
  divisions: string[]
  states: string[]
  conference: string
  control: string[]
  bands: string[]
  sizes: string[]
  settings: string[]
  selectivity: string[]
  major: string
  sort: SortKey
}

export const EMPTY_FILTERS: Filters = {
  q: '',
  divisions: [],
  states: [],
  conference: '',
  control: [],
  bands: [],
  sizes: [],
  settings: [],
  selectivity: [],
  major: '',
  sort: 'name',
}

export const SORTS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name (A to Z)' },
  { value: 'level', label: 'Division, best ranked first' },
  { value: 'state', label: 'State' },
]

export const CONTROL_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
]
export const BAND_OPTIONS = [
  { value: '1', label: 'Level 1 (top 10%)' },
  { value: '2', label: 'Level 2' },
  { value: '3', label: 'Level 3' },
  { value: '4', label: 'Level 4' },
  { value: '5', label: 'Level 5' },
  { value: '6', label: 'Level 6 (lower half)' },
]
export const SIZE_OPTIONS = [
  { value: 'small', label: 'Small (under 3,000)' },
  { value: 'medium', label: 'Medium (3,000 to 9,999)' },
  { value: 'large', label: 'Large (10,000 or more)' },
]
export const SETTING_OPTIONS = [
  { value: 'urban', label: 'City' },
  { value: 'suburban', label: 'Suburb' },
  { value: 'rural', label: 'Rural' },
]
export const SELECTIVITY_OPTIONS = [
  { value: 'highly_selective', label: 'Highly selective' },
  { value: 'selective', label: 'Selective' },
  { value: 'moderately_selective', label: 'Moderately selective' },
  { value: 'open', label: 'Open admission' },
]

const PRIVATE_KINDS = ['private_nonprofit', 'private_for_profit']

const allowed = (options: { value: string }[]) => new Set(options.map((o) => o.value))
const ALLOWED = {
  control: allowed(CONTROL_OPTIONS),
  bands: allowed(BAND_OPTIONS),
  sizes: allowed(SIZE_OPTIONS),
  settings: allowed(SETTING_OPTIONS),
  selectivity: allowed(SELECTIVITY_OPTIONS),
  sort: allowed(SORTS),
}

const list = (params: URLSearchParams, key: string, ok?: Set<string>) =>
  (params.get(key) ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '' && (!ok || ok.has(v)))

/** Reads filters from the page address. Unknown values are dropped so a hand-edited link cannot break the page. */
export function parseFilters(params: URLSearchParams): Filters {
  const sort = params.get('sort') ?? ''
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    divisions: list(params, 'div'),
    states: list(params, 'state').filter((s) => /^[A-Z]{2}$/.test(s)),
    conference: params.get('conf') ?? '',
    control: list(params, 'control', ALLOWED.control),
    bands: list(params, 'band', ALLOWED.bands),
    sizes: list(params, 'size', ALLOWED.sizes),
    settings: list(params, 'setting', ALLOWED.settings),
    selectivity: list(params, 'sel', ALLOWED.selectivity),
    major: params.get('major') ?? '',
    sort: ALLOWED.sort.has(sort) ? (sort as SortKey) : 'name',
  }
}

/** The page address for a set of filters. Anything at its default is left out. */
export function filtersToParams(f: Filters): URLSearchParams {
  const params = new URLSearchParams()
  const set = (key: string, value: string) => value && params.set(key, value)
  set('q', f.q.trim())
  set('div', f.divisions.join(','))
  set('state', f.states.join(','))
  set('conf', f.conference)
  set('control', f.control.join(','))
  set('band', f.bands.join(','))
  set('size', f.sizes.join(','))
  set('setting', f.settings.join(','))
  set('sel', f.selectivity.join(','))
  set('major', f.major)
  if (f.sort !== 'name') params.set('sort', f.sort)
  return params
}

/** How many filter groups are in use (the search box and the sort are not counted). */
export function countActive(f: Filters): number {
  return [f.divisions, f.states, f.control, f.bands, f.sizes, f.settings, f.selectivity].filter((g) => g.length > 0).length + (f.conference ? 1 : 0) + (f.major ? 1 : 0)
}

/** The query methods the filters use. Both supabase-js and the test double provide them. */
type Orderable = { ascending?: boolean; nullsFirst?: boolean }
export type QueryChain = {
  eq(column: string, value: string): QueryChain
  ilike(column: string, pattern: string): QueryChain
  in(column: string, values: (string | number)[]): QueryChain
  contains(column: string, values: string[]): QueryChain
  order(column: string, options?: Orderable): QueryChain
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown; count: number | null }>
}

/** Escapes the characters that mean something inside a LIKE pattern. */
export const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Adds every active filter and the sort to a query on program_search. These are the predicates the SQL tests check. */
export function applyFilters(query: QueryChain, f: Filters): QueryChain {
  let q = query.eq('status', 'active')
  const name = f.q.trim()
  if (name) q = q.ilike('college_name', `%${likeEscape(name)}%`)
  if (f.divisions.length) q = q.in('division_code', f.divisions)
  if (f.states.length) q = q.in('state', f.states)
  if (f.conference) q = q.eq('conference', f.conference)
  if (f.control.length) {
    q = q.in('control', [...(f.control.includes('public') ? ['public'] : []), ...(f.control.includes('private') ? PRIVATE_KINDS : [])])
  }
  if (f.bands.length) q = q.in('competitiveness_band', f.bands.map(Number))
  if (f.sizes.length) q = q.in('size_band', f.sizes)
  if (f.settings.length) q = q.in('campus_setting', f.settings)
  if (f.selectivity.length) q = q.in('selectivity', f.selectivity)
  if (f.major) q = q.contains('major_codes', [f.major])

  if (f.sort === 'level') {
    q = q.order('division_sort').order('division_rank', { nullsFirst: false })
  } else if (f.sort === 'state') {
    q = q.order('state', { nullsFirst: false }).order('college_name')
  } else {
    q = q.order('college_name')
  }
  return q.order('program_id')
}
