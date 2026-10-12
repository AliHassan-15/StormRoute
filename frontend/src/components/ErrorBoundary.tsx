import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/** Catches render failures and offers a friendly full reset. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "Unexpected application error",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[StormRoute] ErrorBoundary", error, info.componentStack);
    }
  }

  private reset = () => {
    this.setState({ hasError: false, message: "" });
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-bg p-6"
        role="alert"
        data-testid="error-boundary"
      >
        <div className="w-full max-w-md space-y-4 rounded-[var(--radius-panel)] border border-border bg-surface p-6 shadow-panel">
          <h1 className="text-lg font-semibold text-text">Something went wrong</h1>
          <p className="text-sm text-text-muted">
            StormRoute hit an unexpected error. Your form data in this browser is
            usually still saved — reset to continue planning.
          </p>
          <p className="font-mono text-xs text-text-muted">{this.state.message}</p>
          <Button type="button" onClick={this.reset}>
            Reset application
          </Button>
        </div>
      </div>
    );
  }
}
