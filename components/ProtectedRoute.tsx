import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const currentUser = useQuery(api.users.getCurrentUser);

  // Zeige Lade-Indikator während Clerk-Status geprüft wird
  if (!clerkLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-text-secondary-light dark:text-text-secondary-dark">Authentifizierung wird geladen...</p>
        </div>
      </div>
    );
  }

  // Wenn nicht bei Clerk angemeldet → zum Login
  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  // Wenn bei Clerk angemeldet, aber User noch nicht in Convex → kurz warten
  // Webhook synchronisiert den User im Hintergrund
  if (currentUser === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-text-secondary-light dark:text-text-secondary-dark">Benutzerprofil wird eingerichtet...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
