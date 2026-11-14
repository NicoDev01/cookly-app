import { ConvexReactClient } from "convex/react";
import { hasStoredAuthToken } from "./services/offlineCache";

export const convexUrl = import.meta.env.VITE_CONVEX_URL as string;

console.log('[Convex] URL:', convexUrl);
console.log('[Convex] Origin:', typeof window !== 'undefined' ? window.location?.origin : 'server');

// Angemeldet gestartet: Anfragen zurückhalten, bis der Token gesendet ist. Die App rendert dann schon aus dem
// Lese-Cache (services/offlineCache), und keine Query läuft vorher ohne Login in "Not authenticated".
export const convexClient = new ConvexReactClient(convexUrl, { expectAuth: hasStoredAuthToken(convexUrl) });
