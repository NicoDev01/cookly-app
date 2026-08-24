/**
 * Build-Guard für die lokal gebundelten Fonts.
 *
 * Der Material-Symbols-Font liegt subsettet im Repo. Wird im Code ein Icon
 * benutzt, das nicht im Subset ist, rendert die WebView den rohen Ligatur-Text
 * ("restaurant_menu") statt des Icons - optisch derselbe Schaden, den das
 * lokale Bundling beseitigen sollte, nur seltener und dadurch schwerer zu
 * bemerken. Dieser Check macht das zu einem harten Build-Fehler.
 *
 * Fix bei Fehlschlag: npm run fonts:sync   (und die Font-Dateien mitcommitten)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { collectIconNames, ROOT } from './lib/collect-icon-names.mjs';

const FONT_DIR = join(ROOT, 'assets/fonts');
const REQUIRED_FILES = [
  'assets/fonts/material-symbols-outlined.subset.woff2',
  'assets/fonts/outfit-latin.woff2',
  'styles/fonts.css',
];

const fail = (msg) => {
  console.error(`\nfonts:check fehlgeschlagen:\n${msg}\n\nFix: npm run fonts:sync\n`);
  process.exit(1);
};

const missingFiles = REQUIRED_FILES.filter((f) => !existsSync(join(ROOT, f)));
if (missingFiles.length) fail(`Fehlende Dateien:\n  ${missingFiles.join('\n  ')}`);

const manifestPath = join(FONT_DIR, 'manifest.json');
if (!existsSync(manifestPath)) fail('assets/fonts/manifest.json fehlt.');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const bundled = new Set(manifest.icons ?? []);
if (!bundled.size) fail('manifest.json enthält keine Icons.');

// `ignored` sind Treffer, die fonts:sync gegen die offizielle Material-Symbols-
// Liste geprüft und als Nicht-Icons verworfen hat (der Scanner greift bewusst
// breit und erwischt dabei z.B. String-Literale aus Ternaries). Die dürfen den
// Build nicht blockieren - nur echte neue Namen sollen auffallen.
const ignored = new Set(manifest.ignored ?? []);

const hits = collectIconNames();
const unknown = [...hits.keys()]
  .filter((name) => !bundled.has(name) && !ignored.has(name))
  .sort();

if (unknown.length) {
  const lines = unknown.map((n) => `  ${n}  <- ${[...hits.get(n)].join(', ')}`);
  fail(
    `Diese Namen stehen im Code, aber nicht im Font-Subset:\n${lines.join('\n')}\n\n` +
      'Echte Icons werden dann in den Font aufgenommen, Fehlgriffe des Scanners\n' +
      'landen in manifest.json unter "ignored" und melden sich nicht wieder.',
  );
}

console.log(`fonts:check ok - ${bundled.size} Icons im Subset, alle Fundstellen gedeckt.`);

// Ignorierte Namen bei jedem Build sichtbar auflisten, nicht nur zählen.
// `ignored` ist der einzige Weg, auf dem ein Name still aus dem Subset fallen
// kann: sync-fonts verwirft alles, was nicht in Googles Codepoint-Liste steht -
// normalerweise Scanner-Fehlgriffe, im Ausnahmefall aber ein echtes Icon, das
// die Liste (noch) nicht kennt. Dann fehlt der Glyph, ohne dass etwas bricht.
if (ignored.size) {
  console.log(`  ignoriert (kein bekanntes Material Symbol): ${[...ignored].join(', ')}`);
  console.log('  -> falls hier ein echter Icon-Name auftaucht, gehört er in assets/fonts/extra-icons.json');
}
