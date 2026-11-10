import type { ReactNode } from 'react'
import { Dialog } from 'radix-ui'

interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}

/** Hoja inferior para flujos de captura. Se cierra con el fondo, Esc o el botón. */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-sheet border-t border-line bg-surface pb-safe data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in">
          <div aria-hidden="true" className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-line" />
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-2">
            <div>
              <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-ink-muted">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Cerrar"
              className="-mt-1 -mr-2 grid size-12 shrink-0 place-items-center rounded-full text-2xl text-ink-muted active:bg-surface-2"
            >
              <span aria-hidden="true">×</span>
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-5 pt-2 pb-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
