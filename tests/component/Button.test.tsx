import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '@renderer/design-system/Button'

describe('Button', () => {
  it('renders and handles clicks', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Confirm</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('loading state disables interaction and exposes busy state', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Pay
      </Button>
    )
    const btn = screen.getByRole('button', { name: 'Pay' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disabled state blocks interaction', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Void
      </Button>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Void' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
