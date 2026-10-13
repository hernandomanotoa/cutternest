import { useRef } from 'react'

interface OtpInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  error?: boolean
}

/**
 * Input estilo OTP: `length` casillas independientes para códigos numéricos
 * (p. ej. TOTP de 6 dígitos). Soporta avance automático, pegado completo,
 * retroceso entre casillas y navegación con flechas.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
}: OtpInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  const focusAt = (index: number) => {
    const clamped = Math.max(0, Math.min(index, length - 1))
    inputRefs.current[clamped]?.focus()
    inputRefs.current[clamped]?.select()
  }

  const commit = (next: string) => {
    onChange(next)
    if (next.length === length && /^\d+$/.test(next)) {
      onComplete?.(next)
    }
  }

  const handleChange = (index: number, raw: string) => {
    // Solo dígitos; si el usuario teclea varios de golpe, se reparten.
    const cleaned = raw.replace(/\D/g, '')
    if (!cleaned) return
    const next = (value.slice(0, index) + cleaned + value.slice(index + cleaned.length)).slice(0, length)
    commit(next)
    if (index + cleaned.length < length) {
      focusAt(index + cleaned.length)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        // Borra la casilla actual sin moverse.
        commit(value.slice(0, index) + value.slice(index + 1))
      } else if (index > 0) {
        // Casilla vacía: retrocede y borra la anterior.
        commit(value.slice(0, index - 1) + value.slice(index))
        focusAt(index - 1)
      }
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focusAt(index - 1)
      e.preventDefault()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      focusAt(index + 1)
      e.preventDefault()
    }
  }

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!pasted) return
    const next = (value.slice(0, index) + pasted + value.slice(index + pasted.length)).slice(0, length)
    commit(next)
    focusAt(Math.min(index + pasted.length, length - 1))
  }

  return (
    <div className='flex justify-center gap-2' role='group' aria-label='Código de verificación'>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el
          }}
          type='text'
          inputMode='numeric'
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          aria-label={`Dígito ${i + 1}`}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          className={`h-12 w-11 rounded-md border bg-background text-center text-xl font-semibold text-foreground
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
            disabled:cursor-not-allowed disabled:opacity-50
            ${error ? 'border-red-500' : 'border-input'}`}
        />
      ))}
    </div>
  )
}
