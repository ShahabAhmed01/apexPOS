import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  width?: 'sm' | 'md' | 'lg' | 'xl'
  /** Extra classes for the content well (e.g. flush bodies like the palette). */
  contentClassName?: string
}

const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' }

export const Modal = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 'md',
  contentClassName
}: ModalProps): React.ReactElement => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--color-overlay)] data-[state=open]:animate-[var(--animate-overlay-in)]" />
      <Dialog.Content
        className={clsx(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2',
          'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-1)] shadow-[var(--shadow-modal)]',
          'focus:outline-none data-[state=open]:animate-[var(--animate-dialog-in)]',
          widths[width]
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <Dialog.Title className="text-base font-semibold tracking-tight">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="mt-1 text-sm text-[var(--color-text-1)]">
                {description}
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close asChild>
            <button
              aria-label="Close dialog"
              className="-me-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-2)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-2)] hover:text-[var(--color-text-0)]"
            >
              <X size={16} />
            </button>
          </Dialog.Close>
        </div>
        <div className={clsx('px-5 pb-5', contentClassName)}>{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
)
