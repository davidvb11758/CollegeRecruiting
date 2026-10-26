import { render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from './App'
import { makeFakeSupabase, makeSession, type FakeWorld } from './test/fakeSupabase'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('./lib/supabase', () => ({ getSupabase: () => mocked.client }))

type Row = Record<string, unknown>

function program(n: number, extra: Row = {}): Row {
  return {
    program_id: n,
    unitid: 1000 + n,
    college_name: `College ${String(n).padStart(2, '0')}`,
    program_name: `College ${n}`,
    city: 'Testville',
    state: n % 2 ? 'IA' : 'MN',
    division_code: 'NCAA_D3',
    division_label: 'NCAA Division III',
    division_sort: 3,
    conference: null,
    control: n % 2 ? 'public' : 'private_nonprofit',
    campus_setting: 'suburban',
    enrollment: 2000,
    size_band: 'small',
    selectivity: 'selective',
    division_rank: n,
    competitiveness_band: 1,
    status: 'active',
    last_verified_on: '2026-10-01',
    major_codes: ['BUSN'],
    website_url: 'https://college.example.edu',
    ...extra,
  }
}

const seen = { search: '' }
function Spy() {
  const { search } = useLocation()
  useEffect(() => {
    seen.search = search
  }, [search])
  return null
}

function start(path: string, world: Partial<FakeWorld> = {}) {
  const fake = makeFakeSupabase({ session: makeSession(), ...world })
  mocked.client = fake.client
  render(
    <MemoryRouter initialEntries={[path]}>
      <Spy />
      <App />
    </MemoryRouter>,
  )
  return fake
}

const writes = (calls: ReturnType<typeof start>['calls'], table: string, mode?: string) => calls.filter((c) => c.table === table && (!mode || c.mode === mode))

const sample = [
  program(1, { college_name: 'Alpha University', state: 'IA', control: 'public', size_band: 'large', enrollment: 20000, competitiveness_band: 1, division_rank: 1, selectivity: 'selective', campus_setting: 'urban', major_codes: ['BUSN', 'COMP'], conference: 'Big Test' }),
  program(2, { college_name: 'Beta College', state: 'MN', control: 'private_nonprofit', size_band: 'small', enrollment: 1500, competitiveness_band: 3, division_rank: 20, selectivity: 'open', campus_setting: 'rural', major_codes: ['BUSN'] }),
  program(3, { college_name: 'Gamma State', state: 'IA', control: 'public', size_band: 'medium', enrollment: 6000, competitiveness_band: 6, division_rank: 90, division_code: 'NAIA', division_label: 'NAIA', division_sort: 4, selectivity: 'open', campus_setting: 'suburban', major_codes: ['HLTH'] }),
  program(4, { college_name: 'Delta Tech', state: 'MN', control: 'private_for_profit', size_band: 'medium', enrollment: 5000, competitiveness_band: null, division_rank: null, selectivity: null, campus_setting: null, major_codes: [] }),
  program(5, { college_name: 'Dropped College', status: 'program_dropped' }),
]

async function results() {
  await waitFor(() => expect(screen.queryByText('Searching…')).not.toBeInTheDocument())
  return within(screen.getByRole('list', { name: 'Results' }))
    .getAllByRole('listitem')
    .map((li) => within(li).getByRole('link').querySelector('span span, span')?.textContent ?? '')
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText(/program/)
  await user.click(screen.getByText(/^Filters/))
}

describe('Find Colleges: results', () => {
  it('lists active programs by name, hides dropped programs, and shows the count', async () => {
    start('/find', { tables: { program_search: sample } })
    expect(await screen.findByText('4 programs')).toBeInTheDocument()
    expect(await results()).toEqual(['Alpha University', 'Beta College', 'Delta Tech', 'Gamma State'])
  })

  it('shows the facts a family compares: place, division, size, setting, control and level', async () => {
    start('/find', { tables: { program_search: sample } })
    const card = (await screen.findByRole('link', { name: /Alpha University/ })).closest('a')!
    expect(card).toHaveTextContent('Testville, IA')
    expect(card).toHaveTextContent('NCAA Division III')
    expect(card).toHaveTextContent('Big Test')
    expect(card).toHaveTextContent('Large (20,000)')
    expect(card).toHaveTextContent('City')
    expect(card).toHaveTextContent('Public')
    expect(card).toHaveTextContent('Selective')
    expect(card).toHaveTextContent('Level 1 (top 10%)')
  })

  it('marks colleges already on My List', async () => {
    start('/find', {
      tables: {
        program_search: sample,
        athlete_college: [{ id: 'l1', athlete_id: 'athlete-1', program_id: 2, archived_at: null }, { id: 'l2', athlete_id: 'athlete-1', program_id: 3, archived_at: '2026-10-02' }],
      },
    })
    const beta = (await screen.findByRole('link', { name: /Beta College/ })).closest('a')!
    await waitFor(() => expect(beta).toHaveTextContent('On My List'))
    expect(screen.getByRole('link', { name: /Gamma State/ })).not.toHaveTextContent('On My List')
  })

  it('pages through results with Show more', async () => {
    const many = Array.from({ length: 30 }, (_, i) => program(i + 1))
    const user = userEvent.setup()
    start('/find', { tables: { program_search: many } })
    expect(await screen.findByText('30 programs')).toBeInTheDocument()
    expect(await results()).toHaveLength(25)
    await user.click(screen.getByRole('button', { name: 'Show more (25 of 30)' }))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Results' })).getAllByRole('listitem')).toHaveLength(30))
    expect(screen.queryByRole('button', { name: /Show more/ })).not.toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    start('/find?size=small&state=IA&band=6', { tables: { program_search: sample } })
    expect(await screen.findByText('No programs match.')).toBeInTheDocument()
    expect(screen.getByText(/Try removing a filter/)).toBeInTheDocument()
  })

  it('offers a retry when the search fails', async () => {
    const fake = start('/find', { tables: { program_search: sample }, failReads: { program_search: { message: 'boom', code: 'XX000' } } })
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load colleges')
    fake.world.failReads = {}
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('4 programs')).toBeInTheDocument()
  })
})

describe('Find Colleges: filters', () => {
  it('searches by part of the name, ignoring case, after a short pause', async () => {
    const user = userEvent.setup()
    start('/find', { tables: { program_search: sample } })
    await user.type(await screen.findByLabelText('Search by college name'), 'TECH')
    expect(await screen.findByText('1 program')).toBeInTheDocument()
    expect(await results()).toEqual(['Delta Tech'])
    expect(seen.search).toBe('?q=TECH')
  })

  it('treats % and _ in a search as plain characters', async () => {
    const user = userEvent.setup()
    start('/find', { tables: { program_search: sample } })
    await user.type(await screen.findByLabelText('Search by college name'), '%')
    expect(await screen.findByText('No programs match.')).toBeInTheDocument()
  })

  it.each([
    ['division', 'NAIA', ['Gamma State']],
    ['public or private: Private', 'Private', ['Beta College', 'Delta Tech']],
    ['public or private: Public', 'Public', ['Alpha University', 'Gamma State']],
    ['program level: Level 3', 'Level 3', ['Beta College']],
    ['school size: Small', 'Small (under 3,000)', ['Beta College']],
    ['school size: Medium', 'Medium (3,000 to 9,999)', ['Delta Tech', 'Gamma State']],
    ['campus setting: City', 'City', ['Alpha University']],
    ['admission: Open', 'Open admission', ['Beta College', 'Gamma State']],
  ])('filters by %s', async (_name, label, expected) => {
    const user = userEvent.setup()
    start('/find', { tables: { program_search: sample } })
    await open(user)
    await user.click(await screen.findByLabelText(label))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Results' })).getAllByRole('listitem')).toHaveLength(expected.length))
    expect(await results()).toEqual(expected)
  })

  it('filters by a major the college offers', async () => {
    const user = userEvent.setup()
    start('/find', { tables: { program_search: sample } })
    await open(user)
    await user.selectOptions(await screen.findByLabelText('Major offered'), 'BUSN')
    await waitFor(async () => expect(await results()).toEqual(['Alpha University', 'Beta College']))
  })

  it('filters by conference', async () => {
    const user = userEvent.setup()
    start('/find', { tables: { program_search: sample, conference: [{ name: 'Big Test', division_code: 'NCAA_D3' }] } })
    await open(user)
    await screen.findByText('Big Test', { selector: 'option' })
    await user.selectOptions(screen.getByLabelText('Conference'), 'Big Test')
    await waitFor(async () => expect(await results()).toEqual(['Alpha University']))
  })

  it('filters by one or more states, each removable', async () => {
    const user = userEvent.setup()
    start('/find', { tables: { program_search: sample } })
    await open(user)
    await user.selectOptions(await screen.findByLabelText('State'), 'IA')
    await waitFor(async () => expect(await results()).toEqual(['Alpha University', 'Gamma State']))
    await user.selectOptions(screen.getByLabelText('State'), 'MN')
    await waitFor(async () => expect((await results()).length).toBe(4))
    await user.click(screen.getByRole('button', { name: /Iowa/ }))
    await waitFor(async () => expect(await results()).toEqual(['Beta College', 'Delta Tech']))
  })

  it('combines filters with AND and shows how many are in use', async () => {
    const user = userEvent.setup()
    start('/find', { tables: { program_search: sample } })
    await open(user)
    await user.click(await screen.findByLabelText('Public'))
    await user.click(screen.getByLabelText('Open admission'))
    await waitFor(async () => expect(await results()).toEqual(['Gamma State']))
    expect(screen.getByText('Filters (2)')).toBeInTheDocument()
  })

  it('keeps the filters in the address and restores them when the page opens', async () => {
    start('/find?control=private&size=small', { tables: { program_search: sample } })
    expect(await screen.findByText('Filters (2)')).toBeInTheDocument()
    expect(await results()).toEqual(['Beta College'])
    expect(screen.getByLabelText('Private')).toBeChecked()
  })

  it('ignores a made-up value in the address', async () => {
    start('/find?size=giant&sort=banana', { tables: { program_search: sample } })
    expect(await screen.findByText('4 programs')).toBeInTheDocument()
  })

  it('clears everything', async () => {
    const user = userEvent.setup()
    start('/find?size=small', { tables: { program_search: sample } })
    await screen.findByText('1 program')
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(await screen.findByText('4 programs')).toBeInTheDocument()
    expect(seen.search).toBe('')
  })

  it('sorts by division, best ranked first, with unranked last', async () => {
    start('/find?sort=level', { tables: { program_search: sample } })
    await screen.findByText('4 programs')
    expect(await results()).toEqual(['Alpha University', 'Beta College', 'Delta Tech', 'Gamma State'])
  })

  it('applies the saved preferences with one tap', async () => {
    const user = userEvent.setup()
    start('/find', {
      tables: {
        program_search: sample,
        athlete_preference: [{ athlete_id: 'athlete-1', competitiveness_bands: [3, 6], school_sizes: ['small', 'medium'], control_types: [], campus_settings: [] }],
        athlete_target_division: [{ athlete_id: 'athlete-1', division_code: 'NCAA_D3', interest: 'top_choice' }, { athlete_id: 'athlete-1', division_code: 'NAIA', interest: 'open_to' }],
      },
    })
    await open(user)
    await user.click(await screen.findByRole('button', { name: 'Match my preferences' }))
    await waitFor(async () => expect(await results()).toEqual(['Beta College', 'Gamma State']))
    expect(seen.search).toContain('band=3%2C6')
  })

  it('does not offer preference matching to staff', async () => {
    const user = userEvent.setup()
    start('/staff/find', { appUser: { role: 'staff', display_name: 'Coach' }, athlete: null, tables: { program_search: sample } })
    await screen.findByText('4 programs')
    await user.click(screen.getByText(/^Filters/))
    expect(screen.queryByRole('button', { name: 'Match my preferences' })).not.toBeInTheDocument()
  })
})

describe('College detail', () => {
  const detailWorld = (extra: Record<string, Row[]> = {}): Partial<FakeWorld> => ({
    tables: {
      program_search: [
        program(1, {
          college_name: 'Alpha University',
          conference: 'Big Test',
          control: 'public',
          enrollment: 20000,
          size_band: 'large',
          campus_setting: 'urban',
          selectivity: 'selective',
          tuition_in_state: 9000,
          tuition_out_state: 27000,
          competitiveness_band: 2,
          division_rank: 14,
          program_url: 'https://alpha.example.edu/volleyball',
          questionnaire_url: 'https://alpha.example.edu/recruit',
          cost_url: 'https://alpha.example.edu/cost',
        }),
      ],
      college_program: [{ id: 1, camps_url: 'https://alpha.example.edu/camps', instagram_url: null, x_url: null, last_season_record: '20-10' }],
      college: [{ unitid: 1001, admit_rate: 0.64, religious_affiliation: null, tuition_year: '2024-25', enrollment_term: null, zip: '50309' }],
      college_coach: [
        { id: 1, program_id: 1, full_name: 'Casey Coach', title: 'head', email: 'casey@alpha.example.edu', phone: '515-555-0101', is_primary_recruiting_contact: false, employment_status: 'current', owner_athlete_id: null },
        { id: 2, program_id: 1, full_name: 'Robin Recruiter', title: 'recruiting_coordinator', email: 'robin@alpha.example.edu', phone: null, is_primary_recruiting_contact: true, employment_status: 'current', owner_athlete_id: null },
        { id: 3, program_id: 1, full_name: 'Former Coach', title: 'assistant', email: 'old@alpha.example.edu', employment_status: 'departed', owner_athlete_id: null },
        { id: 4, program_id: 1, full_name: 'Someone Elses Contact', title: 'assistant', email: 'x@alpha.example.edu', employment_status: 'current', owner_athlete_id: 'athlete-9' },
        { id: 5, program_id: 1, full_name: 'My Own Contact', title: 'assistant', email: 'mine@alpha.example.edu', employment_status: 'current', owner_athlete_id: 'athlete-1' },
      ],
      ...extra,
    },
  })

  it('opens from a result and shows the facts, links and last-verified line', async () => {
    const user = userEvent.setup()
    start('/find', detailWorld())
    await user.click(await screen.findByRole('link', { name: /Alpha University/ }))
    expect(await screen.findByRole('heading', { name: 'Alpha University' })).toBeInTheDocument()
    expect(screen.getByText('Public')).toBeInTheDocument()
    expect(screen.getByText('20,000 (large)')).toBeInTheDocument()
    expect(screen.getByText('Selective, 64% admitted')).toBeInTheDocument()
    expect(screen.getByText('$9,000 in-state, $27,000 out-of-state (2024-25)')).toBeInTheDocument()
    expect(screen.getByText('Level 2, ranked 14 in its division')).toBeInTheDocument()
    expect(screen.getByText('20-10')).toBeInTheDocument()
    const program = screen.getByRole('link', { name: 'Volleyball program page' })
    expect(program).toHaveAttribute('href', 'https://alpha.example.edu/volleyball')
    expect(program).toHaveAttribute('target', '_blank')
    expect(program).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByRole('link', { name: 'Recruiting questionnaire' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Camps' })).toBeInTheDocument()
    expect(screen.getByText(/Last verified 2026-10-01/)).toBeInTheDocument()
    expect(screen.queryByText(/correction/i)).not.toBeInTheDocument()
  })

  it('goes back to the same search', async () => {
    const user = userEvent.setup()
    start('/find?control=public', detailWorld())
    await user.click(await screen.findByRole('link', { name: /Alpha University/ }))
    await user.click(await screen.findByRole('link', { name: /Back to Find Colleges/ }))
    expect(await screen.findByText('Filters (1)')).toBeInTheDocument()
  })

  it('shows shared and own coaches, with the main contact marked, and hides former and other families\' contacts', async () => {
    start('/find/1', detailWorld())
    expect(await screen.findByText('Casey Coach')).toBeInTheDocument()
    expect(screen.getByText('Robin Recruiter')).toBeInTheDocument()
    expect(screen.getByText(/Recruiting coordinator · Main recruiting contact/)).toBeInTheDocument()
    expect(screen.getByText('My Own Contact')).toBeInTheDocument()
    expect(screen.getByText('(added by you)')).toBeInTheDocument()
    expect(screen.queryByText('Former Coach')).not.toBeInTheDocument()
    expect(screen.queryByText('Someone Elses Contact')).not.toBeInTheDocument()
  })

  it('makes email and phone tappable and copyable', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    start('/find/1', detailWorld())
    const email = await screen.findByRole('link', { name: 'casey@alpha.example.edu' })
    expect(email).toHaveAttribute('href', 'mailto:casey@alpha.example.edu')
    expect(screen.getByRole('link', { name: '515-555-0101' })).toHaveAttribute('href', 'tel:515-555-0101')
    await user.click(screen.getByRole('button', { name: 'Copy email for Casey Coach' }))
    expect(writeText).toHaveBeenCalledWith('casey@alpha.example.edu')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('says so when a program has no coach contacts', async () => {
    start('/find/1', detailWorld({ college_coach: [] }))
    expect(await screen.findByText(/No coach contacts are listed/)).toBeInTheDocument()
  })

  it('says a college was not found', async () => {
    start('/find/999', detailWorld())
    expect(await screen.findByText('That college was not found.')).toBeInTheDocument()
  })

  it('adds the college to My List, with the first-time tip', async () => {
    const user = userEvent.setup()
    const { calls } = start('/find/1', detailWorld())
    await user.click(await screen.findByRole('button', { name: 'Add to My List' }))
    expect(await screen.findByText('Added to My List.')).toBeInTheDocument()
    expect(screen.getByText(/start with 20 to 30 colleges/)).toBeInTheDocument()
    expect(writes(calls, 'athlete_college', 'insert')[0].payload).toEqual({ athlete_id: 'athlete-1', program_id: 1 })
  })

  it('skips the tip once the list has colleges', async () => {
    const user = userEvent.setup()
    start('/find/1', detailWorld({ athlete_college: [{ id: 'l9', athlete_id: 'athlete-1', program_id: 77, archived_at: null }] }))
    await user.click(await screen.findByRole('button', { name: 'Add to My List' }))
    expect(await screen.findByText('Added to My List.')).toBeInTheDocument()
    expect(screen.queryByText(/start with 20 to 30/)).not.toBeInTheDocument()
  })

  it('shows "On My List" instead of an add button when already added', async () => {
    start('/find/1', detailWorld({ athlete_college: [{ id: 'l1', athlete_id: 'athlete-1', program_id: 1, archived_at: null }] }))
    expect(await screen.findByText('On My List')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to My List' })).not.toBeInTheDocument()
  })

  it('restores an archived entry instead of adding a duplicate', async () => {
    const user = userEvent.setup()
    const { calls } = start('/find/1', detailWorld({ athlete_college: [{ id: 'l1', athlete_id: 'athlete-1', program_id: 1, archived_at: '2026-09-01' }] }))
    await user.click(await screen.findByRole('button', { name: 'Restore to My List' }))
    expect(await screen.findByText('Added to My List.')).toBeInTheDocument()
    expect(writes(calls, 'athlete_college', 'insert')).toHaveLength(0)
    expect(writes(calls, 'athlete_college', 'update')[0].payload).toEqual({ archived_at: null })
  })

  it('explains a full list', async () => {
    const user = userEvent.setup()
    start('/find/1', { ...detailWorld(), failWrites: { athlete_college: { message: 'The list is limited to 30 colleges. Archive one before adding another.', code: '23514' } } })
    await user.click(await screen.findByRole('button', { name: 'Add to My List' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your list is full (30 colleges)')
  })

  it('gives staff the facts but no add button, and no preferences', async () => {
    start('/staff/find/1', { ...detailWorld(), appUser: { role: 'staff', display_name: 'Coach' }, athlete: null })
    expect(await screen.findByRole('heading', { name: 'Alpha University' })).toBeInTheDocument()
    expect(screen.getByText(/open that athlete first/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /My List/ })).not.toBeInTheDocument()
    expect(screen.getByText('Casey Coach')).toBeInTheDocument()
    expect(screen.queryByText('My Own Contact')).not.toBeInTheDocument()
  })
})
