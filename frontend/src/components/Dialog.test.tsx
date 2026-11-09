import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './Dialog'

function Harness({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <ConfirmDialog
        open={open}
        title="Confirm delete"
        message="Are you sure?"
        busy={busy}
        onConfirm={vi.fn()}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}

describe('Dialog focus management', () => {
  it('moves focus inside the dialog on open', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open dialog' })
    opener.focus()
    await userEvent.click(opener)
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    // first focusable element is the header close button
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close dialog' }),
    )
  })

  it('wraps Tab from last to first and Shift+Tab from first to last', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    const dialog = screen.getByRole('dialog')
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    )
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    last.focus()
    await userEvent.tab()
    expect(document.activeElement).toBe(first)

    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(last)
  })

  it('restores focus to the opener on close', async () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open dialog' })
    await userEvent.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(opener)
  })

  it('dismisses on Escape and backdrop click when idle', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    const backdrop = document.querySelector('.dialog-backdrop')!
    await userEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('blocks Escape, backdrop and buttons while busy', async () => {
    render(<Harness busy />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const backdrop = document.querySelector('.dialog-backdrop')!
    await userEvent.click(backdrop)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /working/i })).toBeDisabled()
  })
})
