import React from "react";
import { reportClientError } from "../lib/observatory";

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * App-level error boundary. Reports React render crashes to the CLAW Observatory
 * (window handlers don't catch render errors) and shows a recoverable fallback
 * instead of a white screen.
 */
export default class ObservatoryErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportClientError(
      error?.message || "React render error",
      `${error?.stack || ""}\n\nComponentStack:${info?.componentStack || ""}`,
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen grid place-items-center bg-[#07111f] text-white p-6">
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <h1 className="text-lg font-black">Something went wrong</h1>
          <p className="mt-2 text-sm text-white/60">
            This screen hit an error. Our team has been notified automatically.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl border border-white/15 bg-white/8 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/15"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
