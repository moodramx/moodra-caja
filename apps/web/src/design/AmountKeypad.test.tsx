import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AmountKeypad } from './AmountKeypad'
import { entryToCents } from '../lib/money'

function Harness() {
  const [value, setValue] = useState('')
  return (
    <>
      <AmountKeypad value={value} onChange={setValue} />
      <p data-testid="cents">{entryToCents(value).toString()}</p>
    </>
  )
}

describe('AmountKeypad', () => {
  it('captura un monto con decimales y lo entrega en centavos', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    for (const key of ['8', '5', '0', 'Punto decimal', '5']) {
      await user.click(screen.getByRole('button', { name: key }))
    }

    expect(screen.getByLabelText('Monto')).toHaveTextContent('$850.5')
    expect(screen.getByTestId('cents')).toHaveTextContent('85050')
  })

  it('borra el último dígito', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '7' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: 'Borrar' }))

    expect(screen.getByLabelText('Monto')).toHaveTextContent('$7')
  })

  it('todas las teclas miden al menos 48 px de alto (clase min-h-16)', () => {
    render(<Harness />)
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('min-h-16')
    }
  })
})
