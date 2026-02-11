import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: './',  // Wichtig für Hash-Routing
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      hmr: {
        overlay: true,
      },
    },
    plugins: [
      react(),
    ],
    build: {
      chunkSizeWarningLimit: 1000, // Warnschwelle auf 1MB erhöhen
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // 1. Schwere Core-Blöcke (Auth & Backend)
              if (id.includes('@clerk')) {
                return 'vendor-clerk';
              }
              if (id.includes('convex')) {
                return 'vendor-convex';
              }
              
              // 2. Schwere Feature-Bibliotheken (Lazy geladen)
              if (id.includes('@google/genai')) {
                return 'vendor-ai';
              }
              if (id.includes('html2canvas')) {
                return 'vendor-utils-large';
              }
              
              // 3. UI & Icons
              if (id.includes('lucide-react') || id.includes('react-icons')) {
                return 'vendor-icons';
              }
              if (id.includes('@radix-ui')) {
                return 'vendor-radix';
              }
              
              // 4. Alles andere (React, Router, Virtuoso etc.)
              return 'vendor-base';
            }
          },
        },
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
