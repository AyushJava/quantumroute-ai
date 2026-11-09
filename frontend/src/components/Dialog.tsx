import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** When false, Escape and backdrop clicks do not dismiss (e.g. busy state). */
  dismissible?: boolean
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute('aria-hidden') !== 'true',
  )
}

/** Accessible modal dialog — focus trap, Escape/backdrop dismissal,
 *  focus restoration on close. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  dismissible = true,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const dismissibleRef = useRef(dismissible)
  useEffect(() => {
    dismissibleRef.current = dismissible
  }, [dismissible])

  // Move focus into the dialog on open; restore it on close.
  useEffect(() => {
    if (!open) return
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const el = dialogRef.current
    if (el) {
      const items = focusables(el)
      ;(items[0] ?? el).focus()
    }
    return () => {
      previous?.focus()
    }
  }, [open])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = dialogRef.current
    if (!el) return

    if (e.key === 'Escape') {
      if (dismissibleRef.current) onClose()
      return
    }

    if (e.key !== 'Tab') return
    const items = focusables(el)
    if (items.length === 0) {
      e.preventDefault()
      el.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    const inside = active instanceof Node && el.contains(active)

    if (e.shiftKey) {
      if (!inside || active === first) {
        e.preventDefault()
        last.focus()
      }
    } else if (!inside || active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  return (
    <div
      className="dialog-backdrop"
      onClick={dismissible ? onClose : undefined}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="dialog-head">
          <h3>{title}</h3>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={!dismissible}
          >
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Delete',
  danger = true, busy = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      dismissible={!busy}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{message}</p>
    </Dialog>
  )
}
