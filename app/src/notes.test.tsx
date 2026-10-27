import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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

const ATH = 'athlete-1'

/** A row of the note_thread view, as the database would return it. */
const note = (id: string, extra: Row = {}): Row => ({
  note_id: id,
  athlete_id: ATH,
  athlete_name: 'Pat Player',
  sender: 'staff',
  sender_name: 'Kim Smith',
  kind: 'note',
  body: 'Please send me your new film',
  created_at: '2026-11-09T15:00:00Z',
  for_me: true,
  dismissed: false,
  mine: false,
  ...extra,
})

const athleteWorld = (notes: Row[] = []): Partial<FakeWorld> => ({
  tables: {
    note_thread: notes,
    app_setting: [{ key: 'silent_days', value: '21' }],
    athlete_preference: [{ athlete_id: ATH, competitiveness_bands: [1] }],
  },
})

describe('Athlete: notes on Home', () => {
  it('shows a new note from the coordinator until it is dismissed, with who and when', async () => {
    const user = userEvent.setup()
    const { calls } = start('/home', athleteWorld([note('n1'), note('n2', { dismissed: true, body: 'Already dismissed' }), note('n3', { for_me: false, mine: true, sender: 'athlete', body: 'My own note' })]))
    const inbox = await screen.findByRole('region', { name: 'New notes' })
    expect(inbox).toHaveTextContent('Please send me your new film')
    expect(inbox).toHaveTextContent('Kim Smith · Nov 9')
    expect(inbox).not.toHaveTextContent('Already dismissed')
    expect(inbox).not.toHaveTextContent('My own note')
    expect(within(inbox).getAllByRole('listitem')).toHaveLength(1)

    await user.click(within(inbox).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(writes(calls, 'athlete_note_dismissal', 'insert')).toHaveLength(1))
    expect(writes(calls, 'athlete_note_dismissal', 'insert')[0].payload).toEqual({ note_id: 'n1' })
  })

  it('shows no notes section when nothing is waiting, but still offers to write one', async () => {
    start('/home', athleteWorld([]))
    expect(await screen.findByRole('link', { name: 'Send a note or question to your coordinator' })).toHaveAttribute('href', '/notes')
    expect(screen.queryByRole('region', { name: 'New notes' })).not.toBeInTheDocument()
  })

  it('marks a question as a question and links to the conversation to reply', async () => {
    start('/home', athleteWorld([note('q1', { kind: 'question', body: 'Did you see my email?' })]))
    const inbox = await screen.findByRole('region', { name: 'New notes' })
    expect(inbox).toHaveTextContent('Question')
    expect(within(inbox).getByRole('link', { name: 'Reply' })).toHaveAttribute('href', '/notes')
  })

  it('reloads Home after a dismissal so the note goes away', async () => {
    const user = userEvent.setup()
    const fake = start('/home', athleteWorld([note('n1')]))
    const inbox = await screen.findByRole('region', { name: 'New notes' })
    // what the database will report once the dismissal is saved
    fake.tables.note_thread[0].dismissed = true
    await user.click(within(inbox).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'New notes' })).not.toBeInTheDocument())
  })

  it('says so when a note could not be dismissed, and keeps it', async () => {
    const user = userEvent.setup()
    start('/home', { ...athleteWorld([note('n1')]), failWrites: { athlete_note_dismissal: { message: 'network' } } })
    const inbox = await screen.findByRole('region', { name: 'New notes' })
    await user.click(within(inbox).getByRole('button', { name: 'Dismiss' }))
    expect(await within(inbox).findByRole('alert')).toBeInTheDocument()
    expect(within(inbox).getByText('Please send me your new film')).toBeInTheDocument()
  })
})

describe('Athlete: the notes screen', () => {
  it('sends a note or a question to the coordinator, and clears the box', async () => {
    const user = userEvent.setup()
    const { calls } = start('/notes', athleteWorld([]))
    const form = await screen.findByRole('form', { name: 'Send a note' })
    expect(form).toHaveTextContent('Send a note or question to your coordinator')
    await user.selectOptions(within(form).getByLabelText('This is a'), 'question')
    await user.type(within(form).getByLabelText('Your message'), '  Which camps should I do?  ')
    await user.click(within(form).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(writes(calls, 'athlete_note', 'insert')).toHaveLength(1))
    expect(writes(calls, 'athlete_note', 'insert')[0].payload).toEqual({ athlete_id: ATH, kind: 'question', body: 'Which camps should I do?' })
    expect(await within(form).findByText('Sent.')).toBeInTheDocument()
    expect(within(form).getByLabelText('Your message')).toHaveValue('')
  })

  it('refuses an empty note and one over 1000 characters, and sends nothing', async () => {
    const user = userEvent.setup()
    const { calls } = start('/notes', athleteWorld([]))
    const form = await screen.findByRole('form', { name: 'Send a note' })
    await user.click(within(form).getByRole('button', { name: 'Send' }))
    expect(await within(form).findByText('Write your note')).toBeInTheDocument()
    await user.click(within(form).getByLabelText('Your message'))
    await user.paste('x'.repeat(1001))
    await user.click(within(form).getByRole('button', { name: 'Send' }))
    expect(await within(form).findByText('Use 1000 characters or fewer')).toBeInTheDocument()
    expect(writes(calls, 'athlete_note')).toHaveLength(0)
  })

  it('shows the conversation both ways, newest first, with "You", names and New markers', async () => {
    start(
      '/notes',
      athleteWorld([
        note('n1', { created_at: '2026-11-08T15:00:00Z', body: 'Older note from the coordinator', dismissed: true }),
        note('n2', { created_at: '2026-11-09T15:00:00Z', sender: 'athlete', sender_name: 'Pat Player', mine: true, for_me: false, kind: 'question', body: 'My question' }),
        note('n3', { created_at: '2026-11-10T12:00:00Z', body: 'Newest, not yet dismissed' }),
      ]),
    )
    const list = await screen.findByRole('list', { name: 'Notes' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('p')?.textContent)).toEqual(['Newest, not yet dismissed', 'My question', 'Older note from the coordinator'])
    expect(items[0]).toHaveTextContent('Kim Smith · Nov 10')
    expect(items[0]).toHaveTextContent('New')
    expect(within(items[0]).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    expect(items[1]).toHaveTextContent('You · Nov 9')
    expect(items[1]).toHaveTextContent('Question')
    expect(within(items[1]).queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
    expect(items[2]).not.toHaveTextContent('New')
  })

  it('says so when there are no notes yet, and when they cannot be loaded', async () => {
    start('/notes', athleteWorld([]))
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
  })

  it('can be reached from the More tab', async () => {
    const user = userEvent.setup()
    start('/more', athleteWorld([]))
    await user.click(await screen.findByRole('link', { name: 'Notes to my coordinator' }))
    expect(await screen.findByRole('heading', { name: 'Notes' })).toBeInTheDocument()
  })
})

describe('Coordinator: notes', () => {
  const athleteRow: Row = { ...ATHLETE_ROW, id: ATH, user_id: 'user-9', first_name: 'Pat', last_name: 'Player' }
  const staffWorld = (notes: Row[] = [], extra: Record<string, Row[]> = {}): Partial<FakeWorld> => ({
    appUser: { role: 'staff', display_name: 'Coach Kim' },
    athlete: null,
    tables: {
      staff_roster: [{ athlete_id: ATH, first_name: 'Pat', last_name: 'Player', team_name: 'Iowa Rockets 16R', graduation_year: 2029, profile_pct: 60, colleges_count: 3, last_activity_date: '2026-11-05', overdue_count: 0 }],
      athlete: [athleteRow],
      athlete_completeness: [{ athlete_id: ATH, filled: 9, total: 15, pct: 60 }],
      staff_profile: [{ user_id: 's1', first_name: 'Kim', last_name: 'Smith' }],
      app_setting: [{ key: 'silent_days', value: '21' }],
      note_thread: notes,
      ...extra,
    },
  })
  const fromAthlete = (id: string, extra: Row = {}) => note(id, { sender: 'athlete', sender_name: 'Pat Player', body: 'Can you look at my list?', kind: 'question', ...extra })

  it('shows an athlete\'s new note on the roster, naming the athlete, until dismissed', async () => {
    const user = userEvent.setup()
    const { calls } = start('/staff', staffWorld([fromAthlete('n1'), fromAthlete('n2', { dismissed: true, body: 'Done already' })]))
    const inbox = await screen.findByRole('region', { name: 'New notes from athletes' })
    expect(within(inbox).getAllByRole('listitem')).toHaveLength(1)
    expect(inbox).toHaveTextContent('Pat Player · Nov 9')
    expect(inbox).toHaveTextContent('Can you look at my list?')
    expect(inbox).toHaveTextContent('Question')
    expect(within(inbox).getByRole('link', { name: 'Reply' })).toHaveAttribute('href', `/staff/athlete/${ATH}/notes`)
    await user.click(within(inbox).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(writes(calls, 'athlete_note_dismissal', 'insert')[0].payload).toEqual({ note_id: 'n1' }))
  })

  it('shows no notes section on the roster when nothing is waiting', async () => {
    start('/staff', staffWorld([]))
    expect(await screen.findByRole('list', { name: 'Athletes' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'New notes from athletes' })).not.toBeInTheDocument()
  })

  it('opens the conversation from the athlete\'s Notes tab and sends a note to the athlete', async () => {
    const user = userEvent.setup()
    const { calls } = start(`/staff/athlete/${ATH}/notes`, staffWorld([fromAthlete('n1')]))
    const form = await screen.findByRole('form', { name: 'Send a note' })
    expect(form).toHaveTextContent('Send a note or question to the athlete')
    expect(await screen.findByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('list', { name: 'Notes' })).toHaveTextContent('Can you look at my list?')
    await user.type(within(form).getByLabelText('Your message'), 'Yes, I will review it today')
    await user.click(within(form).getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(writes(calls, 'athlete_note', 'insert')).toHaveLength(1))
    expect(writes(calls, 'athlete_note', 'insert')[0].payload).toEqual({ athlete_id: ATH, kind: 'note', body: 'Yes, I will review it today' })
  })

  it('does not show a coordinator the athlete\'s own home notes box inside the athlete\'s Home', async () => {
    start(`/staff/athlete/${ATH}/home`, staffWorld([fromAthlete('n1')]))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'New notes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Send a note or question to your coordinator' })).not.toBeInTheDocument()
  })
})
