import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Catches a crash inside a page so the app shows what went wrong instead of a blank screen.
 * `resetKey` (the current path) clears the error when the user moves to another page.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="mx-auto my-10 max-w-xl rounded-card border border-danger-500/30 bg-white p-6 shadow-card">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-600" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-ink-900">This page could not be shown</p>
            <p className="mt-1 text-[13px] text-ink-600">Please send this message to support:</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-50 p-3 text-xs whitespace-pre-wrap text-danger-700">{String(error?.message || error)}</pre>
            <div className="mt-4 flex gap-2">
              <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-700" onClick={() => window.location.reload()}>
                Reload
              </button>
              <a className="rounded-lg border border-ink-200 px-3 py-1.5 text-[13px] font-medium text-ink-700 hover:bg-ink-50" href="/">
                Go to dashboard
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
