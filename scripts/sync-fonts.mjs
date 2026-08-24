/**
 * Lädt die App-Fonts von Google Fonts herunter und legt sie lokal ab.
 *
 * Warum: Wurden die Fonts zur Laufzeit von fonts.googleapis.com geladen, sah
 * die App bei jedem Kaltstart mit leerem WebView-Cache kurz kaputt aus -
 * Text in Fallback-Schrift, und Material-Symbols-Ligaturen als roher Text
 * ("restaurant_menu") statt als Icon, was das Layout zerreißt. Offline startete
 * die App dauerhaft so. Lokal gebundelt gibt es weder Netzwerk noch Cache-Miss.
 *
 * Der Icon-Font wird dabei auf die tatsächlich benutzten Glyphen subsettet
 * (3,8 MB -> ~60 KB). Welche das sind, bestimmt scripts/lib/collect-icon-names.mjs.
 *
 * Aufruf:  npm run fonts:sync
 * Prüfung: npm run fonts:check  (läuft im Build, siehe scripts/check-fonts.mjs)
 *
 * Die erzeugten .woff2-Dateien gehören ins Repo - ein normaler Build braucht
 * dadurch kein Netz.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { collectIconNames, ROOT } from './lib/collect-icon-names.mjs';

const FONT_DIR = join(ROOT, 'assets/fonts');
const CSS_FILE = join(ROOT, 'styles/fonts.css');

// Google liefert nur mit Browser-UA woff2 statt ttf.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Achsen-Ranges müssen zu index.css passen (font-variation-settings FILL/wght/GRAD/opsz).
const MS_AXES = 'opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
const CODEPOINTS_URL =
  'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/' +
  'MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints';

const get = async (url, as = 'text') => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} für ${url}`);
  return as === 'text' ? res.text() : Buffer.from(await res.arrayBuffer());
};

const kb = (buf) => `${(buf.length / 1024).toFixed(1)} KB`;

/** Zerlegt Google-CSS in [{ subset, unicodeRange, url }]. */
const parseFontFaces = (css) => {
  const faces = [];
  let subset = null;
  for (const block of css.split('@font-face')) {
    const comment = block.match(/\/\*\s*([a-z-]+)\s*\*\/\s*$/);
    const url = block.match(/url\(([^)]+)\)/)?.[1];
    if (url) {
      faces.push({
        subset: subset ?? 'default',
        url,
        unicodeRange: block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim() ?? null,
      });
    }
    subset = comment?.[1] ?? null;
  }
  return faces;
};

const main = async () => {
  mkdirSync(FONT_DIR, { recursive: true });

  // --- 1. Icon-Namen sammeln und gegen die offizielle Liste validieren -------
  const hits = collectIconNames();
  const codepoints = await get(CODEPOINTS_URL);
  const known = new Set(codepoints.split('\n').map((l) => l.split(' ')[0]).filter(Boolean));

  // Namen aus extra-icons.json sind eine bewusste Setzung und überstimmen die
  // Codepoint-Liste. Ohne diesen Notausgang gäbe es keinen Weg, ein Icon
  // aufzunehmen, das Google im Font führt, in der Codepoint-Datei aber (noch)
  // nicht - es würde still verworfen und der Glyph fehlte zur Laufzeit.
  const isForced = (name) => hits.get(name).has('assets/fonts/extra-icons.json');

  const icons = [];
  const rejected = [];
  for (const name of [...hits.keys()].sort()) {
    if (known.has(name) || isForced(name)) icons.push(name);
    else rejected.push({ name, sources: [...hits.get(name)] });
  }

  if (rejected.length) {
    console.log('Ignoriert (kein gültiges Material Symbol - vermutlich Scanner-Fehlgriff):');
    for (const r of rejected) console.log(`  ${r.name}  <- ${r.sources.join(', ')}`);
    console.log('');
  }
  console.log(`${icons.length} Icons werden in den Font-Subset aufgenommen.`);

  // --- 2. Material Symbols (subsettet) --------------------------------------
  const msCss = await get(
    `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:${MS_AXES}` +
      `&icon_names=${icons.join(',')}`,
  );
  const msFace = parseFontFaces(msCss)[0];
  if (!msFace) throw new Error('Kein @font-face in der Material-Symbols-Antwort');
  const msBuf = await get(msFace.url, 'buffer');
  writeFileSync(join(FONT_DIR, 'material-symbols-outlined.subset.woff2'), msBuf);
  console.log(`  material-symbols-outlined.subset.woff2  ${kb(msBuf)}`);

  // --- 3. Outfit (variable, latin + latin-ext) ------------------------------
  const outfitCss = await get(
    'https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap',
  );
  const outfitFaces = [];
  for (const face of parseFontFaces(outfitCss)) {
    const file = `outfit-${face.subset}.woff2`;
    const buf = await get(face.url, 'buffer');
    writeFileSync(join(FONT_DIR, file), buf);
    console.log(`  ${file}  ${kb(buf)}`);
    outfitFaces.push({ ...face, file });
  }
  if (!outfitFaces.length) throw new Error('Kein @font-face in der Outfit-Antwort');

  // --- 4. styles/fonts.css erzeugen -----------------------------------------
  const lines = [
    '/**',
    ' * GENERIERT von scripts/sync-fonts.mjs - nicht von Hand bearbeiten.',
    ' * Neu erzeugen mit: npm run fonts:sync',
    ' *',
    ' * Lokale Fonts statt fonts.googleapis.com: kein Netzwerk beim App-Start,',
    ' * dadurch kein Flash von Fallback-Schrift und keine als Text gerenderten',
    ' * Icon-Ligaturen beim Kaltstart. Wirkt auch offline.',
    ' */',
    '',
  ];
  for (const face of outfitFaces) {
    lines.push(
      `/* ${face.subset} */`,
      '@font-face {',
      "  font-family: 'Outfit';",
      '  font-style: normal;',
      '  font-weight: 100 900;',
      '  font-display: swap;',
      `  src: url('../assets/fonts/${face.file}') format('woff2');`,
      ...(face.unicodeRange ? [`  unicode-range: ${face.unicodeRange};`] : []),
      '}',
      '',
    );
  }
  lines.push(
    '/* Icon-Font: "block" statt "swap", damit nie der rohe Ligatur-Text',
    '   ("restaurant_menu") anstelle des Icons aufblitzt. */',
    '@font-face {',
    "  font-family: 'Material Symbols Outlined';",
    '  font-style: normal;',
    '  font-weight: 100 700;',
    '  font-display: block;',
    "  src: url('../assets/fonts/material-symbols-outlined.subset.woff2') format('woff2');",
    '}',
    '',
  );
  writeFileSync(CSS_FILE, lines.join('\n'));
  console.log(`  styles/fonts.css  (${outfitFaces.length + 1} @font-face)`);

  // --- 5. Manifest für den Build-Guard --------------------------------------
  // `ignored` festhalten, damit check-fonts Scanner-Fehlgriffe nicht bei jedem
  // Build erneut anmeckert - nur wirklich neue Icons sollen den Build stoppen.
  const payload = {
    generatedAt: new Date().toISOString(),
    axes: MS_AXES,
    icons,
    ignored: rejected.map((r) => r.name),
  };
  writeFileSync(join(FONT_DIR, 'manifest.json'), `${JSON.stringify(payload, null, 2)}\n`);
  console.log('  assets/fonts/manifest.json');
};

main().catch((err) => {
  console.error(`\nfonts:sync fehlgeschlagen: ${err.message}`);
  process.exit(1);
});
