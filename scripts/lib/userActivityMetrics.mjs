// Reine Auswertung der Convex-Exporte für den Nutzer-Aktivitätsreport
// (scripts/user-activity-report.mjs). Keine I/O, damit testbar.

export const SOURCE_TYPES = ["instagram", "facebook", "tiktok", "website", "photo", "manual"];

const DAY_MS = 86_400_000;
const IGNORED_EVENTS = new Set(["synthetic_health_check"]);

const berlinFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
export const berlinDay = (ms) => berlinFormat.format(new Date(ms));

const dayToMs = (day) => Date.parse(`${day}T12:00:00Z`);
const daysBetween = (a, b) => Math.round((dayToMs(b) - dayToMs(a)) / DAY_MS);

export function weekStart(day) {
  const date = new Date(`${day}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * DAY_MS).toISOString().slice(0, 10);
}

export function recipeSource(recipe) {
  const url = (recipe.sourceUrl || "").toLowerCase();
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("facebook.com") || url.includes("fb.watch") || url.includes("fb.com")) return "facebook";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url) return "website";
  if (recipe.sourceImageUrl) return "photo";
  return "manual";
}

export function maskEmail(email) {
  if (!email || !email.includes("@")) return "ohne E-Mail";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 3)}***@${domain}`;
}

export function isInternalUser(user, internalEmails) {
  if (!user.email) return true;
  const email = user.email.toLowerCase();
  return internalEmails.some((entry) => entry.startsWith("@") ? email.endsWith(entry) : email === entry);
}

// Ältere Events tragen die ganze Fehlermeldung ("Uncaught Error: {"type":"X",...}") statt des Codes.
export function normalizeErrorCode(raw) {
  if (!raw) return "UNBEKANNT";
  return String(raw).match(/"type"\s*:\s*"([A-Z_]+)"/)?.[1] ?? String(raw).slice(0, 40);
}

const emptySources = () => Object.fromEntries(SOURCE_TYPES.map((source) => [source, 0]));

function segmentOf(row) {
  if (row.activeDayCount === 0) return "never";
  if (row.activeLast7d) return "active";
  if (row.activeDayCount >= 2) return "returned";
  return "once";
}

export function buildUserRows({ users, recipes, events, weeklyMeals, shoppingItems, authAccounts = [], internalEmails = [], now = Date.now() }) {
  const today = berlinDay(now);
  const loginByUser = new Map();
  for (const account of authAccounts) {
    const list = loginByUser.get(account.userId) ?? [];
    if (!list.includes(account.provider)) list.push(account.provider);
    loginByUser.set(account.userId, list);
  }

  // Mehrere Konten mit derselben E-Mail sind dieselbe Person → eine Zeile (ältestes Konto).
  const ordered = [...users].sort((a, b) => (a.createdAt ?? a._creationTime) - (b.createdAt ?? b._creationTime));
  const canonicalByEmail = new Map();
  const canonicalId = new Map();
  for (const user of ordered) {
    const key = user.email?.toLowerCase();
    if (key && canonicalByEmail.has(key)) {
      canonicalId.set(user._id, canonicalByEmail.get(key));
      continue;
    }
    if (key) canonicalByEmail.set(key, user._id);
    canonicalId.set(user._id, user._id);
  }

  const rows = ordered.filter((user) => canonicalId.get(user._id) === user._id).map((user) => ({
    id: user._id,
    accounts: ordered.filter((other) => canonicalId.get(other._id) === user._id).length,
    label: user.name && user.name !== "User" ? user.name : maskEmail(user.email),
    email: maskEmail(user.email),
    internal: isInternalUser(user, internalEmails),
    login: [...new Set(ordered.filter((other) => canonicalId.get(other._id) === user._id)
      .flatMap((other) => loginByUser.get(other._id) ?? []))].join(", ") || "–",
    signupDay: berlinDay(user.createdAt ?? user._creationTime),
    onboardingCompleted: ordered.some((other) => canonicalId.get(other._id) === user._id && other.onboardingCompleted),
    pro: ordered.some((other) => canonicalId.get(other._id) === user._id
      && (other.subscription === "pro_monthly" || other.subscription === "pro_yearly")),
    recipes: 0,
    recipesBySource: emptySources(),
    recipeWeeks: {},
    importsStarted: 0,
    importsFailed: 0,
    importErrors: {},
    weeklyMeals: 0,
    shoppingItems: 0,
    recipesReopened: 0,
    paywallViewed: 0,
    checkoutStarted: 0,
    days: {},
  }));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const byId = new Map([...canonicalId].map(([id, canonical]) => [id, rowById.get(canonical)]));

  const touch = (row, ms, key) => {
    const day = berlinDay(ms);
    row.days[day] ??= { recipes: 0, imports: 0, failed: 0, weekly: 0, shopping: 0, reopened: 0, other: 0 };
    row.days[day][key] += 1;
  };

  for (const recipe of recipes) {
    const row = byId.get(recipe.userId);
    if (!row) continue;
    const createdAt = recipe.createdAt ?? recipe._creationTime;
    const source = recipeSource(recipe);
    const week = weekStart(berlinDay(createdAt));
    row.recipes += 1;
    row.recipesBySource[source] += 1;
    row.recipeWeeks[week] ??= emptySources();
    row.recipeWeeks[week][source] += 1;
    touch(row, createdAt, "recipes");
  }
  for (const meal of weeklyMeals) {
    const row = byId.get(meal.userId);
    if (!row) continue;
    row.weeklyMeals += 1;
    touch(row, meal.createdAt ?? meal._creationTime, "weekly");
  }
  for (const item of shoppingItems) {
    const row = byId.get(item.userId);
    if (!row) continue;
    row.shoppingItems += 1;
    touch(row, item.createdAt ?? item._creationTime, "shopping");
  }
  for (const event of events) {
    const row = event.userId && byId.get(event.userId);
    if (!row || IGNORED_EVENTS.has(event.name)) continue;
    if (event.name === "import_started") {
      row.importsStarted += 1;
      touch(row, event.occurredAt, "imports");
    } else if (event.name === "import_failed") {
      row.importsFailed += 1;
      const code = normalizeErrorCode(event.properties?.errorCode);
      row.importErrors[code] = (row.importErrors[code] ?? 0) + 1;
      touch(row, event.occurredAt, "failed");
    } else if (event.name === "recipe_reopened") {
      row.recipesReopened += 1;
      touch(row, event.occurredAt, "reopened");
    } else {
      if (event.name === "paywall_viewed") row.paywallViewed += 1;
      if (event.name === "checkout_started") row.checkoutStarted += 1;
      touch(row, event.occurredAt, "other");
    }
  }

  for (const row of rows) {
    const activeDays = Object.keys(row.days).sort();
    row.activeDays = activeDays;
    row.activeDayCount = activeDays.length;
    row.lastActiveDay = activeDays.at(-1) ?? null;
    row.daysSinceLastActive = row.lastActiveDay ? daysBetween(row.lastActiveDay, today) : null;
    row.activeLast7d = row.daysSinceLastActive !== null && row.daysSinceLastActive < 7;
    row.activeLast30d = row.daysSinceLastActive !== null && row.daysSinceLastActive < 30;
    row.returnedAfter7d = activeDays.some((day) => daysBetween(row.signupDay, day) >= 7);
    row.usedPlanning = row.weeklyMeals > 0 || row.shoppingItems > 0;
    row.segment = segmentOf(row);
  }
  return rows.sort((a, b) => b.recipes - a.recipes || a.signupDay.localeCompare(b.signupDay));
}

export function aggregate(rows) {
  const count = (predicate) => rows.filter(predicate).length;
  const recipesBySource = emptySources();
  const importErrors = {};
  const weekly = {};
  for (const row of rows) {
    for (const source of SOURCE_TYPES) recipesBySource[source] += row.recipesBySource[source];
    for (const [code, n] of Object.entries(row.importErrors)) importErrors[code] = (importErrors[code] ?? 0) + n;
    for (const [week, sources] of Object.entries(row.recipeWeeks)) {
      weekly[week] ??= emptySources();
      for (const source of SOURCE_TYPES) weekly[week][source] += sources[source];
    }
  }
  const weeks = Object.keys(weekly).sort();
  for (let week = weeks[0]; week && week < weeks.at(-1); ) {
    week = new Date(Date.parse(`${week}T12:00:00Z`) + 7 * DAY_MS).toISOString().slice(0, 10);
    weekly[week] ??= emptySources();
  }
  const importsStarted = rows.reduce((sum, row) => sum + row.importsStarted, 0);
  const importsFailed = rows.reduce((sum, row) => sum + row.importsFailed, 0);
  return {
    users: rows.length,
    activeLast7d: count((row) => row.activeLast7d),
    activeLast30d: count((row) => row.activeLast30d),
    pro: count((row) => row.pro),
    recipes: rows.reduce((sum, row) => sum + row.recipes, 0),
    recipesBySource,
    importsStarted,
    importsFailed,
    importSuccessRate: importsStarted ? (importsStarted - importsFailed) / importsStarted : null,
    importErrors,
    recipesPerWeek: Object.entries(weekly).sort(([a], [b]) => a.localeCompare(b)),
    segments: {
      never: count((row) => row.segment === "never"),
      once: count((row) => row.segment === "once"),
      returned: count((row) => row.segment === "returned"),
      active: count((row) => row.segment === "active"),
    },
    funnel: [
      ["Konto angelegt", rows.length],
      ["Onboarding abgeschlossen", count((row) => row.onboardingCompleted)],
      ["1. Rezept gespeichert", count((row) => row.recipes >= 1)],
      ["5+ Rezepte", count((row) => row.recipes >= 5)],
      ["An 2+ Tagen aktiv", count((row) => row.activeDayCount >= 2)],
      ["Nach 7+ Tagen zurückgekommen", count((row) => row.returnedAfter7d)],
      ["Wochenplan oder Einkaufsliste genutzt", count((row) => row.usedPlanning)],
      ["Paywall gesehen", count((row) => row.paywallViewed > 0)],
      ["Pro gekauft", count((row) => row.pro)],
    ],
  };
}
