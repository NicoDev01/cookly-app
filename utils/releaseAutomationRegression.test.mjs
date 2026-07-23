import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../scripts/version-upgrade.js", import.meta.url), "utf8");

test("release automation validates first and restores version files on failure", () => {
  assert.ok(source.indexOf("preflight();") < source.lastIndexOf("updateBuildGradle()"));
  assert.match(source, /npm test/);
  assert.match(source, /npm run typecheck/);
  assert.match(source, /npm run lint:all/);
  assert.match(source, /node scripts\/sync-android\.js/);
  assert.match(source, /\['build', 'patch', 'minor', 'major'\]\.includes\(versionType\)/);
  assert.equal(source.match(/execSync\('npm run build'/g)?.length, 1);
  assert.match(source, /fs\.writeFileSync\(BUILD_GRADLE_PATH, originalBuildGradle\)/);
  assert.match(source, /fs\.writeFileSync\(CHANGELOG_PATH, originalChangelog\)/);
});
