import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean, error?: any }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#842029', background: '#f8d7da', border: '1px solid #f5c2c7', borderRadius: 8 }}>
          <b>Something went wrong.</b>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>{String(this.state.error?.message || this.state.error)}</div>
        </div>
      )
    }
    return this.props.children as any
  }
}


