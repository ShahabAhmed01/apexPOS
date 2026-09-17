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
}

const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' }

export const Modal = ({ open, onOpenChange, title, description, children, width = 'md' }: ModalProps): React.ReactElement => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" />
      <Dialog.Content
        className={clsx(
          'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2',
          'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-1)] p-6 shadow-2xl',
          'focus:outline-none',
          widths[width]
        )}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="mt-1 text-sm text-[var(--color-text-1)]">
                {description}
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close asChild>
            <button
              aria-label="Close dialog"
              className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-2)] hover:bg-[var(--color-bg-2)] hover:text-[var(--color-text-0)]"
            >
              <X size={18} />
            </button>
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
)
