import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] render failure", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-8">
        <div className="w-full max-w-xl rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-red-600">Something broke</p>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">
            The app hit an unexpected error.
          </h1>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
            {String(this.state.error.message || this.state.error)}
          </pre>
          <p className="mt-3 text-sm text-slate-600">
            Reload the page, or return to the dashboard. Please share the message above with the
            Administrator — it's been logged on the server with a correlation ID.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-medium"
            >
              Reload
            </button>
            <button
              onClick={this.reset}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }
}
