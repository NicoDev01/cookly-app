import React, { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * SSOBouncerPage - "Bouncer" Seite für OAuth Redirect
 * 
 * Diese Seite wird von Clerk nach erfolgreicher OAuth-Authentifizierung aufgerufen.
 * Sie leitet den Browser sofort zur nativen App weiter (Bouncer Pattern).
 * 
 * Flow:
 * 1. Clerk OAuth erfolgreich → Redirect zu https://cookly.recipe/sso-callback
 * 2. Diese Seite lädt → leitet sofort zu cooklyrecipe://oauth-callback weiter
 * 3. Capacitor Deep Link Handler fängt den Link ab → navigiert zu /sso-callback
 * 
 * WICHTIG: Diese Seite muss für Clerk als "Allowed Redirect URL" konfiguriert sein!
 */
export const SSOBouncerPage: React.FC = () => {
  useEffect(() => {
    // Hole alle Query-Parameter, die Clerk an die URL gehängt hat
    const searchParams = window.location.search;
    
    console.log('[SSOBouncer] Loading, redirecting to native app with params:', searchParams);
    
    // Bestimme die native URL basierend auf der Plattform
    let nativeUrl: string;
    
    if (Capacitor.isNativePlatform()) {
      // Native App: Verwende Custom URL Scheme
      nativeUrl = `cooklyrecipe://oauth-callback${searchParams}`;
    } else {
      // Web: Weiterleitung zur Hash-Route
      nativeUrl = `/#/sso-callback${searchParams}`;
    }
    
    // Leite den Browser sofort zur nativen App weiter
    // Verwendung von replace() statt assign() um Browser-History zu ersetzen
    window.location.replace(nativeUrl);
  }, []);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f0f2f5'
    }}>
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: '1rem',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        maxWidth: '90%'
      }}>
        <div style={{ 
          width: '3rem', 
          height: '3rem', 
          border: '3px solid #b2c8ba', 
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem'
        }} />
        
        <p style={{ 
          color: '#374151', 
          fontSize: '1.125rem',
          margin: 0
        }}>
          Du wirst zur App weitergeleitet...
        </p>
        
        <p style={{ 
          color: '#9ca3af', 
          fontSize: '0.875rem',
          marginTop: '0.5rem'
        }}>
          Bitte warte einen Moment
        </p>
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SSOBouncerPage;
