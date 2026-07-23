import "./services/observability";
import React, { ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { HashRouter } from "react-router-dom";
import { convexClient } from "./convexClient";
import { logger } from "./utils/logger";

// --- Error Boundary Component ---
interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("Boot", "Uncaught error at root boundary", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 font-sans text-gray-800">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-lg w-full border-l-4 border-red-500">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Etwas ist schiefgelaufen
            </h1>
            <p className="mb-4 text-gray-600">
              Die Anwendung konnte nicht geladen werden.
            </p>
            <div className="bg-gray-100 p-4 rounded text-sm overflow-auto mb-6 border border-gray-300">
              <code className="text-red-800 font-mono break-all">
                {this.state.error?.message}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 w-full py-2 px-4 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Seite neu laden
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- App Initialization ---

// Global error handlers – feed uncaught issues into the logger ring buffer / Sentry sink.
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Global', 'Unhandled promise rejection', event.reason);
});
window.onerror = (message, source, lineno, colno, error) => {
  logger.error('Global', 'Uncaught error', { message, source, lineno, colno, error });
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConvexAuthProvider client={convexClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </ConvexAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
