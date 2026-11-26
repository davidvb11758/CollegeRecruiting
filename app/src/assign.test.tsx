import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { makeFakeSupabase, makeSession, type FakeWorld } from './test/fakeSupabase'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('./lib/supabase', () => ({ getSupabase: () => mocked.client }))

type Row = Record<string, unknown>

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

const writes = (calls: ReturnType<typeof start>['calls'], mode?: string) => calls.filter((c) => c.table === 'athlete_staff_assignment' && (!mode || c.mode === mode))

// Ann has a main coordinator (Kim) and an extra one (Lee); Pat has only Kim; Zoe has nobody.
const roster: Row[] = [
  { athlete_id: 'a-pat', first_name: 'Pat', last_name: 'Player', team_name: 'Iowa Rockets 16R', graduation_year: 2029 },
  { athlete_id: 'a-ann', first_name: 'Ann', last_name: 'Adams', team_name: 'Iowa Rockets 16R', graduation_year: 2028 },
  { athlete_id: 'a-zoe', first_name: 'Zoe', last_name: 'Zimmer', team_name: 'Iowa Rockets 16R', graduation_year: 2029 },
]
const tables = (extra: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  staff_roster: roster,
  staff_profile: [
    { user_id: 's-kim', first_name: 'Kim', last_name: 'Smith', active: true },
    { user_id: 's-lee', first_name: 'Lee', last_name: 'Jones', active: true },
    { user_id: 's-off', first_name: 'Olly', last_name: 'Off', active: true },
    { user_id: 's-gone', first_name: 'Gail', last_name: 'Gone', active: false },
  ],
  app_user: [
    { user_id: 'user-1', role: 'admin', display_name: 'Admin Alex', status: 'active' },
    { user_id: 's-kim', role: 'staff', status: 'active' },
    { user_id: 's-lee', role: 'staff', status: 'active' },
    { user_id: 's-off', role: 'staff', status: 'disabled' },
    { user_id: 's-gone', role: 'staff', status: 'active' },
  ],
  athlete_staff_assignment: [
    { id: 'as-1', athlete_id: 'a-ann', staff_user_id: 's-kim', role_on_athlete: 'primary' },
    { id: 'as-2', athlete_id: 'a-ann', staff_user_id: 's-lee', role_on_athlete: 'secondary' },
    { id: 'as-3', athlete_id: 'a-pat', staff_user_id: 's-kim', role_on_athlete: 'primary' },
  ],
  ...extra,
})
const admin = (extra: Record<string, Row[]> = {}): Partial<FakeWorld> => ({
  appUser: { role: 'admin', display_name: 'Admin Alex' },
  athlete: null,
  tables: tables(extra),
})

const card = (name: string) => within(screen.getByRole('list', { name: 'Athletes' })).getByText(name).closest('li') as HTMLElement
const cardNames = () =>
  within(screen.getByRole('list', { name: 'Athletes' }))
    .getAllByRole('listitem')
    .filter((li) => li.querySelector(':scope > div > p.font-medium'))
    .map((li) => li.querySelector(':scope > div > p.font-medium')?.textContent)

describe('Assignments (administrator)', () => {
  it('lists every athlete with their main and extra coordinators and counts those without one', async () => {
    start('/staff/assignments', admin())
    expect(await screen.findByText('3 athletes · 1 without a coordinator')).toBeInTheDocument()
    expect(cardNames()).toEqual(['Ann Adams', 'Pat Player', 'Zoe Zimmer'])
    const ann = within(screen.getByRole('list', { name: 'Coordinators of Ann Adams' })).getAllByRole('listitem')
    expect(ann[0]).toHaveTextContent('Kim Smith')
    expect(ann[0]).toHaveTextContent('Main')
    expect(ann[1]).toHaveTextContent('Lee Jones')
    expect(ann[1]).toHaveTextContent('Extra')
    expect(card('Zoe Zimmer')).toHaveTextContent('No coordinator yet. Nobody on staff can see Zoe Zimmer.')
  })

  it('has its own tab, which only an administrator sees', async () => {
    start('/staff', admin())
    expect(await screen.findByRole('link', { name: 'Assignments' })).toBeInTheDocument()
  })

  it('is closed to a coordinator: no tab, and the address leads back to the roster', async () => {
    start('/staff/assignments', {
      appUser: { role: 'staff', display_name: 'Coach Kim' },
      athlete: null,
      tables: tables({ app_user: [{ user_id: 'user-1', role: 'staff', display_name: 'Coach Kim', status: 'active' }] }),
    })
    expect(await screen.findByRole('heading', { name: 'Roster' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Assignments' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Assignments' })).not.toBeInTheDocument()
  })

  it('is closed to an athlete', async () => {
    start('/staff/assignments', { tables: tables({ app_user: [{ user_id: 'user-1', role: 'athlete', display_name: 'Pat Player', status: 'active' }] }) })
    expect(await screen.findByRole('link', { name: 'My List' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Assignments' })).not.toBeInTheDocument()
  })

  it('makes the first coordinator of an athlete the main one', async () => {
    const user = userEvent.setup()
    const { calls } = start('/staff/assignments', admin())
    await screen.findByRole('list', { name: 'Athletes' })
    const zoe = card('Zoe Zimmer')
    await user.selectOptions(within(zoe).getByLabelText('Add a coordinator for Zoe Zimmer'), 'Lee Jones')
    await user.click(within(zoe).getByRole('button', { name: 'Assign to Zoe Zimmer' }))
    await waitFor(() => expect(writes(calls, 'insert')).toHaveLength(1))
    expect(writes(calls, 'insert')[0].payload).toEqual({ athlete_id: 'a-zoe', staff_user_id: 's-lee', role_on_athlete: 'primary' })
    expect(await screen.findByText('3 athletes · 0 without a coordinator')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Coordinators of Zoe Zimmer' })).getByText('Lee Jones')).toBeInTheDocument()
  })

  it('adds a second coordinator as an extra one, and does not offer someone already assigned', async () => {
    const user = userEvent.setup()
    const { calls } = start('/staff/assignments', admin())
    await screen.findByRole('list', { name: 'Athletes' })
    const pat = card('Pat Player')
    const select = within(pat).getByLabelText('Add a coordinator for Pat Player')
    expect(within(select).queryByRole('option', { name: 'Kim Smith' })).not.toBeInTheDocument()
    await user.selectOptions(select, 'Lee Jones')
    await user.click(within(pat).getByRole('button', { name: 'Assign to Pat Player' }))
    await waitFor(() => expect(writes(calls, 'insert')).toHaveLength(1))
    expect(writes(calls, 'insert')[0].payload).toEqual({ athlete_id: 'a-pat', staff_user_id: 's-lee', role_on_athlete: 'secondary' })
  })

  it('offers only active coordinators', async () => {
    start('/staff/assignments', admin())
    await screen.findByRole('list', { name: 'Athletes' })
    const options = within(within(card('Zoe Zimmer')).getByLabelText('Add a coordinator for Zoe Zimmer'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Choose the main coordinator…', 'Kim Smith', 'Lee Jones'])
  })

  it('makes an extra coordinator the main one', async () => {
    const user = userEvent.setup()
    const { calls } = start('/staff/assignments', admin())
    await screen.findByRole('list', { name: 'Athletes' })
    await user.click(screen.getByRole('button', { name: 'Make Lee Jones the main coordinator of Ann Adams' }))
    await waitFor(() => expect(writes(calls, 'update')).toHaveLength(1))
    expect(writes(calls, 'update')[0].payload).toEqual({ role_on_athlete: 'primary' })
  })

  it('asks before taking a coordinator away, and can be cancelled', async () => {
    const user = userEvent.setup()
    const { calls } = start('/staff/assignments', admin())
    await screen.findByRole('list', { name: 'Athletes' })
    await user.click(screen.getByRole('button', { name: 'Remove Lee Jones from Ann Adams' }))
    expect(screen.getByText(/They will no longer see Ann Adams/)).toBeInTheDocument()
    expect(writes(calls)).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(screen.getByRole('button', { name: 'Remove Lee Jones from Ann Adams' })).toBeInTheDocument()
    expect(writes(calls)).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Remove Lee Jones from Ann Adams' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(writes(calls, 'delete')).toHaveLength(1))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Coordinators of Ann Adams' })).queryByText('Lee Jones')).not.toBeInTheDocument())
  })

  it('shows only the athletes without a coordinator, and finds by name', async () => {
    const user = userEvent.setup()
    start('/staff/assignments', admin())
    await screen.findByRole('list', { name: 'Athletes' })
    await user.selectOptions(screen.getByLabelText('Show'), 'none')
    expect(cardNames()).toEqual(['Zoe Zimmer'])
    await user.selectOptions(screen.getByLabelText('Show'), 'all')
    await user.type(screen.getByLabelText('Search by name'), 'pa')
    expect(cardNames()).toEqual(['Pat Player'])
    await user.clear(screen.getByLabelText('Search by name'))
    await user.type(screen.getByLabelText('Search by name'), 'nobody')
    expect(await screen.findByText('No athlete matches.')).toBeInTheDocument()
  })

  it('says so when every athlete has a coordinator', async () => {
    const user = userEvent.setup()
    start('/staff/assignments', admin({ staff_roster: roster.slice(0, 2) }))
    await screen.findByRole('list', { name: 'Athletes' })
    await user.selectOptions(screen.getByLabelText('Show'), 'none')
    expect(screen.getByText('Every athlete has a coordinator.')).toBeInTheDocument()
  })

  it('names a coordinator whose account is switched off, but never offers one', async () => {
    start(
      '/staff/assignments',
      admin({
        athlete_staff_assignment: [{ id: 'as-9', athlete_id: 'a-zoe', staff_user_id: 's-off', role_on_athlete: 'primary' }],
      }),
    )
    await screen.findByRole('list', { name: 'Athletes' })
    expect(card('Zoe Zimmer')).toHaveTextContent('Olly Off')
    expect(card('Zoe Zimmer')).toHaveTextContent('(account off)')
    expect(within(within(card('Zoe Zimmer')).getByLabelText('Add a coordinator for Zoe Zimmer')).queryByRole('option', { name: 'Olly Off' })).not.toBeInTheDocument()
  })

  it('shows a friendly message when the database refuses, and leaves the screen as it was', async () => {
    const user = userEvent.setup()
    const { calls } = start('/staff/assignments', {
      ...admin(),
      failWrites: { athlete_staff_assignment: { message: 'That person is not an active coordinator', code: '23514' } },
    })
    await screen.findByRole('list', { name: 'Athletes' })
    const zoe = card('Zoe Zimmer')
    await user.selectOptions(within(zoe).getByLabelText('Add a coordinator for Zoe Zimmer'), 'Kim Smith')
    await user.click(within(zoe).getByRole('button', { name: 'Assign to Zoe Zimmer' }))
    expect(await within(zoe).findByRole('alert')).toHaveTextContent('That person is not an active coordinator, so they cannot be assigned')
    expect(writes(calls, 'insert')).toHaveLength(1)
    expect(card('Zoe Zimmer')).toHaveTextContent('No coordinator yet')
  })

  it('explains a refusal for lack of rights', async () => {
    const user = userEvent.setup()
    start('/staff/assignments', {
      ...admin(),
      failWrites: { athlete_staff_assignment: { message: 'Only an administrator can change assignments', code: '42501' } },
    })
    await screen.findByRole('list', { name: 'Athletes' })
    await user.click(screen.getByRole('button', { name: 'Make Lee Jones the main coordinator of Ann Adams' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only an administrator can change assignments')
  })

  it('shows an error with a way to try again', async () => {
    const user = userEvent.setup()
    const { world } = start('/staff/assignments', { ...admin(), failReads: { athlete_staff_assignment: { message: 'network' } } })
    expect(await screen.findByText(/We could not load the assignments/)).toBeInTheDocument()
    world.failReads = {}
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Athletes' })).toBeInTheDocument()
  })

  it('tells the administrator when there is nobody to assign yet', async () => {
    start('/staff/assignments', admin({ staff_profile: [], athlete_staff_assignment: [] }))
    expect(await screen.findByText(/There is no active coordinator to assign yet/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Add a coordinator for Zoe Zimmer')).not.toBeInTheDocument()
  })

  it('says so when no athlete has signed up', async () => {
    start('/staff/assignments', admin({ staff_roster: [] }))
    expect(await screen.findByText('No athlete has created a profile yet.')).toBeInTheDocument()
  })
})
