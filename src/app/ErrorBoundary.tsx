import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  fout: Error | null
}

/**
 * Zonder dit betekent één kapotte render een wit scherm. Voor iemand die
 * niet weet wat een browser is, is dat het einde van de app.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { fout: null }

  static getDerivedStateFromError(fout: Error): State {
    return { fout }
  }

  componentDidCatch(fout: Error) {
    console.error('Thuis liep vast:', fout)
  }

  render() {
    if (!this.state.fout) return this.props.children

    return (
      <main className="mx-auto max-w-[32rem] px-5 py-12">
        <p className="text-5xl" aria-hidden="true">
          🔧
        </p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Er ging iets mis</h1>
        <p className="mt-2 text-lg text-ink-soft">
          Probeer het opnieuw. Blijft het misgaan, laat het dan weten aan je familie.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="mt-6 flex min-h-[3.4rem] w-full items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white"
        >
          Opnieuw proberen
        </button>

        <details className="mt-8 text-sm text-ink-faint">
          <summary className="cursor-pointer">Technische details</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{this.state.fout.message}</pre>
        </details>
      </main>
    )
  }
}
