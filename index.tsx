import React, { Component, ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { HashRouter, useNavigate } from "react-router-dom";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key");
}

// Convex URL aus Umgebungsvariablen
const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL environment variable");
}

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
    console.error("Uncaught error:", error, errorInfo);
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

    return (this as any).props.children;
  }
}

// --- App Initialization ---

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Erstelle Convex Client einmalig
const convexClient = new ConvexReactClient(convexUrl);

// Clerk Konfiguration für Capacitor mit Deep Link Support
function ClerkProviderWithNavigate({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/tabs/categories"
      signUpFallbackRedirectUrl="/tabs/categories"
      routerPush={(to) => {
        navigate(to);
      }}
      routerReplace={(to) => {
        navigate(to, { replace: true });
      }}
    >
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <ClerkProviderWithNavigate>
          <App />
        </ClerkProviderWithNavigate>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
