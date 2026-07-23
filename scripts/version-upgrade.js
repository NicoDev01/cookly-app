#!/usr/bin/env node

/**
 * Cookly Auto-Version & Build Script
 *
 * Usage:
 *   node scripts/version-upgrade.js [type]
 *
 * Types:
 *   patch   - 1.0.0 → 1.0.1 (Bugfixes)
 *   minor   - 1.0.0 → 1.1.0 (New Features)
 *   major   - 1.0.0 → 2.0.0 (Breaking Changes)
 *
 * Default: patch
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ============================================================
// CONFIGURATION
// ============================================================
const BUILD_GRADLE_PATH = 'android/app/build.gradle';
const CHANGELOG_PATH = 'CHANGELOG.md';

// Get version type from CLI args
const versionType = process.argv[2] || 'patch';
if (!['build', 'patch', 'minor', 'major'].includes(versionType)) {
  console.error(`Unknown version type: ${versionType}`);
  process.exit(1);
}
const buildOnly = versionType === 'build';

// ============================================================
// VERSION INCREMENT LOGIC
// ============================================================
function incrementVersion(version, type) {
  const parts = version.split('.').map(Number);

  switch (type) {
    case 'major':
      return [parts[0] + 1, 0, 0].join('.');
    case 'minor':
      return [parts[0], parts[1] + 1, 0].join('.');
    case 'patch':
    default:
      return [parts[0], parts[1], parts[2] + 1].join('.');
  }
}

// ============================================================
// UPDATE BUILD.GRADLE
// ============================================================
function updateBuildGradle() {
  console.log('📦 Updating build.gradle...');

  const buildGradle = fs.readFileSync(BUILD_GRADLE_PATH, 'utf8');

  // Extract current version
  const currentVersionCode = parseInt(buildGradle.match(/versionCode (\d+)/)[1]);
  const currentVersionName = buildGradle.match(/versionName "([^"]+)"/)[1];

  // Calculate new versions
  const newVersionCode = currentVersionCode + 1;
  const newVersionName = incrementVersion(currentVersionName, versionType);

  console.log(`   versionCode: ${currentVersionCode} → ${newVersionCode}`);
  console.log(`   versionName: ${currentVersionName} → ${newVersionName}`);

  // Update file
  const updated = buildGradle
    .replace(/versionCode \d+/, `versionCode ${newVersionCode}`)
    .replace(/versionName "[^"]+"/, `versionName "${newVersionName}"`);

  fs.writeFileSync(BUILD_GRADLE_PATH, updated);

  return { versionCode: newVersionCode, versionName: newVersionName };
}

// ============================================================
// UPDATE CHANGELOG
// ============================================================
function updateChangelog(versionName) {
  console.log('📝 Updating CHANGELOG.md...');

  const date = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const newEntry = `
## [${versionName}] - ${date}

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---

`;

  let changelog = '';

  if (fs.existsSync(CHANGELOG_PATH)) {
    changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  }

  // Add new entry at the top (after title if exists)
  const title = '# Cookly Changelog\n\n';

  if (!changelog.startsWith('#')) {
    changelog = title + newEntry + changelog;
  } else {
    changelog = changelog.replace(
      /# Cookly Changelog\n\n/,
      title + newEntry
    );
  }

  fs.writeFileSync(CHANGELOG_PATH, changelog);

  console.log(`   ✅ Added version ${versionName} to CHANGELOG.md`);
  console.log(`   ⚠️  Remember to fill in the details!`);
}

function preflight() {
  console.log('🔎 Running release checks...');
  execSync('npm test', { stdio: 'inherit' });
  execSync('npm run typecheck', { stdio: 'inherit' });
  execSync('npm run lint:all', { stdio: 'inherit' });
  execSync('npm run ast-grep', { stdio: 'inherit' });
}

// ============================================================
// BUILD APP
// ============================================================
function buildApp() {
  console.log('🔨 Building app...');

  console.log('   → npm run build');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('   → node scripts/sync-android.js');
  execSync('node scripts/sync-android.js', { stdio: 'inherit' });

  const env = { ...process.env };
  if (process.platform === 'win32' && !env.JAVA_HOME) {
    const androidStudioJbr = path.join(env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr');
    if (fs.existsSync(path.join(androidStudioJbr, 'bin', 'java.exe'))) {
      env.JAVA_HOME = androidStudioJbr;
      env.Path = `${path.join(androidStudioJbr, 'bin')};${env.Path || ''}`;
      console.log(`   → JAVA_HOME: ${androidStudioJbr}`);
    }
  }

  const isWindows = process.platform === 'win32';
  const gradleCmd = isWindows
    ? 'cd android && gradlew.bat bundleRelease'
    : 'cd android && ./gradlew bundleRelease';

  console.log(`   → ${gradleCmd}`);
  execSync(gradleCmd, { stdio: 'inherit', shell: true, env });

  console.log('   ✅ Build successful!');
}

// ============================================================
// MAIN
// ============================================================
console.log('╔════════════════════════════════════════════════╗');
console.log('║   Cookly Auto-Version & Build Script          ║');
console.log('╚════════════════════════════════════════════════╝');
console.log('');
console.log(`Version Type: ${buildOnly ? 'BUILD' : versionType.toUpperCase()}`);
console.log('');

const originalBuildGradle = fs.readFileSync(BUILD_GRADLE_PATH, 'utf8');
const changelogExisted = fs.existsSync(CHANGELOG_PATH);
const originalChangelog = changelogExisted ? fs.readFileSync(CHANGELOG_PATH, 'utf8') : '';
let versionChanged = false;

try {
  preflight();

  const currentBuildGradle = fs.readFileSync(BUILD_GRADLE_PATH, 'utf8');
  versionChanged = !buildOnly;
  const release = buildOnly
    ? {
        versionCode: parseInt(currentBuildGradle.match(/versionCode (\d+)/)[1]),
        versionName: currentBuildGradle.match(/versionName "([^"]+)"/)[1],
      }
    : updateBuildGradle();

  if (!buildOnly) {
    updateChangelog(release.versionName);
  }

  // Build app
  buildApp();

  console.log('');
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   ✅ SUCCESS!                                   ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('');
  console.log('📦 New Version:');
  console.log(`   versionCode: ${release.versionCode}`);
  console.log(`   versionName: ${release.versionName}`);
  console.log('');
  console.log('📝 Next Steps:');
  console.log('   1. Edit CHANGELOG.md to add release notes');
  console.log('   2. Test the app locally');
  console.log('   3. Upload to Google Play Console:');
  console.log(`      android/app/build/outputs/bundle/release/app-release.aab`);
  console.log('');

} catch (error) {
  if (versionChanged) {
    fs.writeFileSync(BUILD_GRADLE_PATH, originalBuildGradle);
    if (changelogExisted) fs.writeFileSync(CHANGELOG_PATH, originalChangelog);
    else if (fs.existsSync(CHANGELOG_PATH)) fs.rmSync(CHANGELOG_PATH);
    console.error('↩️  Version und Changelog wurden zurückgesetzt.');
  }
  console.error('');
  console.error('❌ ERROR:', error.message);
  console.error('');
  process.exit(1);
}
