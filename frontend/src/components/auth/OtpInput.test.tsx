import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OtpInput } from './OtpInput'

function renderOtp(props: Partial<Parameters<typeof OtpInput>[0]> = {}) {
  const onChange = props.onChange ?? vi.fn()
  const onComplete = props.onComplete ?? vi.fn()
  render(<OtpInput value={props.value ?? ''} onChange={onChange} onComplete={onComplete} {...props} />)
  const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
  return { boxes, onChange, onComplete }
}

describe('OtpInput', () => {
  it('renderiza 6 casillas vacías', () => {
    const { boxes } = renderOtp()
    expect(boxes).toHaveLength(6)
    expect(boxes.every((b) => b.value === '')).toBe(true)
  })

  it('refleja el valor en las casillas correspondientes', () => {
    const { boxes } = renderOtp({ value: '123' })
    expect(boxes[0].value).toBe('1')
    expect(boxes[2].value).toBe('3')
    expect(boxes[5].value).toBe('')
  })

  it('ignora caracteres no numéricos', () => {
    const { boxes, onChange } = renderOtp()
    fireEvent.change(boxes[0], { target: { value: 'a' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('filtra dígitos de una entrada con letras', () => {
    const { boxes, onChange } = renderOtp()
    fireEvent.change(boxes[0], { target: { value: '1b2' } })
    expect(onChange).toHaveBeenCalledWith('12')
  })

  it('llama onComplete cuando se completa el código', () => {
    const { boxes, onChange, onComplete } = renderOtp()
    fireEvent.change(boxes[0], { target: { value: '123456' } })
    expect(onChange).toHaveBeenCalledWith('123456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('no llama onComplete con código incompleto', () => {
    const { boxes, onComplete } = renderOtp()
    fireEvent.change(boxes[0], { target: { value: '12345' } })
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('el pegado reparte los dígitos en las casillas', () => {
    const { boxes, onChange, onComplete } = renderOtp()
    fireEvent.paste(boxes[0], { clipboardData: { getData: () => '654321' } })
    expect(onChange).toHaveBeenCalledWith('654321')
    expect(onComplete).toHaveBeenCalledWith('654321')
  })

  it('backspace en casilla vacía retrocede y borra la anterior', () => {
    const onChange = vi.fn()
    render(<OtpInput value='12' onChange={onChange} />)
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.keyDown(boxes[2], { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledWith('1')
  })

  it('backspace en casilla con dígito solo borra esa casilla', () => {
    const onChange = vi.fn()
    render(<OtpInput value='12' onChange={onChange} />)
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.keyDown(boxes[1], { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledWith('1')
  })
})
