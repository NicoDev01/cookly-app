// Nutzer-Aktivitätsreport aus Convex-Prod: `npm run report:users`
// Schreibt reports/user-activity/report.html (lokal, enthält Vornamen) und pro Tag
// einen Snapshot ohne personenbezogene Daten nach reports/user-activity/snapshots/.
// Liest ganze Tabellen inkl. Rezept-Details → nur bei Bedarf laufen lassen (Convex-Bandbreite).
// Interne Konten: COOKLY_INTERNAL_EMAILS in .env.admin.local (Kommaliste, "@domain" erlaubt).
// Offline mit vorhandenem Export: `--input <ordner>` mit <tabelle>.jsonl-Dateien.

import { execSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aggregate, berlinDay, buildUserRows, SOURCE_TYPES } from "./lib/userActivityMetrics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "reports", "user-activity");
const snapshotDir = path.join(outDir, "snapshots");
const TABLES = ["users", "recipes", "analyticsEvents", "weeklyMeals", "shoppingItems", "authAccounts"];
const LIMIT = 10_000;

const parseJsonl = (text) => text.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));

const inputIndex = process.argv.indexOf("--input");
const inputDir = inputIndex > -1 ? path.resolve(process.argv[inputIndex + 1]) : null;

async function loadTable(table) {
  if (inputDir) return parseJsonl(await readFile(path.join(inputDir, `${table}.jsonl`), "utf8"));
  // Tabellennamen sind Konstanten, daher ist der Befehlsstring sicher (npx braucht unter Windows eine Shell).
  const output = execSync(`npx convex data ${table} --prod --limit ${LIMIT} --format jsonl`, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const rows = parseJsonl(output);
  if (rows.length >= LIMIT) console.warn(`Warnung: ${table} hat ${LIMIT}+ Einträge, Export ist abgeschnitten.`);
  return rows;
}

async function loadHistory() {
  const files = (await readdir(snapshotDir).catch(() => [])).filter((file) => file.endsWith(".json")).sort();
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(snapshotDir, file), "utf8"))));
}

const data = {};
for (const table of TABLES) {
  process.stdout.write(`Lade ${table} … `);
  data[table] = await loadTable(table);
  console.log(data[table].length);
}

const now = Date.now();
const internalEmails = (process.env.COOKLY_INTERNAL_EMAILS ?? "")
  .split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
const rows = buildUserRows({ ...data, events: data.analyticsEvents, internalEmails, now });
const summaries = { external: aggregate(rows.filter((row) => !row.internal)), all: aggregate(rows) };
const today = berlinDay(now);

await mkdir(snapshotDir, { recursive: true });
await writeFile(path.join(snapshotDir, `${today}.json`), JSON.stringify({ date: today, ...summaries }, null, 2));

const payload = { generatedAt: now, today, sourceTypes: SOURCE_TYPES, rows, summaries, history: await loadHistory() };
const template = await readFile(path.join(root, "scripts", "lib", "userActivityReport.html"), "utf8");
const html = template.replace("/*__REPORT_DATA__*/null", JSON.stringify(payload).replace(/</g, "\\u003c"));
const reportPath = path.join(outDir, "report.html");
await writeFile(reportPath, html);

const external = summaries.external;
console.log(`\n${external.users} externe Nutzer, ${external.activeLast7d} aktiv (7 Tage), ${external.recipes} Rezepte.`);
console.log(`Report: ${reportPath}`);
