import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// App-Version aus der Single Source (android/app/build.gradle) lesen – nur die
// Version, KEINE Secrets. Wird als __APP_VERSION__ injiziert (Debug-Menü und Sentry-Release).
const readAndroidVersion = () => {
  try {
    const gradle = fs.readFileSync(path.resolve(__dirname, 'android/app/build.gradle'), 'utf8');
    return {
      version: gradle.match(/versionName "([^"]+)"/)?.[1] ?? 'dev',
      build: gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 'dev',
    };
  } catch {
    return { version: 'dev', build: 'dev' };
  }
};

export default defineConfig(() => {
  const { version: appVersion, build: appBuild } = readAndroidVersion();
  const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN);

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD__: JSON.stringify(appBuild),
    },
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
      ...(sentryUpload ? [sentryVitePlugin({
        org: 'aimpact-oc',
        project: 'cookly-react',
        telemetry: false,
        release: { name: `cookly@${appVersion}` },
        sourcemaps: { filesToDeleteAfterUpload: './dist/**/*.map' },
      })] : []),
    ],
    build: {
      sourcemap: sentryUpload ? 'hidden' : false,
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
              if (id.includes('posthog-js')) {
                return 'vendor-posthog';
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
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
