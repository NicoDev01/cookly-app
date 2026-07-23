import { execSync } from 'node:child_process';

for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    execSync('npx cap sync android', { stdio: 'inherit' });
    process.exit(0);
  } catch (error) {
    if (attempt === 2) throw error;
    console.warn('Capacitor-Sync fehlgeschlagen, erneuter Versuch...');
  }
}
