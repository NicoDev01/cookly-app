// Reine Logik für den täglichen Betriebs-Digest (ohne Convex-Imports, damit testbar).

export type DigestData = {
  windowStart: number;
  windowEnd: number;
  users: { total: number; new: number; active: number };
  subscriptions: {
    activeByProvider: Record<string, number>;
    purchases: number;
    cancellations: number;
    expirations: number;
  };
  imports: { started: number; succeeded: number; failed: number; topError?: { code: string; count: number } };
  providerUsage: Array<{ provider: string; day: string; used: number; limit: number }>;
  integrationFailures: Array<{ provider: string; count: number; lastError: string }>;
  failedAccountDeletions: number;
};

export const DIGEST_HOUR_BERLIN = 8;
const IMPORT_FAILURE_THRESHOLD = 0.2;
const IMPORT_MIN_FINISHED = 5;
const PROVIDER_USAGE_THRESHOLD = 0.8;

const lastSundayUtc = (year: number, month: number) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return lastDay.getUTCDate() - lastDay.getUTCDay();
};

// EU-Sommerzeit: letzter Sonntag im März 01:00 UTC bis letzter Sonntag im Oktober 01:00 UTC.
export function berlinOffsetHours(now: number) {
  const year = new Date(now).getUTCFullYear();
  const start = Date.UTC(year, 2, lastSundayUtc(year, 2), 1);
  const end = Date.UTC(year, 9, lastSundayUtc(year, 9), 1);
  return now >= start && now < end ? 2 : 1;
}

export function berlinTime(now: number) {
  const local = new Date(now + berlinOffsetHours(now) * 3_600_000);
  return { date: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

export const isDigestHour = (now: number) => berlinTime(now).hour === DIGEST_HOUR_BERLIN;

export function digestWarnings(data: DigestData): string[] {
  const warnings: string[] = [];
  const finished = data.imports.succeeded + data.imports.failed;
  if (finished >= IMPORT_MIN_FINISHED && data.imports.failed / finished > IMPORT_FAILURE_THRESHOLD) {
    warnings.push(`Import-Fehlerquote ${percent(data.imports.failed / finished)} (${data.imports.failed} von ${finished})`);
  }
  for (const usage of data.providerUsage) {
    if (usage.used / usage.limit > PROVIDER_USAGE_THRESHOLD) {
      warnings.push(`${usage.provider}: Tagesbudget zu ${percent(usage.used / usage.limit)} verbraucht (${usage.used}/${usage.limit})`);
    }
  }
  for (const failure of data.integrationFailures) {
    warnings.push(`${failure.provider}: ${failure.count} fehlgeschlagene Jobs – ${failure.lastError}`);
  }
  if (data.failedAccountDeletions > 0) {
    warnings.push(`${data.failedAccountDeletions} fehlgeschlagene Kontolöschung(en)`);
  }
  return warnings;
}

const percent = (value: number) => `${Math.round(value * 100)} %`;

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PROVIDER_LABELS: Record<string, string> = {
  app_store: "App Store",
  google_play: "Google Play",
  stripe: "Stripe",
  promotional: "Promo",
};

const table = (rows: Array<[string, string | number]>) =>
  `<table cellpadding="4" style="border-collapse:collapse">${rows
    .map(([label, value]) => `<tr><td style="color:#555">${escapeHtml(label)}</td><td><strong>${escapeHtml(String(value))}</strong></td></tr>`)
    .join("")}</table>`;

export function renderDigest(data: DigestData) {
  const { date } = berlinTime(data.windowEnd);
  const warnings = digestWarnings(data);
  const activePro = Object.values(data.subscriptions.activeByProvider).reduce((sum, count) => sum + count, 0);
  const byProvider = Object.entries(data.subscriptions.activeByProvider)
    .map(([provider, count]) => `${PROVIDER_LABELS[provider] ?? provider} ${count}`)
    .join(", ") || "–";

  const sections = [
    warnings.length
      ? `<h3 style="color:#b42318">⚠ Warnungen</h3><ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
      : `<p style="color:#067647"><strong>✓ Keine Warnungen.</strong></p>`,
    `<h3>Nutzer</h3>${table([["Gesamt", data.users.total], ["Neu", data.users.new], ["Aktiv", data.users.active]])}`,
    `<h3>Abos</h3>${table([
      ["Aktive Pro-Abos", `${activePro} (${byProvider})`],
      ["Neue Käufe", data.subscriptions.purchases],
      ["Kündigungen", data.subscriptions.cancellations],
      ["Abgelaufen", data.subscriptions.expirations],
    ])}`,
    `<h3>Imports</h3>${table([
      ["Gestartet", data.imports.started],
      ["Erfolgreich", data.imports.succeeded],
      ["Fehlgeschlagen", data.imports.failed],
      ["Häufigster Fehler", data.imports.topError ? `${data.imports.topError.code} (${data.imports.topError.count}×)` : "–"],
    ])}`,
    `<h3>Externe Dienste (${escapeHtml(data.providerUsage[0]?.day ?? "")}, UTC)</h3>${table(
      data.providerUsage.map((usage) => [usage.provider, `${usage.used} / ${usage.limit}`]),
    )}`,
    `<h3>Integrationen</h3>${data.integrationFailures.length
      ? table(data.integrationFailures.map((failure) => [failure.provider, `${failure.count} Fehler`]))
      : "<p>Keine Fehler.</p>"}`,
  ];

  const subject = `${warnings.length ? `⚠ ${warnings.length} Warnung${warnings.length === 1 ? "" : "en"}` : "✓ Alles ok"} – Cookly ${date}`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;max-width:560px">
<h2>Cookly Digest ${escapeHtml(date)}</h2>
<p style="color:#555">Letzte 24 Stunden. Kommt diese Mail einmal nicht, ist der Digest selbst ausgefallen.</p>
${sections.join("\n")}
</div>`;
  return { subject, html };
}
