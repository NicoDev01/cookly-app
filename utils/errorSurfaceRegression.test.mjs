import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const uiFiles = [
  'pages/SignUpPage.tsx',
  'pages/ForgotPasswordPage.tsx',
  'pages/ProfilePage.tsx',
  'pages/SubscribePage.tsx',
  'pages/WeeklyPage.tsx',
  'components/AddRecipeModal.tsx',
  'pages/ShareTargetPage.tsx',
];

test('user-facing surfaces do not use browser alert dialogs', () => {
  for (const file of uiFiles) {
    const source = readFileSync(file, 'utf8');
    assert.equal(source.includes('alert('), false, `${file} still uses alert()`);
  }
});

test('auth pages do not render raw caught Error.message values', () => {
  for (const file of ['pages/SignUpPage.tsx', 'pages/ForgotPasswordPage.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.equal(source.includes('errorMessage = err.message'), false, `${file} still exposes raw err.message`);
  }
});

test('recipe import surfaces do not concatenate raw error strings into visible messages', () => {
  for (const file of ['components/AddRecipeModal.tsx', 'pages/ShareTargetPage.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.equal(source.includes(' + getErrorMessage(err)'), false, `${file} still appends raw error text`);
    assert.equal(source.includes('setError(msg ||'), false, `${file} still renders raw msg fallback`);
    assert.equal(source.includes('Fehler beim Speichern: " + errorMessage'), false, `${file} still appends raw save error`);
  }
});

test('production observability is optional, source-mapped and privacy-minimal', () => {
  const entry = readFileSync('index.tsx', 'utf8');
  const sentry = readFileSync('services/observability.ts', 'utf8');
  const vite = readFileSync('vite.config.ts', 'utf8');

  assert.match(entry, /^import "\.\/services\/observability";/);
  assert.match(sentry, /dsn && env\?\.PROD/);
  assert.match(sentry, /sendDefaultPii: false/);
  assert.match(sentry, /tracesSampleRate: 0/);
  assert.match(sentry, /replaysSessionSampleRate: 0/);
  assert.match(sentry, /delete event\.(user|request|extra|contexts)/);
  assert.doesNotMatch(sentry, /setUser|setExtra|entry\.data\s*[,}]/);
  assert.match(vite, /process\.env\.SENTRY_AUTH_TOKEN/);
  assert.match(vite, /sourcemap: sentryUpload \? 'hidden' : false/);
  assert.match(vite, /filesToDeleteAfterUpload: '\.\/dist\/\*\*\/\*\.map'/);
});

test('only operationally critical client errors are marked fatal', () => {
  const sentry = readFileSync('services/observability.ts', 'utf8');
  const profile = readFileSync('pages/ProfilePage.tsx', 'utf8');

  assert.match(sentry, /criticalScopes = new Set\(\["AccountDeletion", "Billing", "Boot", "ErrorBoundary", "Global"\]\)/);
  assert.match(sentry, /scope\.setLevel\(criticalScopes\.has\(entry\.scope\) \? "fatal" : "error"\)/);
  assert.match(profile, /logger\.error\('AccountDeletion', 'Delete account failed', error\)/);
});

test('expected auth failures and local notification failures do not create Sentry issues', () => {
  const notifications = readFileSync('utils/notifications.ts', 'utf8');
  const authFiles = [
    'pages/SignInPage.tsx',
    'pages/SignUpPage.tsx',
    'pages/ForgotPasswordPage.tsx',
    'pages/WelcomePage.tsx',
  ];

  assert.match(notifications, /MAX_ANDROID_NOTIFICATION_ID = 2_147_483_647/);
  assert.doesNotMatch(notifications, /id: Date\.now\(\)/);
  assert.match(notifications, /smallIcon: 'ic_stat_recipe_import'/);
  assert.doesNotMatch(notifications, /largeIcon:/);
  assert.match(notifications, /title: 'Rezept erfolgreich importiert'/);
  assert.doesNotMatch(notifications, /logger\.error\('Notifications'/);

  for (const file of authFiles) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /logger\.error\('Auth', '(Password sign-in|Sign-up|Email verification|Send reset code|Reset password|Google OAuth)/);
  }
});
