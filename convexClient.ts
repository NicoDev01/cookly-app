import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;

console.log('[Convex] URL:', convexUrl);
console.log('[Convex] Origin:', typeof window !== 'undefined' ? window.location?.origin : 'server');

export const convexClient = new ConvexReactClient(convexUrl);
