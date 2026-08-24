/**
 * Sammelt alle Material-Symbols-Namen, die die App zur Laufzeit rendern kann.
 *
 * Hintergrund: Der Icon-Font wird lokal gebundelt und dabei auf die tatsächlich
 * benutzten Glyphen subsettet (siehe scripts/sync-fonts.mjs). Fehlt ein Name im
 * Subset, rendert die WebView statt des Icons den rohen Ligatur-Text
 * ("restaurant_menu") und das Layout kippt. Dieser Scanner ist deshalb die
 * einzige Quelle der Wahrheit dafür, was in den Font muss - sowohl beim
 * Erzeugen (sync-fonts) als auch beim Prüfen (check-fonts) im Build.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'android', '.git', 'graphify-out',
  'build', 'coverage', 'admin-dashboard',
]);
const SOURCE_EXT = /\.(tsx|ts|jsx|js|mjs)$/;

/** Zusätzliche Namen, die kein Scanner sehen kann (z.B. zur Laufzeit gebaute Strings). */
export const EXTRA_ICONS_FILE = join(ROOT, 'assets/fonts/extra-icons.json');

const listSourceFiles = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listSourceFiles(full, out);
    else if (SOURCE_EXT.test(entry)) out.push(full);
  }
  return out;
};

const NAME = /^[a-z][a-z0-9_]*$/;

const stringsIn = (text) => {
  const found = [];
  for (const m of text.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
    const value = m[1] ?? m[2];
    if (NAME.test(value)) found.push(value);
  }
  return found;
};

/**
 * @returns {Map<string, Set<string>>} Icon-Name -> Fundstellen
 */
export const collectIconNames = () => {
  const hits = new Map();
  const add = (name, source) => {
    if (!NAME.test(name)) return;
    if (!hits.has(name)) hits.set(name, new Set());
    hits.get(name).add(source);
  };

  for (const file of listSourceFiles(ROOT)) {
    const src = readFileSync(file, 'utf8');
    const rel = file.slice(ROOT.length + 1).split('\\').join('/');

    // A) Kindinhalt jedes Elements mit .material-symbols-outlined.
    //    Deckt <span ...>add</span> ebenso ab wie {cond ? 'a' : 'b'} und {x || 'circle'}.
    for (const m of src.matchAll(/material-symbols-outlined[^>]*>([\s\S]{0,200}?)<\//g)) {
      const body = m[1].trim();
      if (NAME.test(body)) add(body, rel);
      else stringsIn(body).forEach((n) => add(n, rel));
    }

    // B) Props, die einen Icon-Namen durchreichen: icon="add", leftIcon={'search'} ...
    for (const m of src.matchAll(/\b(?:icon|leftIcon|rightIcon|iconName|activeIcon)\s*=\s*\{?\s*['"]([a-z0-9_]+)['"]/g)) {
      add(m[1], rel);
    }

    // C) Objekt-Literale: { icon: 'restaurant' }
    for (const m of src.matchAll(/\bicon\s*:\s*['"]([a-z0-9_]+)['"]/g)) {
      add(m[1], rel);
    }

  // D) Bekannte Icon-Sammlungen (Allowlist für KI-Icons, IconDropdown-Auswahl ...).
  //    Deren Werte landen über Umwege im DOM und sind für A-C unsichtbar.
  //    Das Set darf auch generisch sein: MATERIAL_SYMBOLS_ALLOWLIST ist
  //    `new Set<string>([...])` - ohne `<...>`-Toleranz würde genau diese
  //    Quelle unsichtbar bleiben und Icons fehlen im Subset.
  const collection = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*(?:ICON|ICONS|ALLOWLIST|SYMBOLS))\b[^=]*=\s*(?:new\s+Set(?:\s*<[^>]*>)?\(\s*)?\[([\s\S]*?)\]/g;
    for (const m of src.matchAll(collection)) {
      stringsIn(m[2]).forEach((n) => add(n, `${rel} (${m[1]})`));
    }
  }

  if (existsSync(EXTRA_ICONS_FILE)) {
    const extra = JSON.parse(readFileSync(EXTRA_ICONS_FILE, 'utf8'));
    for (const name of extra.icons ?? []) add(name, 'assets/fonts/extra-icons.json');
  }

  return hits;
};
