import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { makeFakeSupabase, makeSession, type FakeWorld } from './test/fakeSupabase'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('./lib/supabase', () => ({ getSupabase: () => mocked.client }))

type Row = Record<string, unknown>

// Noon in Chicago on Tuesday Nov 10, 2026. Only Date is faked, so timers and waits behave normally.
const NOW = new Date('2026-11-10T18:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

const ATHLETE = 'athlete-1'
const myList = (id: string, name: string, extra: Row = {}): Row => ({
  list_id: id,
  athlete_id: ATHLETE,
  program_id: Number(id.slice(1)),
  unitid: 2000 + Number(id.slice(1)),
  college_name: name,
  city: 'Testville',
  state: 'IA',
  division_code: 'NCAA_D3',
  priority: 3,
  stage: 'researching',
  closed_reason: null,
  added_on: '2026-10-01',
  main_coach_id: null,
  archived_at: null,
  last_activity_date: null,
  next_step_id: null,
  next_step_description: null,
  next_step_due_date: null,
  days_silent: 40,
  ...extra,
})

const L1 = myList('L1', 'Alpha University', { priority: 1, stage: 'contacted', last_activity_date: '2026-11-05', days_silent: 5, next_step_id: 'n1', next_step_description: 'Follow up with Coach Lee', next_step_due_date: '2026-11-08', main_coach_id: 11 })
const L2 = myList('L2', 'Beta College')
const L3 = myList('L3', 'Gamma State', { priority: 2, stage: 'in_conversation', last_activity_date: '2026-10-30', days_silent: 11, next_step_id: 'n3', next_step_description: 'Send updated video', next_step_due_date: '2026-11-12' })
const L4 = myList('L4', 'Delta Tech', { priority: 4, stage: 'closed', days_silent: 90 })
const L5 = myList('L5', 'Epsilon Institute', { archived_at: '2026-10-20T00:00:00Z' })

const entryRow = (l: Row, extra: Row = {}): Row => ({ id: l.list_id, athlete_id: ATHLETE, program_id: l.program_id, priority: l.priority, stage: l.stage, closed_reason: l.closed_reason, main_coach_id: l.main_coach_id, why_i_like_text: null, notes_text: null, questionnaire_completed_on: null, archived_at: l.archived_at, ...extra })

const coaches: Row[] = [
  { id: 11, program_id: 1, full_name: 'Casey Coach', title: 'head', email: 'casey@alpha.example.edu', phone: '515-555-0101', is_primary_recruiting_contact: true, employment_status: 'current', owner_athlete_id: null },
  { id: 12, program_id: 1, full_name: 'My Own Contact', title: 'assistant', email: 'mine@alpha.example.edu', phone: null, employment_status: 'current', owner_athlete_id: ATHLETE },
]

const activityTypes: Row[] = [
  { code: 'email', label: 'Email', requires_direction: true, user_selectable: true, sort_order: 1 },
  { code: 'phone_call', label: 'Phone call', requires_direction: true, user_selectable: true, sort_order: 2 },
  { code: 'camp_clinic', label: 'Camp / clinic', requires_direction: false, user_selectable: true, sort_order: 5 },
  { code: 'other_note', label: 'Other note', requires_direction: false, user_selectable: true, sort_order: 11 },
  { code: 'system', label: 'System entry', requires_direction: false, user_selectable: false, sort_order: 99 },
]
const stepTypes: Row[] = [
  { code: 'send_email', label: 'Send email', suggested_text: 'Send an email to the coach', sort_order: 1 },
  { code: 'follow_up', label: 'Follow up', suggested_text: 'Follow up with the coach', sort_order: 2 },
]

const base = (extra: Record<string, Row[]> = {}): Partial<FakeWorld> => ({
  tables: {
    my_list: [L1, L2, L3, L4, L5],
    athlete_college: [entryRow(L1), entryRow(L2), entryRow(L3), entryRow(L4), entryRow(L5)],
    college_coach: coaches,
    activity_type: activityTypes,
    next_step_type: stepTypes,
    app_setting: [{ key: 'silent_days', value: '21' }],
    ...extra,
  },
})

function start(path: string, world: Partial<FakeWorld> = {}) {
  const fake = makeFakeSupabase({ session: makeSession(), ...world })
  mocked.client = fake.client
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
  return fake
}

const writes = (calls: ReturnType<typeof start>['calls'], table: string, mode?: string) => calls.filter((c) => c.table === table && (!mode || c.mode === mode))
const listed = () => within(screen.getByRole('list', { name: 'My colleges' })).getAllByRole('listitem').map((li) => li.querySelector('span')?.textContent ?? '')

describe('Home', () => {
  const steps: Row[] = [
    { next_step_id: 'n1', athlete_id: ATHLETE, list_id: 'L1', college_name: 'Alpha University', description: 'Follow up with Coach Lee', due_date: '2026-11-08', created_source: 'athlete', bucket: 'overdue' },
    { next_step_id: 'n3', athlete_id: ATHLETE, list_id: 'L3', college_name: 'Gamma State', description: 'Send updated video', due_date: '2026-11-12', created_source: 'staff', bucket: 'this_week' },
    { next_step_id: 'n9', athlete_id: ATHLETE, list_id: 'L2', college_name: 'Beta College', description: 'Register for the camp', due_date: '2026-12-20', created_source: 'athlete', bucket: 'later' },
  ]
  const activity: Row[] = [
    { id: 'a1', athlete_id: ATHLETE, athlete_college_id: 'L1', activity_date: '2026-11-05', activity_type_code: 'email', summary: 'Sent intro email', source: 'athlete', created_at: '2026-11-05T10:00:00Z', deleted_at: null },
    { id: 'a2', athlete_id: ATHLETE, athlete_college_id: 'L3', activity_date: '2026-11-07', activity_type_code: 'phone_call', summary: 'Coordinator called Coach Park', source: 'staff', entered_by: 's1', created_at: '2026-11-07T10:00:00Z', deleted_at: null },
    { id: 'a3', athlete_id: ATHLETE, athlete_college_id: 'L1', activity_date: '2026-11-09', activity_type_code: 'system', summary: 'Stage: Researching to Contacted', source: 'system', created_at: '2026-11-09T10:00:00Z', deleted_at: null },
    { id: 'a4', athlete_id: ATHLETE, athlete_college_id: 'L1', activity_date: '2026-11-01', activity_type_code: 'email', summary: 'Deleted note', source: 'athlete', created_at: '2026-11-01T10:00:00Z', deleted_at: '2026-11-02T00:00:00Z' },
  ]
  const world = () => base({ next_steps_due: steps, activity_entry: activity, staff_profile: [{ user_id: 's1', first_name: 'Kim', last_name: 'Smith' }], athlete_preference: [{ athlete_id: ATHLETE, competitiveness_bands: [1] }] })

  it('shows overdue steps first, then this week, and counts later ones', async () => {
    start('/home', world())
    expect(await screen.findByRole('heading', { name: 'Overdue' })).toBeInTheDocument()
    const overdue = screen.getByRole('region', { name: 'Overdue' })
    expect(overdue).toHaveTextContent('Follow up with Coach Lee')
    expect(overdue).toHaveTextContent('Alpha University')
    expect(overdue).toHaveTextContent('Overdue by 2 days · Nov 8')
    const week = screen.getByRole('region', { name: 'Due this week' })
    expect(week).toHaveTextContent('Send updated video')
    expect(week).toHaveTextContent('Due in 2 days')
    expect(week).toHaveTextContent('added by your coordinator')
    expect(week).toHaveTextContent('1 more next step due later')
    expect(week).not.toHaveTextContent('Register for the camp')
  })

  it('links a step to its college', async () => {
    start('/home', world())
    await userEvent.setup().click(await screen.findByRole('link', { name: /Follow up with Coach Lee/ }))
    expect(await screen.findByRole('heading', { name: 'Alpha University' })).toBeInTheDocument()
  })

  it('lists quiet colleges still being pursued, longest first, leaving out closed and removed ones', async () => {
    start('/home', world())
    const quiet = await screen.findByRole('region', { name: 'No recent contact' })
    expect(quiet).toHaveTextContent('21 days or more')
    expect(quiet).toHaveTextContent('Beta College')
    expect(quiet).toHaveTextContent('40 days quiet')
    expect(quiet).not.toHaveTextContent('Delta Tech')
    expect(quiet).not.toHaveTextContent('Epsilon')
    expect(quiet).not.toHaveTextContent('Alpha University')
  })

  it('shows recent real activity with college names and who added it, without system or deleted entries', async () => {
    start('/home', world())
    const recent = await screen.findByRole('region', { name: 'Recent activity' })
    expect(recent).toHaveTextContent('Coordinator called Coach Park')
    expect(recent).toHaveTextContent('Gamma State')
    expect(recent).toHaveTextContent('added by Kim Smith')
    expect(recent).toHaveTextContent('Sent intro email')
    expect(recent).not.toHaveTextContent('Stage: Researching')
    expect(recent).not.toHaveTextContent('Deleted note')
    const items = within(recent).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Coordinator called Coach Park') // newest first
  })

  it('welcomes an athlete with nothing yet', async () => {
    start('/home', base({ my_list: [], athlete_college: [], next_steps_due: [], activity_entry: [] }))
    expect(await screen.findByText('Nothing is due this week.')).toBeInTheDocument()
    expect(screen.getByText(/Nothing logged yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tell us what you are looking for (My College Preferences)' })).toBeInTheDocument()
  })

  it('does not nag about preferences once they are saved', async () => {
    start('/home', world())
    await screen.findByRole('heading', { name: 'Overdue' })
    expect(screen.queryByText(/Tell us what you are looking for/)).not.toBeInTheDocument()
  })
})

describe('My List', () => {
  it('lists active colleges by priority, with next step and activity lines, and hides removed ones', async () => {
    start('/list', base())
    expect(await screen.findByText('4 of 30 colleges')).toBeInTheDocument()
    expect(listed()).toEqual(['Alpha University', 'Gamma State', 'Beta College', 'Delta Tech'])
    const alpha = screen.getByRole('link', { name: /Alpha University/ })
    expect(alpha).toHaveTextContent('Priority 1 - Top choice')
    expect(alpha).toHaveTextContent('Contacted')
    expect(alpha).toHaveTextContent('Follow up with Coach Lee · Overdue by 2 days (Nov 8)')
    expect(alpha).toHaveTextContent('Last activity Nov 5 (5 days ago)')
    expect(screen.getByRole('link', { name: /Beta College/ })).toHaveTextContent('No activity yet · added Oct 1')
    expect(screen.getByRole('link', { name: /Delta Tech/ })).not.toHaveTextContent('Last activity')
    expect(screen.queryByText('Epsilon Institute')).not.toBeInTheDocument()
  })

  it('filters by stage and by priority, and says when nothing matches', async () => {
    const user = userEvent.setup()
    start('/list', base())
    await screen.findByText('4 of 30 colleges')
    await user.selectOptions(screen.getByLabelText('Stage'), 'in_conversation')
    expect(listed()).toEqual(['Gamma State'])
    await user.selectOptions(screen.getByLabelText('Priority'), '1')
    expect(await screen.findByText('No colleges match these filters.')).toBeInTheDocument()
  })

  it('sorts by next step due and by time without activity', async () => {
    const user = userEvent.setup()
    start('/list', base())
    await screen.findByText('4 of 30 colleges')
    await user.selectOptions(screen.getByLabelText('Sort by'), 'due')
    expect(listed()).toEqual(['Alpha University', 'Gamma State', 'Beta College', 'Delta Tech'])
    await user.selectOptions(screen.getByLabelText('Sort by'), 'silent')
    expect(listed()).toEqual(['Delta Tech', 'Beta College', 'Gamma State', 'Alpha University'])
  })

  it('keeps the filters in the page address', async () => {
    start('/list?stage=closed&sort=name', base())
    await screen.findByText('4 of 30 colleges')
    expect(listed()).toEqual(['Delta Tech'])
    expect(screen.getByLabelText('Sort by')).toHaveValue('name')
  })

  it('shows removed colleges on request', async () => {
    const user = userEvent.setup()
    start('/list', base())
    await user.click(await screen.findByLabelText('Show colleges I removed (1)'))
    expect(listed()).toEqual(['Epsilon Institute'])
    expect(screen.getByRole('link', { name: /Epsilon/ })).toHaveTextContent('Removed')
  })

  it('points an empty list at Find Colleges', async () => {
    start('/list', base({ my_list: [], athlete_college: [] }))
    expect(await screen.findByText(/Your list is empty/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find Colleges' })).toHaveAttribute('href', '/find')
  })

  it('opens a college', async () => {
    start('/list', base())
    await userEvent.setup().click(await screen.findByRole('link', { name: /Alpha University/ }))
    expect(await screen.findByRole('heading', { name: 'Alpha University' })).toBeInTheDocument()
  })
})

describe('College page: header and next step', () => {
  const hubWorld = (extra: Record<string, Row[]> = {}) =>
    base({
      next_step: [{ id: 'n1', athlete_id: ATHLETE, athlete_college_id: 'L1', description: 'Follow up with Coach Lee', due_date: '2026-11-08', step_type_code: 'follow_up', status: 'open', created_source: 'athlete', created_at: '2026-11-01T00:00:00Z' }],
      activity_entry: [],
      ...extra,
    })

  it('shows the college, priority, stage, main contact and the current next step', async () => {
    start('/list/L1', hubWorld())
    expect(await screen.findByRole('heading', { name: 'Alpha University' })).toBeInTheDocument()
    expect(screen.getByText('Priority 1 - Top choice')).toBeInTheDocument()
    expect(screen.getByText('Contacted')).toBeInTheDocument()
    expect(screen.getByText(/Main contact: Casey Coach/)).toBeInTheDocument()
    const step = await screen.findByRole('region', { name: 'Next step' })
    expect(step).toHaveTextContent('Follow up with Coach Lee')
    expect(step).toHaveTextContent('Overdue by 2 days · Nov 8')
  })

  it('refuses a college that is not on this athlete\'s list', async () => {
    start('/list/L99', hubWorld())
    expect(await screen.findByText('That college is not on your list.')).toBeInTheDocument()
  })

  it('offers to set a next step when there is none', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L2', hubWorld({ next_step: [] }))
    await user.click(await screen.findByRole('button', { name: 'Set a next step' }))
    await user.selectOptions(await screen.findByLabelText('Type'), 'send_email')
    expect(screen.getByLabelText('What to do')).toHaveValue('Send an email to the coach')
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-11-17') // a week from the club's today
    await user.click(screen.getByRole('button', { name: 'Save next step' }))
    await waitFor(() => expect(writes(calls, 'next_step', 'insert')).toHaveLength(1))
    expect(writes(calls, 'next_step', 'insert')[0].payload).toEqual({
      athlete_id: ATHLETE,
      athlete_college_id: 'L2',
      description: 'Send an email to the coach',
      due_date: '2026-11-17',
      step_type_code: 'send_email',
    })
  })

  it('does not overwrite words already typed when a type is chosen', async () => {
    const user = userEvent.setup()
    start('/list/L2', hubWorld({ next_step: [] }))
    await user.click(await screen.findByRole('button', { name: 'Set a next step' }))
    await user.type(await screen.findByLabelText('What to do'), 'Ask about the camp')
    await user.selectOptions(screen.getByLabelText('Type'), 'send_email')
    expect(screen.getByLabelText('What to do')).toHaveValue('Ask about the camp')
  })

  it('sets quick due dates in the club day', async () => {
    const user = userEvent.setup()
    start('/list/L2', hubWorld({ next_step: [] }))
    await user.click(await screen.findByRole('button', { name: 'Set a next step' }))
    await user.click(await screen.findByRole('button', { name: 'In 2 weeks' }))
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-11-24')
    await user.click(screen.getByRole('button', { name: 'Tomorrow' }))
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-11-11')
  })

  it('needs words and a date', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L2', hubWorld({ next_step: [] }))
    await user.click(await screen.findByRole('button', { name: 'Set a next step' }))
    await user.click(await screen.findByRole('button', { name: 'Save next step' }))
    expect(await screen.findByText('Say what to do')).toBeInTheDocument()
    expect(writes(calls, 'next_step')).toHaveLength(0)
  })

  it('changes the open step instead of adding a second one', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1', hubWorld())
    await user.click(await screen.findByRole('button', { name: 'Change' }))
    const what = await screen.findByLabelText('What to do')
    await user.clear(what)
    await user.type(what, 'Call Coach Lee')
    await user.click(screen.getByRole('button', { name: 'Save next step' }))
    await waitFor(() => expect(writes(calls, 'next_step', 'update')).toHaveLength(1))
    expect(writes(calls, 'next_step', 'insert')).toHaveLength(0)
    expect(writes(calls, 'next_step', 'update')[0].payload).toMatchObject({ description: 'Call Coach Lee', due_date: '2026-11-08' })
  })

  it('marking a step done offers to log it, pre-filled, then offers the next step', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1', hubWorld())
    await user.click(await screen.findByRole('button', { name: 'Done' }))
    expect(writes(calls, 'next_step', 'update')[0].payload).toEqual({ status: 'done' })
    expect(await screen.findByText('Marked done. Log it?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Log it' }))
    expect(await screen.findByLabelText('What happened')).toHaveValue('email')
    expect(screen.getByLabelText('Summary')).toHaveValue('Follow up with Coach Lee')
    await user.selectOptions(screen.getByLabelText('Who made contact'), 'i_contacted')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes(calls, 'activity_entry', 'insert')).toHaveLength(1))
    expect(await screen.findByText('What is the next step?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Set next step' }))
    expect(await screen.findByRole('heading', { name: 'Set the next step' })).toBeInTheDocument()
  })

  it('lets you skip logging and still prompts for the next step', async () => {
    const user = userEvent.setup()
    start('/list/L1', hubWorld())
    await user.click(await screen.findByRole('button', { name: 'Done' }))
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(await screen.findByText('What is the next step?')).toBeInTheDocument()
  })

  it('skipping a step marks it skipped', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1', hubWorld())
    await user.click(await screen.findByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(writes(calls, 'next_step', 'update')[0].payload).toEqual({ status: 'skipped' }))
    expect(await screen.findByText('What is the next step?')).toBeInTheDocument()
  })

  it('shows a step a coordinator added', async () => {
    start('/list/L1', hubWorld({ next_step: [{ id: 'n1', athlete_id: ATHLETE, athlete_college_id: 'L1', description: 'Send updated video', due_date: '2026-11-12', status: 'open', created_source: 'staff', created_at: 'x' }] }))
    expect(await screen.findByText(/added by your coordinator/)).toBeInTheDocument()
  })
})

describe('College page: default tab', () => {
  it('opens on Activity, not Overview', async () => {
    start('/list/L1', base({ activity_entry: [] }))
    expect(await screen.findByRole('button', { name: 'Log activity' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })
})

describe('College page: overview', () => {
  const world = () => base({ next_step: [], activity_entry: [] })

  it('saves priority, stage, notes and main coach', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L2/overview', world())
    await user.selectOptions(await screen.findByLabelText('Priority'), '1')
    await user.selectOptions(screen.getByLabelText('Stage'), 'shortlisted')
    await user.type(screen.getByLabelText('Why I like this school'), 'Great nursing program')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    expect(writes(calls, 'athlete_college', 'update')[0].payload).toEqual({
      priority: 1,
      stage: 'shortlisted',
      closed_reason: null,
      main_coach_id: null,
      why_i_like_text: 'Great nursing program',
      notes_text: null,
      questionnaire_completed_on: null,
    })
  })

  it('needs a reason to close a college, and clears it for any other stage', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L2/overview', world())
    await user.selectOptions(await screen.findByLabelText('Stage'), 'closed')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Choose why this college is closed')).toBeInTheDocument()
    expect(writes(calls, 'athlete_college')).toHaveLength(0)
    await user.selectOptions(screen.getByLabelText('Why is it closed?'), 'i_passed')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    expect(writes(calls, 'athlete_college', 'update')[0].payload).toMatchObject({ stage: 'closed', closed_reason: 'i_passed' })
  })

  it('records the questionnaire date as the club day, and keeps an earlier date', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L2/overview', world())
    await user.click(await screen.findByLabelText('I completed their recruiting questionnaire'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved.')
    expect(writes(calls, 'athlete_college', 'update')[0].payload).toMatchObject({ questionnaire_completed_on: '2026-11-10' })
  })

  it('removes a college only after a second tap, then returns to the list', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L2/overview', world())
    await user.click(await screen.findByRole('button', { name: 'Remove from My List' }))
    expect(writes(calls, 'athlete_college')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    expect(await screen.findByRole('heading', { name: 'My List' })).toBeInTheDocument()
    expect(writes(calls, 'athlete_college', 'update')[0].payload).toEqual({ archived_at: '2026-11-10T18:00:00.000Z' })
  })

  it('lets you restore a removed college', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L5/overview', world())
    expect(await screen.findByText('This college is removed from your list.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Next step' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore to My List' }))
    await waitFor(() => expect(writes(calls, 'athlete_college', 'update')[0].payload).toEqual({ archived_at: null }))
  })
})

describe('College page: activity', () => {
  const entries: Row[] = [
    { id: 'a1', athlete_id: ATHLETE, athlete_college_id: 'L1', activity_date: '2026-11-05', activity_type_code: 'email', direction: 'i_contacted', coach_ids: [11, 12], summary: 'Sent intro email', details_text: 'Attached my video', outcome: 'waiting', source: 'athlete', follow_up_needed: true, created_at: '2026-11-05T10:00:00Z', deleted_at: null },
    { id: 'a2', athlete_id: ATHLETE, athlete_college_id: 'L1', activity_date: '2026-11-09', activity_type_code: 'system', summary: 'Stage: Researching to Contacted', source: 'system', created_at: '2026-11-09T10:00:00Z', deleted_at: null },
    { id: 'a3', athlete_id: ATHLETE, athlete_college_id: 'L1', activity_date: '2026-11-07', activity_type_code: 'phone_call', direction: 'they_contacted', coach_name_text: 'Coach Park', summary: 'Coordinator called', source: 'staff', created_at: '2026-11-07T10:00:00Z', deleted_at: null },
    { id: 'a4', athlete_id: ATHLETE, athlete_college_id: 'L1', activity_date: '2026-11-02', activity_type_code: 'other_note', summary: 'Removed entry', source: 'athlete', created_at: '2026-11-02T10:00:00Z', deleted_at: '2026-11-03T00:00:00Z' },
    { id: 'z9', athlete_id: ATHLETE, athlete_college_id: 'L3', activity_date: '2026-11-08', activity_type_code: 'email', summary: 'Other college', source: 'athlete', created_at: 'x', deleted_at: null },
  ]
  const world = (next: Row[] = []) => base({ next_step: next, activity_entry: entries })
  const openLog = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Log activity' }))
    return screen.findByRole('form', { name: 'Log activity' })
  }

  it('shows this college\'s timeline newest first, hides deleted entries, and marks automatic and coordinator entries', async () => {
    start('/list/L1/activity', world())
    const timeline = await screen.findByRole('list', { name: 'Activity' })
    const items = within(timeline).getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('p:nth-of-type(2)')?.textContent)).toEqual(['Stage: Researching to Contacted', 'Coordinator called', 'Sent intro email'])
    expect(items[0]).toHaveTextContent('Automatic')
    expect(items[1]).toHaveTextContent('Added by your coordinator')
    expect(items[1]).toHaveTextContent('Phone call · They contacted me · Coach Park')
    expect(items[2]).toHaveTextContent('Email · I contacted them · Casey Coach, My Own Contact · Waiting for reply')
    expect(items[2]).toHaveTextContent('Attached my video')
    expect(items[2]).toHaveTextContent('Follow-up needed')
    expect(within(timeline).queryByText('Other college')).not.toBeInTheDocument()
  })

  it('does not let automatic entries be edited or deleted', async () => {
    start('/list/L1/activity', world())
    const timeline = await screen.findByRole('list', { name: 'Activity' })
    const system = within(timeline).getAllByRole('listitem')[0]
    expect(within(system).queryByRole('button')).not.toBeInTheDocument()
    expect(within(within(timeline).getAllByRole('listitem')[2]).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('filters the timeline by type', async () => {
    const user = userEvent.setup()
    start('/list/L1/activity', world())
    await screen.findByRole('list', { name: 'Activity' })
    await user.selectOptions(screen.getByLabelText('Show'), 'phone_call')
    expect(within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem')).toHaveLength(1)
    await user.selectOptions(screen.getByLabelText('Show'), 'camp_clinic')
    expect(screen.getByText('Nothing of that kind yet.')).toBeInTheDocument()
  })

  it('logs an email with the direction required and today as the default date', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/activity', world())
    const form = await openLog(user)
    expect(within(form).getByLabelText('Date')).toHaveValue('2026-11-10')
    expect(within(form).queryByLabelText('Who made contact')).not.toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText('What happened'), 'email')
    await user.type(within(form).getByLabelText('Summary'), 'Sent thank-you email')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await within(form).findByText('Choose who made contact')).toBeInTheDocument()
    expect(writes(calls, 'activity_entry')).toHaveLength(0)
    await user.selectOptions(within(form).getByLabelText('Who made contact'), 'i_contacted')
    await user.click(within(form).getByLabelText('My Own Contact'))
    await user.click(within(form).getByLabelText('Casey Coach'))
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes(calls, 'activity_entry', 'insert')).toHaveLength(1))
    expect(writes(calls, 'activity_entry', 'insert')[0].payload).toEqual({
      athlete_id: ATHLETE,
      athlete_college_id: 'L1',
      activity_date: '2026-11-10',
      activity_type_code: 'email',
      direction: 'i_contacted',
      coach_ids: [12, 11],
      coach_name_text: null,
      summary: 'Sent thank-you email',
      details_text: null,
      outcome: null,
      follow_up_needed: false,
    })
    expect(await screen.findByRole('button', { name: 'Log activity' })).toBeInTheDocument()
  })

  it('does not ask for a direction on a camp', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/activity', world())
    const form = await openLog(user)
    await user.selectOptions(within(form).getByLabelText('What happened'), 'camp_clinic')
    expect(within(form).queryByLabelText('Who made contact')).not.toBeInTheDocument()
    await user.type(within(form).getByLabelText('Summary'), 'Attended the summer camp')
    await user.type(within(form).getByLabelText('Coach name (if not listed)'), 'Coach Park')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes(calls, 'activity_entry', 'insert')).toHaveLength(1))
    expect(writes(calls, 'activity_entry', 'insert')[0].payload).toMatchObject({ coach_ids: [], coach_name_text: 'Coach Park', direction: null })
  })

  it('lets the coach list be changed on an entry, one coach at a time', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/activity', world())
    const timeline = await screen.findByRole('list', { name: 'Activity' })
    await user.click(within(within(timeline).getAllByRole('listitem')[2]).getByRole('button', { name: 'Edit' }))
    expect(await screen.findByLabelText('Casey Coach')).toBeChecked()
    expect(screen.getByLabelText('My Own Contact')).toBeChecked()
    expect(screen.queryByLabelText('Coach name (if not listed)')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('My Own Contact'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes(calls, 'activity_entry', 'update')).toHaveLength(1))
    expect(writes(calls, 'activity_entry', 'update')[0].payload).toMatchObject({ coach_ids: [11], coach_name_text: null })
  })

  it('asks for a coach name only when no listed coach is chosen, and sends no name with a chosen coach', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/activity', world())
    const form = await openLog(user)
    const name = within(form).getByLabelText('Coach name (if not listed)')
    await user.type(name, 'Coach Park')
    await user.click(within(form).getByLabelText('Casey Coach'))
    expect(within(form).queryByLabelText('Coach name (if not listed)')).not.toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText('What happened'), 'camp_clinic')
    await user.type(within(form).getByLabelText('Summary'), 'Met them at camp')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes(calls, 'activity_entry', 'insert')).toHaveLength(1))
    expect(writes(calls, 'activity_entry', 'insert')[0].payload).toMatchObject({ coach_ids: [11], coach_name_text: null })
  })

  it('refuses a date in the future and a missing summary', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/activity', world())
    const form = await openLog(user)
    await user.selectOptions(within(form).getByLabelText('What happened'), 'camp_clinic')
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-11-11' } })
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await within(form).findByText('The date cannot be in the future')).toBeInTheDocument()
    expect(within(form).getByText('Write a one-line summary')).toBeInTheDocument()
    expect(writes(calls, 'activity_entry')).toHaveLength(0)
  })

  it('does not offer the time of day or a link to an email or document (hidden in this phase), and never sends them', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/activity', world())
    const form = await openLog(user)
    expect(within(form).queryByLabelText('Time')).not.toBeInTheDocument()
    expect(within(form).queryByLabelText('Link to the email or document')).not.toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText('What happened'), 'camp_clinic')
    await user.type(within(form).getByLabelText('Summary'), 'Met them at camp')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes(calls, 'activity_entry', 'insert')).toHaveLength(1))
    const sent = Object.keys(writes(calls, 'activity_entry', 'insert')[0].payload as object)
    expect(sent).not.toContain('activity_time')
    expect(sent).not.toContain('attachment_url')
  })

  it('leaves a saved time and link alone when an entry is edited', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/activity', base({ activity_entry: entries.map((e) => (e.id === 'a1' ? { ...e, activity_time: '09:30:00', attachment_url: 'https://mail.example.com/1' } : e)) }))
    const timeline = await screen.findByRole('list', { name: 'Activity' })
    expect(timeline).not.toHaveTextContent('Open the linked email or document')
    await user.click(within(within(timeline).getAllByRole('listitem')[2]).getByRole('button', { name: 'Edit' }))
    const summary = await screen.findByLabelText('Summary')
    await user.clear(summary)
    await user.type(summary, 'Sent intro email again')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes(calls, 'activity_entry', 'update')).toHaveLength(1))
    const sent = Object.keys(writes(calls, 'activity_entry', 'update')[0].payload as object)
    expect(sent).not.toContain('activity_time')
    expect(sent).not.toContain('attachment_url')
  })

  it('offers the next step after a follow-up is flagged and there is no open step', async () => {
    const user = userEvent.setup()
    start('/list/L1/activity', world())
    const form = await openLog(user)
    await user.selectOptions(within(form).getByLabelText('What happened'), 'camp_clinic')
    await user.type(within(form).getByLabelText('Summary'), 'Met the coach')
    await user.click(within(form).getByLabelText('I need to follow up'))
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('What is the next step?')).toBeInTheDocument()
  })

  it('does not ask when a next step already exists', async () => {
    const user = userEvent.setup()
    start('/list/L1/activity', world([{ id: 'n1', athlete_id: ATHLETE, athlete_college_id: 'L1', description: 'Follow up', due_date: '2026-11-12', status: 'open', created_source: 'athlete', created_at: 'x' }]))
    const form = await openLog(user)
    await user.selectOptions(within(form).getByLabelText('What happened'), 'camp_clinic')
    await user.type(within(form).getByLabelText('Summary'), 'Met the coach')
    await user.click(within(form).getByLabelText('I need to follow up'))
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Log activity' })).toBeInTheDocument()
    expect(screen.queryByText('What is the next step?')).not.toBeInTheDocument()
  })

  it('edits an entry of your own', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/activity', world())
    const timeline = await screen.findByRole('list', { name: 'Activity' })
    await user.click(within(within(timeline).getAllByRole('listitem')[2]).getByRole('button', { name: 'Edit' }))
    const summary = await screen.findByLabelText('Summary')
    expect(summary).toHaveValue('Sent intro email')
    await user.clear(summary)
    await user.type(summary, 'Sent intro email and video')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(writes(calls, 'activity_entry', 'update')).toHaveLength(1))
    expect(writes(calls, 'activity_entry', 'update')[0].payload).toMatchObject({ summary: 'Sent intro email and video', direction: 'i_contacted', coach_ids: [11, 12] })
    expect(writes(calls, 'activity_entry', 'insert')).toHaveLength(0)
  })

  it('deletes only after a second tap, and only hides the entry', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/activity', world())
    const timeline = await screen.findByRole('list', { name: 'Activity' })
    const entry = within(timeline).getAllByRole('listitem')[2]
    await user.click(within(entry).getByRole('button', { name: 'Delete' }))
    expect(writes(calls, 'activity_entry')).toHaveLength(0)
    await user.click(within(entry).getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(writes(calls, 'activity_entry', 'update')).toHaveLength(1))
    expect(writes(calls, 'activity_entry', 'update')[0].payload).toEqual({ deleted_at: '2026-11-10T18:00:00.000Z' })
    expect(writes(calls, 'activity_entry', 'delete')).toHaveLength(0)
  })

  it('shows a readable message when the database refuses an entry', async () => {
    const user = userEvent.setup()
    const fake = start('/list/L1/activity', world())
    fake.world.failWrites.activity_entry = { message: 'new row violates row-level security policy', code: '42501' }
    const form = await openLog(user)
    await user.selectOptions(within(form).getByLabelText('What happened'), 'camp_clinic')
    await user.type(within(form).getByLabelText('Summary'), 'Met the coach')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('You do not have permission to save this')
  })

  it('says so when there is nothing yet', async () => {
    start('/list/L2/activity', world())
    expect(await screen.findByText(/Nothing logged yet/)).toBeInTheDocument()
  })
})

describe('College page: contacts', () => {
  const world = () => base({ next_step: [], activity_entry: [] })

  it('shows shared and own contacts, marks the main one, and offers tap-to-email', async () => {
    start('/list/L1/contacts', world())
    const list = await screen.findByRole('list', { name: 'Coaches' })
    expect(within(list).getByText('Casey Coach')).toBeInTheDocument()
    expect(within(list).getByText('My Own Contact')).toBeInTheDocument()
    expect(within(list).getByText('Main contact')).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: 'casey@alpha.example.edu' })).toHaveAttribute('href', 'mailto:casey@alpha.example.edu')
    expect(within(list).getAllByRole('button', { name: 'Edit' })).toHaveLength(1) // only the own contact
  })

  it('changes the main contact', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/contacts', world())
    const list = await screen.findByRole('list', { name: 'Coaches' })
    await user.click(within(list).getByRole('button', { name: 'Make main contact' }))
    await waitFor(() => expect(writes(calls, 'athlete_college', 'update')[0].payload).toEqual({ main_coach_id: 12 }))
    await user.click(within(list).getByRole('button', { name: 'Not my main contact' }))
    await waitFor(() => expect(writes(calls, 'athlete_college', 'update')[1].payload).toEqual({ main_coach_id: null }))
  })

  it('adds a contact of your own, private to this athlete', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/contacts', world())
    await user.click(await screen.findByRole('button', { name: 'Add a contact' }))
    const form = await screen.findByRole('form', { name: 'Add a contact' })
    await user.type(within(form).getByLabelText('Name'), 'Pat Assistant')
    await user.type(within(form).getByLabelText('Email'), 'pat@alpha.example.edu')
    await user.click(within(form).getByRole('button', { name: 'Save contact' }))
    await waitFor(() => expect(writes(calls, 'college_coach', 'insert')).toHaveLength(1))
    expect(writes(calls, 'college_coach', 'insert')[0].payload).toEqual({
      program_id: 1,
      owner_athlete_id: ATHLETE,
      full_name: 'Pat Assistant',
      title: 'assistant',
      email: 'pat@alpha.example.edu',
      phone: null,
      recruits_note: null,
    })
  })

  it('needs a name and a valid email', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/contacts', world())
    await user.click(await screen.findByRole('button', { name: 'Add a contact' }))
    const form = await screen.findByRole('form', { name: 'Add a contact' })
    await user.type(within(form).getByLabelText('Email'), 'nope')
    await user.click(within(form).getByRole('button', { name: 'Save contact' }))
    expect(await within(form).findByText('Enter the name')).toBeInTheDocument()
    expect(within(form).getByText('Enter a valid email address')).toBeInTheDocument()
    expect(writes(calls, 'college_coach')).toHaveLength(0)
  })

  it('edits and deletes only the athlete\'s own contact', async () => {
    const user = userEvent.setup()
    const { calls } = start('/list/L1/contacts', world())
    const list = await screen.findByRole('list', { name: 'Coaches' })
    await user.click(within(list).getByRole('button', { name: 'Edit' }))
    const form = await screen.findByRole('form', { name: 'Edit contact' })
    expect(within(form).getByLabelText('Name')).toHaveValue('My Own Contact')
    await user.type(within(form).getByLabelText('Phone'), '5155550199')
    await user.click(within(form).getByRole('button', { name: 'Save contact' }))
    await waitFor(() => expect(writes(calls, 'college_coach', 'update')).toHaveLength(1))
    expect(writes(calls, 'college_coach', 'update')[0].payload).toMatchObject({ full_name: 'My Own Contact', phone: '5155550199' })

    const again = await screen.findByRole('list', { name: 'Coaches' })
    await user.click(within(again).getByRole('button', { name: 'Delete' }))
    expect(writes(calls, 'college_coach', 'delete')).toHaveLength(0)
    await user.click(within(again).getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(writes(calls, 'college_coach', 'delete')).toHaveLength(1))
  })
})
