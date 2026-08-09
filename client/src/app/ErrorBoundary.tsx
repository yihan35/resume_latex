import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch() {}

  override render() {
    if (this.state.error !== null) {
      return (
        <main className="app-error" role="alert">
          <h1>Resume editor could not start</h1>
          <p>{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} type="button">
            Reload editor
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
