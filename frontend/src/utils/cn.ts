type ClassValue =
  | string
  | number
  | boolean
  | undefined
  | null
  | Record<string, boolean | undefined | null>
  | ClassValue[]

export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = []

  const flatten = (input: ClassValue): void => {
    if (input == null || input === false || input === '') {
      return
    }

    if (typeof input === 'string' || typeof input === 'number') {
      classes.push(String(input))
      return
    }

    if (Array.isArray(input)) {
      input.forEach(flatten)
      return
    }

    if (typeof input === 'object') {
      Object.entries(input).forEach(([key, value]) => {
        if (value) {
          classes.push(key)
        }
      })
    }
  }

  inputs.forEach(flatten)
  return classes.join(' ')
}
