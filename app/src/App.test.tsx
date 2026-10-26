import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

describe('signed-out app', () => {
  it('shows the signed-out page at /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /rockets college recruiting/i })).toBeInTheDocument()
  })

  it('shows not-found for unknown pages', () => {
    render(
      <MemoryRouter initialEntries={['/nope']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
  })
})
