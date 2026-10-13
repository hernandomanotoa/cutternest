import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Estilo peligroso (destructivo) para el botón de confirmación. Default: true */
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
}

/**
 * Diálogo de confirmación modal (patrón PrimeFaces ConfirmDialog):
 * overlay, icono de advertencia, título, mensaje y acciones Cancelar / Confirmar.
 * Esc cierra, el foco entra en el botón de confirmación al abrir.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (open) {
      confirmRef.current?.focus()
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <div className='flex items-center gap-3'>
            <AlertTriangle className='h-6 w-6 shrink-0 text-destructive' aria-hidden='true' />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className='pt-2'>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? 'danger' : 'default'}
            onClick={onConfirm}
            isLoading={loading}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
