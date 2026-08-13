import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='min-h-screen flex items-center justify-center bg-gray-50 p-4'>
          <div className='card w-full max-w-md'>
            <h1 className='text-xl font-bold text-red-700 mb-4'>Algo salio mal</h1>
            <p className='text-sm text-slate-600 mb-4'>
              Ocurrio un error inesperado. Recarga la pagina o vuelve al inicio.
            </p>
            {this.state.error && (
              <pre className='bg-slate-100 p-3 rounded-lg text-xs overflow-auto'>
                {this.state.error.toString()}
              </pre>
            )}
            <a href='/' className='mt-4 block w-full text-center btn-primary'>
              Volver al inicio
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
