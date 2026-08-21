import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';

export interface UseUndoableActionOptions<T = void> {
  onExecute: () => Promise<T> | T;
  onUndo?: () => Promise<void> | void;
  delayMs?: number;
  executingMessage?: string;
  undoLabel?: string;
}

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  undoLabel: string;
}

function UndoToast({ message, onUndo, undoLabel }: UndoToastProps) {
  return (
    <span className='flex items-center gap-3'>
      <span>{message}</span>
      <button
        type='button'
        onClick={onUndo}
        className='font-semibold underline underline-offset-2 hover:text-primary'
      >
        {undoLabel}
      </button>
    </span>
  );
}

export function useUndoableAction<T = void>(options: UseUndoableActionOptions<T>) {
  const { onExecute, onUndo, delayMs = 5000, executingMessage, undoLabel = 'Deshacer' } = options;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executedRef = useRef(false);
  const [isPending, setIsPending] = useState(false);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const execute = useCallback(async () => {
    clearTimer();
    executedRef.current = false;
    setIsPending(true);

    const toastId = toast.custom(
      (t) => (
        <UndoToast
          message={executingMessage || 'Acción en curso...'}
          undoLabel={undoLabel}
          onUndo={() => {
            toast.dismiss(t.id);
            clearTimer();
            if (!executedRef.current) {
              setIsPending(false);
            } else {
              onUndo?.();
            }
          }}
        />
      ),
      { duration: delayMs }
    );

    timeoutRef.current = setTimeout(async () => {
      try {
        executedRef.current = true;
        await onExecute();
        toast.dismiss(toastId);
      } catch (err) {
        toast.dismiss(toastId);
        toast.error('Error al ejecutar la acción');
      } finally {
        setIsPending(false);
      }
    }, delayMs);
  }, [clearTimer, delayMs, executingMessage, onExecute, onUndo, undoLabel]);

  return { execute, isPending };
}
