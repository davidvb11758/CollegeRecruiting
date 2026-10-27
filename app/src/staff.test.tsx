import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from './App'
import { ATHLETE_ROW, makeFakeSupabase, makeSession, type FakeWorld } from './test/fakeSupabase'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('./lib/supabase', () => ({ getSupabase: () => mocked.client }))

type Row = Record<string, unknown>

// Noon in Chicago on Tuesday Nov 10, 2026. Only Date is faked, so timers and waits behave normally.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10T18:00:00Z') })
})
afterEach(() => {
  vi.useRealTimers()
})

const seen = { path: '' }
function Spy() {
  const { pathname } = useLocation()
  useEffect(() => {
    seen.path = pathname
  }, [pathname])
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

const ATH = 'athlete-9'
const athleteRow: Row = { ...ATHLETE_ROW, id: ATH, user_id: 'user-9', first_name: 'Pat', last_name: 'Player' }

const rosterRows: Row[] = [
  { athlete_id: ATH, first_name: 'Pat', last_name: 'Player', team_name: 'Iowa Rockets 16R', graduation_year: 2029, profile_pct: 60, colleges_count: 3, last_activity_date: '2026-11-05', overdue_count: 2 },
  { athlete_id: 'athlete-8', first_name: 'Ann', last_name: 'Adams', team_name: 'Iowa Rockets 16R', graduation_year: 2028, profile_pct: 20, colleges_count: 0, last_activity_date: null, overdue_count: 0 },
  { athlete_id: 'athlete-7', first_name: 'Zoe', last_name: 'Zimmer', team_name: 'Iowa Rockets 16R', graduation_year: 2029, profile_pct: 95, colleges_count: 12, last_activity_date: '2026-11-09', overdue_count: 1 },
]

const staffWorld = (extra: Record<string, Row[]> = {}): Partial<FakeWorld> => ({
  appUser: { role: 'staff', display_name: 'Coach Kim' },
  athlete: null,
  tables: {
    staff_roster: rosterRows,
    athlete: [athleteRow],
    athlete_completeness: [{ athlete_id: ATH, filled: 9, total: 15, pct: 60 }],
    staff_profile: [{ user_id: 's1', first_name: 'Kim', last_name: 'Smith' }],
    app_setting: [{ key: 'silent_days', value: '21' }],
    ...extra,
  },
})

const names = () =>
  within(screen.getByRole('list', { name: 'Athletes' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('span')?.textContent ?? '')

describe('Roster', () => {
  it('lists each athlete with team, class, profile, colleges, overdue steps and last activity', async () => {
    start('/staff', staffWorld())
    expect(await screen.findByText('3 athletes · 3 overdue next steps')).toBeInTheDocument()
    expect(names()).toEqual(['Ann Adams', 'Pat Player', 'Zoe Zimmer'])
    const [ann, pat] = within(screen.getByRole('list', { name: 'Athletes' })).getAllByRole('listitem')
    expect(pat).toHaveTextContent('Iowa Rockets 16R · Class of 2029')
    expect(pat).toHaveTextContent('Profile 60%')
    expect(pat).toHaveTextContent('3 colleges')
    expect(pat).toHaveTextContent('2 overdue')
    expect(pat).toHaveTextContent('Last activity Nov 5 (5 days ago)')
    expect(ann).toHaveTextContent('0 colleges')
    expect(ann).toHaveTextContent('No activity yet')
    expect(ann).not.toHaveTextContent('overdue')
  })

  it('sorts by overdue steps, by quiet time and by profile', async () => {
    const user = userEvent.setup()
    start('/staff', staffWorld())
    await screen.findByRole('list', { name: 'Athletes' })
    await user.selectOptions(screen.getByLabelText('Sort by'), 'overdue')
    expect(names()).toEqual(['Pat Player', 'Zoe Zimmer', 'Ann Adams'])
    await user.selectOptions(screen.getByLabelText('Sort by'), 'quiet')
    expect(names()).toEqual(['Ann Adams', 'Pat Player', 'Zoe Zimmer'])
    await user.selectOptions(screen.getByLabelText('Sort by'), 'profile')
    expect(names()).toEqual(['Ann Adams', 'Pat Player', 'Zoe Zimmer'])
  })

  it('searches by the start of a name', async () => {
    const user = userEvent.setup()
    start('/staff', staffWorld())
    await user.type(await screen.findByLabelText('Search by name'), 'zo')
    expect(names()).toEqual(['Zoe Zimmer'])
    await user.clear(screen.getByLabelText('Search by name'))
    await user.type(screen.getByLabelText('Search by name'), 'nobody')
    expect(await screen.findByText('No athlete matches that name.')).toBeInTheDocument()
  })

  it('says so when no athlete is assigned yet', async () => {
    start('/staff', staffWorld({ staff_roster: [] }))
    expect(await screen.findByText(/No athletes are assigned to you yet/)).toBeInTheDocument()
  })

  it('shows an error with a way to try again', async () => {
    const user = userEvent.setup()
    const { world } = start('/staff', { ...staffWorld(), failReads: { staff_roster: { message: 'network' } } })
    expect(await screen.findByText(/We could not load the roster/)).toBeInTheDocument()
    world.failReads = {}
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Athletes' })).toBeInTheDocument()
  })

  it('opens an athlete from the roster', async () => {
    const user = userEvent.setup()
    start('/staff', staffWorld())
    await user.click(await screen.findByRole('link', { name: /Pat Player/ }))
    expect(await screen.findByText(/Editing Pat Player's account as Coach Kim/)).toBeInTheDocument()
    await waitFor(() => expect(seen.path).toBe('/staff/athlete/athlete-9/home'))
  })
})

describe('Inside an athlete\'s account', () => {
  const L1: Row = {
    list_id: 'L1', athlete_id: ATH, program_id: 1, unitid: 1001, college_name: 'Alpha University', city: 'Testville', state: 'IA', division_code: 'NCAA_D3',
    priority: 1, stage: 'contacted', closed_reason: null, added_on: '2026-10-01', main_coach_id: null, archived_at: null, last_activity_date: '2026-11-05',
    next_step_id: 'n1', next_step_description: 'Follow up with Coach Lee', next_step_due_date: '2026-11-08', days_silent: 5,
  }
  const entry: Row = { id: 'L1', athlete_id: ATH, program_id: 1, priority: 1, stage: 'contacted', closed_reason: null, main_coach_id: null, why_i_like_text: null, notes_text: null, questionnaire_completed_on: null, archived_at: null }
  const world = (extra: Record<string, Row[]> = {}) =>
    staffWorld({
      my_list: [L1],
      athlete_college: [entry],
      next_steps_due: [{ next_step_id: 'n1', athlete_id: ATH, list_id: 'L1', college_name: 'Alpha University', description: 'Follow up with Coach Lee', due_date: '2026-11-08', created_source: 'staff', bucket: 'overdue' }],
      next_step: [],
      activity_type: [],
      next_step_type: [{ code: 'send_email', label: 'Send email', suggested_text: 'Send an email to the coach', sort_order: 1 }],
      ...extra,
    })

  it('names the athlete and the coordinator in a banner, with the team and class', async () => {
    start('/staff/athlete/athlete-9', world())
    expect(await screen.findByText(/Editing Pat Player's account as Coach Kim/)).toBeInTheDocument()
    expect(screen.getByText(/Iowa Rockets 16R · Class of 2029/)).toBeInTheDocument()
    expect(screen.getByText(/Your name is recorded on every change you make/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('keeps the Roster tab lit and offers a way back', async () => {
    const user = userEvent.setup()
    start('/staff/athlete/athlete-9/home', world())
    await screen.findByText(/Editing Pat Player/)
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Roster' })).toHaveClass('font-semibold')
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Account' })).not.toHaveClass('font-semibold')
    await user.click(screen.getByRole('link', { name: '← Roster' }))
    expect(await screen.findByRole('list', { name: 'Athletes' })).toBeInTheDocument()
  })

  it('shows the athlete\'s Home in staff wording, with links that stay inside the athlete', async () => {
    const user = userEvent.setup()
    start('/staff/athlete/athlete-9/home', world())
    const overdue = await screen.findByRole('region', { name: 'Overdue' })
    expect(overdue).toHaveTextContent('Follow up with Coach Lee')
    expect(overdue).toHaveTextContent('added by staff')
    expect(overdue).not.toHaveTextContent('your coordinator')
    await user.click(within(overdue).getByRole('link'))
    expect(await screen.findByRole('heading', { name: 'Alpha University' })).toBeInTheDocument()
    await waitFor(() => expect(seen.path).toBe('/staff/athlete/athlete-9/list/L1/overview'))
  })

  it('lists the athlete\'s colleges and opens one under the same address', async () => {
    const user = userEvent.setup()
    start('/staff/athlete/athlete-9/list', world())
    await user.click(await screen.findByRole('link', { name: /Alpha University/ }))
    expect(await screen.findByRole('heading', { name: 'Alpha University' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← My List' })).toHaveAttribute('href', '/staff/athlete/athlete-9/list')
    expect(screen.getByRole('link', { name: 'View college details' })).toHaveAttribute('href', '/staff/athlete/athlete-9/find/1')
  })

  it('points an empty list at the athlete\'s own Find Colleges', async () => {
    start('/staff/athlete/athlete-9/list', world({ my_list: [], athlete_college: [] }))
    await screen.findByText(/Your list is empty/)
    // the top bar's own Find Colleges tab goes to the general search; the one in the page stays inside the athlete
    expect(screen.getAllByRole('link', { name: 'Find Colleges' }).map((a) => a.getAttribute('href'))).toContain('/staff/athlete/athlete-9/find')
  })

  it('saves a profile change on the athlete\'s record, not the coordinator\'s', async () => {
    const user = userEvent.setup()
    const { calls, tables } = start('/staff/athlete/athlete-9/profile/personal', world())
    await user.type(await screen.findByLabelText('Home city'), 'Ames')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(writes(calls, 'athlete', 'update')[0].payload).toMatchObject({ home_city: 'Ames', first_name: 'Pat' })
    expect(tables.athlete[0].home_city).toBe('Ames')
    expect(tables.athlete[0].id).toBe(ATH)
  })

  it('sets a next step for the athlete', async () => {
    const user = userEvent.setup()
    const { calls } = start('/staff/athlete/athlete-9/list/L1', world())
    await user.click(await screen.findByRole('button', { name: 'Set a next step' }))
    await user.type(await screen.findByLabelText('What to do'), 'Send the new film')
    await user.click(screen.getByRole('button', { name: 'Save next step' }))
    await waitFor(() => expect(writes(calls, 'next_step', 'insert')).toHaveLength(1))
    expect(writes(calls, 'next_step', 'insert')[0].payload).toMatchObject({ athlete_id: ATH, athlete_college_id: 'L1', description: 'Send the new film' })
  })

  it('adds a college to the athlete\'s list from the college page', async () => {
    const user = userEvent.setup()
    const { calls } = start('/staff/athlete/athlete-9/find/1', world({ athlete_college: [], program_search: [{ program_id: 1, unitid: 1001, college_name: 'Alpha University', division_label: 'NCAA Division III', status: 'active' }] }))
    await user.click(await screen.findByRole('button', { name: "Add to the athlete's list" }))
    expect(await screen.findByText("Added to the athlete's list.")).toBeInTheDocument()
    expect(writes(calls, 'athlete_college', 'insert')[0].payload).toEqual({ athlete_id: ATH, program_id: 1 })
    expect(screen.getByRole('link', { name: "Go to the athlete's list" })).toHaveAttribute('href', '/staff/athlete/athlete-9/list')
  })

  it('searches with the athlete\'s list marked, and results open inside the athlete', async () => {
    const user = userEvent.setup()
    start('/staff/athlete/athlete-9/find', world({ program_search: [{ program_id: 1, unitid: 1001, college_name: 'Alpha University', division_label: 'NCAA Division III', division_sort: 3, status: 'active' }] }))
    const link = await screen.findByRole('link', { name: /Alpha University/ })
    expect(link).toHaveTextContent('On My List')
    await user.click(link)
    await waitFor(() => expect(seen.path).toBe('/staff/athlete/athlete-9/find/1'))
  })

  it('says so when the athlete cannot be opened (not assigned, or not there)', async () => {
    start('/staff/athlete/athlete-404/home', world())
    expect(await screen.findByText('This athlete was not found, or is not assigned to you.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Roster' })).toBeInTheDocument()
  })

  it('keeps an athlete out of the staff view of an athlete\'s account', async () => {
    start('/staff/athlete/athlete-9/home', { session: makeSession() })
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.queryByText(/Editing Pat Player/)).not.toBeInTheDocument()
    await waitFor(() => expect(seen.path).toBe('/home'))
  })
})

describe('Change history', () => {
  const history: Row[] = [
    { id: 1, athlete_id: ATH, table_name: 'athlete', record_id: ATH, change_type: 'updated', old_values: { jersey_number: null }, new_values: { jersey_number: '7', updated_at: 'x', updated_by: 's1' }, changed_by: 's1', changed_by_role: 'staff', changed_at: '2026-11-09T15:00:00Z' },
    { id: 2, athlete_id: ATH, table_name: 'athlete_athletic', record_id: ATH, change_type: 'updated', old_values: {}, new_values: { height_in: 70 }, changed_by: 'user-9', changed_by_role: 'athlete', changed_at: '2026-11-10T15:00:00Z' },
  ]

  it('shows who changed what, newest first, with coordinators named', async () => {
    start('/staff/athlete/athlete-9/history', staffWorld({ change_history: history }))
    const list = await screen.findByRole('list', { name: 'Changes' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Nov 10 · Athlete')
    expect(items[0]).toHaveTextContent('Changed: Athletic profile')
    expect(items[0]).toHaveTextContent('height in')
    expect(items[1]).toHaveTextContent('Nov 9 · Kim Smith')
    expect(items[1]).toHaveTextContent('Changed: Personal details')
    expect(items[1]).toHaveTextContent('jersey number')
    expect(items[1]).not.toHaveTextContent('updated by')
  })

  it('can show only the changes made by staff', async () => {
    const user = userEvent.setup()
    start('/staff/athlete/athlete-9/history', staffWorld({ change_history: history }))
    await user.click(await screen.findByLabelText('Show only changes made by staff'))
    const items = within(screen.getByRole('list', { name: 'Changes' })).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Kim Smith')
  })

  it('says so when nothing has changed', async () => {
    start('/staff/athlete/athlete-9/history', staffWorld({ change_history: [] }))
    expect(await screen.findByText('No changes recorded yet.')).toBeInTheDocument()
  })
})

describe('Editing the shared college data (staff only)', () => {
  const coaches: Row[] = [
    { id: 1, program_id: 1, full_name: 'Casey Coach', title: 'head', email: 'casey@alpha.example.edu', phone: null, is_primary_recruiting_contact: false, employment_status: 'current', owner_athlete_id: null },
    { id: 2, program_id: 1, full_name: 'Robin Recruiter', title: 'recruiting_coordinator', email: 'robin@alpha.example.edu', is_primary_recruiting_contact: true, employment_status: 'current', owner_athlete_id: null },
    { id: 3, program_id: 1, full_name: 'Former Coach', title: 'assistant', email: null, is_primary_recruiting_contact: false, employment_status: 'departed', owner_athlete_id: null },
    { id: 4, program_id: 1, full_name: 'Private Contact', title: 'assistant', email: null, is_primary_recruiting_contact: false, employment_status: 'current', owner_athlete_id: ATH },
  ]
  const world = (extra: Record<string, Row[]> = {}) =>
    staffWorld({
      program_search: [{ program_id: 1, unitid: 1001, college_name: 'Alpha University', division_label: 'NCAA Division III', status: 'active', last_verified_on: '2026-10-01' }],
      college_program: [{ id: 1, unitid: 1001, program_url: 'https://alpha.example.edu/vb', questionnaire_url: null, camps_url: null, instagram_url: null, x_url: null, last_season_record: '20-10', status: 'active', last_verified_on: '2026-10-01', verified_by: 's1' }],
      college: [{ unitid: 1001, website_url: 'https://alpha.example.edu', cost_url: null }],
      college_coach: coaches,
      ...extra,
    })
  const open = (extra?: Record<string, Row[]>, more: Partial<FakeWorld> = {}) => start('/staff/find/1', { ...world(extra), ...more })

  it('is not offered to an athlete', async () => {
    start('/find/1', { tables: { ...world().tables, athlete: [ATHLETE_ROW] } })
    expect(await screen.findByRole('heading', { name: 'Alpha University' })).toBeInTheDocument()
    // give any staff panel time to load before checking that none is there
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    expect(screen.queryByText(/staff tools/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit college information' })).not.toBeInTheDocument()
  })

  it('shows who verified the record and when, and only the shared coaches', async () => {
    open()
    const tools = await screen.findByRole('region', { name: 'Staff tools' })
    expect(tools).toHaveTextContent('Verified Oct 1 by Kim Smith.')
    const coachList = within(tools).getByRole('list', { name: 'Shared coaches' })
    expect(coachList).toHaveTextContent('Casey Coach')
    expect(coachList).toHaveTextContent('Robin Recruiter')
    expect(coachList).toHaveTextContent('Main recruiting contact')
    expect(coachList).toHaveTextContent('Former Coach')
    expect(coachList).toHaveTextContent('Left the program')
    expect(coachList).not.toHaveTextContent('Private Contact')
  })

  it('saves the college facts: blanks become empty, links are trimmed, and the verified date is today', async () => {
    const user = userEvent.setup()
    const { calls } = open()
    await user.click(await screen.findByRole('button', { name: 'Edit college information' }))
    const form = await screen.findByRole('form', { name: 'Edit college information' })
    expect(within(form).getByLabelText('Volleyball program page')).toHaveValue('https://alpha.example.edu/vb')
    expect(within(form).getByLabelText('Last season record')).toHaveValue('20-10')
    await user.clear(within(form).getByLabelText('Volleyball program page'))
    await user.type(within(form).getByLabelText('Volleyball program page'), '  https://alpha.example.edu/volleyball  ')
    await user.clear(within(form).getByLabelText('Last season record'))
    await user.type(within(form).getByLabelText('Cost of attendance page'), 'https://alpha.example.edu/cost')
    await user.selectOptions(within(form).getByLabelText('Program status'), 'needs_review')
    await user.click(within(form).getByRole('button', { name: 'Save college information' }))
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit college information' })).not.toBeInTheDocument())
    expect(writes(calls, 'college', 'update')[0].payload).toEqual({ website_url: 'https://alpha.example.edu', cost_url: 'https://alpha.example.edu/cost' })
    expect(writes(calls, 'college_program', 'update')[0].payload).toEqual({
      program_url: 'https://alpha.example.edu/volleyball',
      questionnaire_url: null,
      camps_url: null,
      instagram_url: null,
      x_url: null,
      last_season_record: null,
      status: 'needs_review',
      last_verified_on: '2026-11-10',
    })
  })

  it('refuses a bad link and saves nothing', async () => {
    const user = userEvent.setup()
    const { calls } = open()
    await user.click(await screen.findByRole('button', { name: 'Edit college information' }))
    await user.type(await screen.findByLabelText('Camps page'), 'alpha.example.edu/camps')
    await user.click(screen.getByRole('button', { name: 'Save college information' }))
    expect(await screen.findByText('Start the link with http:// or https://')).toBeInTheDocument()
    expect(writes(calls, 'college')).toHaveLength(0)
    expect(writes(calls, 'college_program')).toHaveLength(0)
  })

  it('shows a readable message when the database refuses the edit, and does not stamp the program', async () => {
    const user = userEvent.setup()
    const { calls } = open(undefined, { failWrites: { college: { message: 'permission denied for table college', code: '42501' } } })
    await user.click(await screen.findByRole('button', { name: 'Edit college information' }))
    await user.click(await screen.findByRole('button', { name: 'Save college information' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to save this.')
    expect(writes(calls, 'college_program')).toHaveLength(0)
    expect(screen.getByRole('form', { name: 'Edit college information' })).toBeInTheDocument()
  })

  it('marks a record verified without changing anything else', async () => {
    const user = userEvent.setup()
    const { calls } = open()
    await user.click(await screen.findByRole('button', { name: 'Mark as verified today' }))
    expect(await screen.findByText('Marked as verified today.')).toBeInTheDocument()
    expect(writes(calls, 'college_program', 'update')).toHaveLength(1)
    expect(writes(calls, 'college_program', 'update')[0].payload).toEqual({ last_verified_on: '2026-11-10' })
    expect(writes(calls, 'college')).toHaveLength(0)
  })

  it('adds a shared coach and moves the main-contact mark to them, clearing the old one first', async () => {
    const user = userEvent.setup()
    const { calls } = open()
    await user.click(await screen.findByRole('button', { name: 'Add a coach' }))
    const form = await screen.findByRole('form', { name: 'Add a coach' })
    await user.type(within(form).getByLabelText('Name'), 'New Coach')
    await user.type(within(form).getByLabelText('Email'), 'new@alpha.example.edu')
    await user.click(within(form).getByLabelText('Main recruiting contact'))
    await user.click(within(form).getByRole('button', { name: 'Save coach' }))
    await waitFor(() => expect(writes(calls, 'college_coach', 'insert')).toHaveLength(1))
    const coachWrites = writes(calls, 'college_coach')
    expect(coachWrites.map((c) => c.mode)).toEqual(['update', 'insert'])
    expect(coachWrites[0].payload).toEqual({ is_primary_recruiting_contact: false })
    expect(coachWrites[1].payload).toMatchObject({
      program_id: 1,
      full_name: 'New Coach',
      email: 'new@alpha.example.edu',
      title: 'assistant',
      employment_status: 'current',
      is_primary_recruiting_contact: true,
      owner_athlete_id: null,
      source: 'Club staff edit',
      last_verified_on: '2026-11-10',
    })
  })

  it('changes a coach without touching the main contact when that is not asked', async () => {
    const user = userEvent.setup()
    const { calls } = open()
    await user.click(await screen.findByRole('button', { name: 'Edit Casey Coach' }))
    const form = await screen.findByRole('form', { name: 'Edit coach' })
    expect(within(form).getByLabelText('Name')).toHaveValue('Casey Coach')
    await user.clear(within(form).getByLabelText('Phone'))
    await user.type(within(form).getByLabelText('Phone'), '515-555-0199')
    await user.click(within(form).getByRole('button', { name: 'Save coach' }))
    await waitFor(() => expect(writes(calls, 'college_coach', 'update')).toHaveLength(1))
    expect(writes(calls, 'college_coach', 'update')[0].payload).toMatchObject({ phone: '515-555-0199', full_name: 'Casey Coach', is_primary_recruiting_contact: false })
  })

  it('marks a coach as having left and takes the main-contact mark away', async () => {
    const user = userEvent.setup()
    const { calls } = open()
    await user.click(await screen.findByRole('button', { name: 'Edit Robin Recruiter' }))
    const form = await screen.findByRole('form', { name: 'Edit coach' })
    await user.selectOptions(within(form).getByLabelText('Still at the program?'), 'departed')
    await user.click(within(form).getByLabelText('Main recruiting contact'))
    await user.click(within(form).getByRole('button', { name: 'Save coach' }))
    await waitFor(() => expect(writes(calls, 'college_coach', 'update')).toHaveLength(1))
    expect(writes(calls, 'college_coach', 'update')[0].payload).toMatchObject({ employment_status: 'departed', is_primary_recruiting_contact: false })
  })

  it('does not let a coach who left stay the main contact', async () => {
    const user = userEvent.setup()
    const { calls } = open()
    await user.click(await screen.findByRole('button', { name: 'Edit Robin Recruiter' }))
    const form = await screen.findByRole('form', { name: 'Edit coach' })
    await user.selectOptions(within(form).getByLabelText('Still at the program?'), 'departed')
    await user.click(within(form).getByRole('button', { name: 'Save coach' }))
    expect(await screen.findByText('A coach who has left cannot be the main recruiting contact')).toBeInTheDocument()
    expect(writes(calls, 'college_coach')).toHaveLength(0)
  })

  it('puts the old main contact back when the new coach cannot be saved', async () => {
    const user = userEvent.setup()
    // the first coach write clears the old mark; the second (the new coach) fails
    const { calls, tables } = open(undefined, { failNthWrite: { college_coach: { n: 2, error: { message: 'duplicate key', code: '23505' } } } })
    await user.click(await screen.findByRole('button', { name: 'Add a coach' }))
    const form = await screen.findByRole('form', { name: 'Add a coach' })
    await user.type(within(form).getByLabelText('Name'), 'New Coach')
    await user.click(within(form).getByLabelText('Main recruiting contact'))
    await user.click(within(form).getByRole('button', { name: 'Save coach' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('That entry already exists.')
    expect(writes(calls, 'college_coach').map((c) => c.mode)).toEqual(['update', 'insert', 'update'])
    expect(writes(calls, 'college_coach')[2].payload).toEqual({ is_primary_recruiting_contact: true })
    expect(tables.college_coach.find((c) => c.id === 2)?.is_primary_recruiting_contact).toBe(true)
    expect(tables.college_coach.some((c) => c.full_name === 'New Coach')).toBe(false)
  })
})
