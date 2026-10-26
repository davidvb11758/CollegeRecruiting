import { applyFilters, countActive, EMPTY_FILTERS, filtersToParams, likeEscape, parseFilters, type Filters, type QueryChain } from './findFilters'

/** A query that records the calls instead of running them. */
function recorder() {
  const calls: string[] = []
  const q: QueryChain = {
    eq: (c, v) => (calls.push(`eq ${c} ${v}`), q),
    ilike: (c, p) => (calls.push(`ilike ${c} ${p}`), q),
    in: (c, v) => (calls.push(`in ${c} ${v.join('|')}`), q),
    contains: (c, v) => (calls.push(`contains ${c} ${v.join('|')}`), q),
    order: (c, o) => (calls.push(`order ${c}${o?.nullsFirst === false ? ' nullslast' : ''}`), q),
    range: () => Promise.resolve({ data: [], error: null, count: 0 }),
  }
  return { q, calls }
}

const full: Filters = {
  q: '50% off_college',
  divisions: ['NCAA_D3', 'NAIA'],
  states: ['IA', 'MN'],
  conference: 'Big Ten',
  control: ['public', 'private'],
  bands: ['1', '6'],
  sizes: ['small'],
  settings: ['urban', 'rural'],
  selectivity: ['open'],
  major: 'BUSN',
  sort: 'level',
}

describe('filters in the page address', () => {
  it('round-trips every filter', () => {
    expect(parseFilters(filtersToParams(full))).toEqual(full)
  })
  it('leaves out anything at its default', () => {
    expect(filtersToParams(EMPTY_FILTERS).toString()).toBe('')
    expect(filtersToParams({ ...EMPTY_FILTERS, sort: 'name' }).has('sort')).toBe(false)
  })
  it('drops values it does not know, so a hand-edited link cannot break the page', () => {
    const parsed = parseFilters(new URLSearchParams('band=1,9,x&size=huge,small&state=IA,Iowa,mn&sort=random&control=public,evil'))
    expect(parsed.bands).toEqual(['1'])
    expect(parsed.sizes).toEqual(['small'])
    expect(parsed.states).toEqual(['IA'])
    expect(parsed.control).toEqual(['public'])
    expect(parsed.sort).toBe('name')
  })
  it('counts filter groups, not search or sort', () => {
    expect(countActive(EMPTY_FILTERS)).toBe(0)
    expect(countActive({ ...EMPTY_FILTERS, q: 'x', sort: 'state' })).toBe(0)
    expect(countActive(full)).toBe(9)
  })
})

describe('filters as database predicates', () => {
  it('always limits to active programs and ends on a stable tie-break', () => {
    const { q, calls } = recorder()
    applyFilters(q, EMPTY_FILTERS)
    expect(calls).toEqual(['eq status active', 'order college_name', 'order program_id'])
  })

  it('builds every predicate the SQL tests check', () => {
    const { q, calls } = recorder()
    applyFilters(q, full)
    expect(calls).toEqual([
      'eq status active',
      'ilike college_name %50\\% off\\_college%',
      'in division_code NCAA_D3|NAIA',
      'in state IA|MN',
      'eq conference Big Ten',
      'in control public|private_nonprofit|private_for_profit',
      'in competitiveness_band 1|6',
      'in size_band small',
      'in campus_setting urban|rural',
      'in selectivity open',
      'contains major_codes BUSN',
      'order division_sort',
      'order division_rank nullslast',
      'order program_id',
    ])
  })

  it('maps "private" to both private kinds and "public" to public only', () => {
    const only = (control: string[]) => {
      const { q, calls } = recorder()
      applyFilters(q, { ...EMPTY_FILTERS, control })
      return calls.find((c) => c.startsWith('in control'))
    }
    expect(only(['public'])).toBe('in control public')
    expect(only(['private'])).toBe('in control private_nonprofit|private_for_profit')
  })

  it('escapes characters that mean something in a LIKE pattern', () => {
    expect(likeEscape('a%b_c\\d')).toBe('a\\%b\\_c\\\\d')
  })

  it('ignores a search of only spaces', () => {
    const { q, calls } = recorder()
    applyFilters(q, { ...EMPTY_FILTERS, q: '   ' })
    expect(calls.some((c) => c.startsWith('ilike'))).toBe(false)
  })
})
