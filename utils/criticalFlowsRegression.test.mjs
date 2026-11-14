import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildKeywords,
  createIngredientTextPattern,
  createKeywordPattern,
  mergeAdjacentIngredientMatches,
} from "./ingredientKeywordPattern.ts";
import { createUuid } from "./uuid.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("UUID generation works without crypto.randomUUID", () => {
  const uuid = createUuid({
    getRandomValues: (bytes) => {
      bytes.fill(0xab);
      return bytes;
    },
  });

  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("Android client paths use the compatible UUID helper", async () => {
  const paths = [
    "services/analytics.ts",
    "components/PushLifecycle.tsx",
    "components/AddRecipeModal.tsx",
    "pages/ProfilePage.tsx",
    "pages/ShareTargetPage.tsx",
  ];

  for (const path of paths) assert.doesNotMatch(await source(path), /crypto\.randomUUID/);
});

test("instruction ingredient pills toggle their amount", async () => {
  const recipePage = await source("pages/RecipePage.tsx");
  const instructions = await source("components/Instructions.tsx");
  const keywordPattern = await source("utils/ingredientKeywordPattern.ts");

  assert.match(recipePage, /current === index \? null : index/);
  assert.match(instructions, /createIngredientTextPattern/);
  assert.match(keywordPattern, /words\.filter\(\(word\) => !STOP_WORDS\.has\(word\.toLowerCase\(\)\)\)/);
  assert.match(instructions, /isHighlighted && amount \? ` \$\{amount\}` : ''/);
  assert.doesNotMatch(instructions, /right-full/);
  assert.match(instructions, /py-px/);
});

test("multiword ingredient pills keep inflected descriptors together", () => {
  const matches = (ingredient, text) => new RegExp(
    `^${createKeywordPattern(ingredient)}[a-zA-Z0-9_\\u00C0-\\u00FF]*$`,
    "i",
  ).test(text);

  assert.equal(matches("gehobelter Rotkohl", "gehobelten Rotkohl"), true);
  assert.equal(matches("rote Zwiebel", "roter Zwiebel"), true);
  assert.equal(matches("frische Minze", "frischer Minze"), true);
  assert.equal(matches("geräuchertes Paprikapulver", "geräuchertem Paprikapulver"), true);
  assert.equal(matches("veganer Feta", "veganem Feta"), true);
  assert.equal(matches("frische Minze", "frische Petersilie"), false);
});

test("instruction highlighting matches whole words, not fragments of short keywords", () => {
  const highlighted = (keywords, text) => [...text.matchAll(createIngredientTextPattern(keywords))]
    .map((match) => match[0]);

  assert.deepEqual(highlighted(["ei"], "Eine Eimasse aus einer Schüssel"), []);
  assert.deepEqual(highlighted(["ei"], "Das Ei und die Eier verquirlen"), ["Ei", "Eier"]);
  assert.deepEqual(highlighted(["eier"], "Eier trennen, eine Prise Salz"), ["Eier"]);
  assert.deepEqual(highlighted(["öl"], "Öl erhitzen, ölig werden lassen"), ["Öl"]);
  assert.deepEqual(highlighted(["reis", "rei"], "Käse reiben, Reis kochen"), ["Reis"]);
  assert.deepEqual(
    highlighted(["gehackte tomaten", "tomaten", "tomat"], "Die Tomaten zugeben, dann gehackten Tomaten"),
    ["Tomaten", "gehackten Tomaten"],
  );
  assert.deepEqual(highlighted(["knoblauch"], "Knoblauchzehen hacken"), ["Knoblauchzehen"]);
  assert.deepEqual(highlighted(["käse"], "Käse über die Spätzle"), ["Käse"]);
});

test("bracketed notes in ingredient names do not become keywords", () => {
  const ingredients = [
    "Tomate(n) (vollreife, evtl. aus der Dose)",
    "Olivenöl",
    "Salz und Pfeffer",
    "Ei(er)",
    "Petersilie (glatte) und/oder Koriandergrün",
  ].map((name) => ({ name }));
  const pattern = createIngredientTextPattern(buildKeywords(ingredients).map(({ keyword }) => keyword));
  const text = "Olivenöl erhitzen, Tomaten, Salz und Pfeffer dazugeben. 4 Eier aufschlagen. "
    + "Mit Petersilie bestreuen. Den Teig kneten, bis er glatt ist.";

  assert.deepEqual(
    [...text.matchAll(pattern)].map((match) => match[0]),
    ["Olivenöl", "Tomaten", "Salz und Pfeffer", "Eier", "Petersilie"],
  );
});

test("descriptors and short words do not mark the wrong ingredient", () => {
  const names = ["Eier", "Gehackte Tomaten", "Rote Paprika", "Zwiebel", "Petersilie", "Paprikapulver, edelsüß", "Ei"];
  const ingredients = names.map((name) => ({ name }));
  const keywords = buildKeywords(ingredients);
  const pattern = createIngredientTextPattern(keywords.map(({ keyword }) => keyword));
  const text = "In einer Pfanne Öl erhitzen, einen Löffel einrühren. Eine rote Zwiebel und gehackte Petersilie, "
    + "dann die gehackten Tomaten und die rote Paprika. Mit Eis servieren, 4 Eier und das Ei dazu.";
  const hits = [...text.matchAll(pattern)].map((match) => {
    const keyword = keywords[match.slice(1).findIndex(Boolean)];
    return `${match[0]}=${names[keyword.ingredientIndex]}`;
  });

  assert.deepEqual(hits, [
    "Zwiebel=Zwiebel",
    "Petersilie=Petersilie",
    "gehackten Tomaten=Gehackte Tomaten",
    "rote Paprika=Rote Paprika",
    "Eier=Eier",
    "Ei=Ei",
  ]);
});

test("adjacent words belonging to one ingredient render as one pill", () => {
  const text = "schwarze Bohnen und rote Zwiebeln";
  const merged = mergeAdjacentIngredientMatches(text, [
    { start: 0, end: 8, ingredientIndex: 0 },
    { start: 9, end: 15, ingredientIndex: 0 },
    { start: 20, end: 24, ingredientIndex: 1 },
    { start: 25, end: 33, ingredientIndex: 1 },
  ]);

  assert.deepEqual(merged, [
    { start: 0, end: 15, ingredientIndex: 0 },
    { start: 20, end: 33, ingredientIndex: 1 },
  ]);
});

test("recipe carousel keeps its animation and selected slide when recipe state changes", async () => {
  const recipePage = await source("pages/RecipePage.tsx");

  assert.match(recipePage, /const activeRecipeIdRef = useRef\(routeRecipeId\)/);
  assert.match(recipePage, /window\.history\.replaceState\([\s\S]*?window\.history\.state,[\s\S]*?`#\/recipe\/\$\{recipeId\}`/);
  assert.match(recipePage, /const sourceRecipeIds =[\s\S]*?const recipeIds = useMemo/);
  assert.match(recipePage, /\}, \[sourceRecipeIds\]\);/);
  assert.doesNotMatch(recipePage, /navigate\(`\/recipe\/\$\{recipeId\}`/);
  assert.doesNotMatch(recipePage, /emblaApi\.scrollTo\(initialIndex\)/);
});

test("analytics user sync cannot loop on user updates", async () => {
  const lifecycle = await source("components/AnalyticsLifecycle.tsx");
  const users = await source("convex/users.ts");

  assert.match(lifecycle, /syncedUser\.current === user\._id/);
  assert.match(lifecycle, /\[user\?\._id, touchActivity, recordAttribution\]/);
  assert.match(users, /sameAttributionTouch\(user\.acquisitionLastTouch, args\.touch\)/);
  assert.match(
    users,
    /sameAttributionTouch\(user\.acquisitionLastTouch, args\.touch\)[\s\S]*?\)\s*\{\s*return;/,
  );
});

test("native Google OAuth preserves verifier and callback contract", async () => {
  const oauth = await source("services/googleOAuth.ts");
  const deepLink = await source("services/deepLinkHandler.ts");
  const app = await source("App.tsx");

  assert.match(oauth, /com\.cookly\.recipe:\/\/auth-callback/);
  assert.match(oauth, /api\.auth\.signIn/);
  assert.ok(
    oauth.indexOf("localStorage.setItem(VERIFIER_KEY") <
      oauth.indexOf("Browser.open"),
  );
  assert.match(deepLink, /navigate\(`\/auth-callback\$\{params\}`\)/);
  assert.match(app, /signIn\(['"]google['"], \{ code \}\)/);
});

test("account deletion remains awaited and server-owned", async () => {
  const profile = await source("pages/ProfilePage.tsx");
  const deletion = await source("convex/accountDeletion.ts");

  assert.match(profile, /await requestAccountDeletion\(/);
  assert.match(deletion, /deleteLocalData/);
  assert.match(deletion, /authAccounts/);
  assert.match(deletion, /authSessions/);
});

test("Sentry keeps the original backend error message", async () => {
  const observability = await source("services/observability.ts");

  assert.match(observability, /source\?\.message/);
  assert.match(observability, /\$\{fallback\}: \$\{detail\}/);
});

test("import tracking stores no Convex-reserved PostHog fields", async () => {
  const imports = await source("convex/importOperations.ts");
  const integrations = await source("convex/integrations.ts");

  assert.doesNotMatch(imports, /\$set\s*:/);
  assert.match(imports, /personProperties: \{ plan:/);
  assert.match(integrations, /\$set: personProperties/);
});

test("imported images are proxied by the backend, not UI lifecycles", async () => {
  const imports = await source("convex/importOperations.ts");
  const shareTarget = await source("pages/ShareTargetPage.tsx");
  const weekly = await source("pages/WeeklyPage.tsx");

  assert.match(imports, /scheduler\.runAfter\(0, internal\.remoteImages\.proxyImportedImage/);
  assert.doesNotMatch(shareTarget, /proxyExternalImage/);
  assert.doesNotMatch(weekly, /proxyExternalImages/);
});

test("website imports never persist an empty fallback recipe", async () => {
  const website = await source("convex/website.ts");

  assert.match(website, /runWithGeminiModelFallback/);
  assert.match(website, /INCOMPLETE_RECIPE/);
  assert.match(website, /NO_RECIPE_CONTENT/);
  assert.doesNotMatch(website, /ingredients:\s*\[\],[\s\S]*instructions:\s*\[\]/);
});

test("instruction highlighting builds keywords once and scans each text once", async () => {
  const instructions = await source("components/Instructions.tsx");

  assert.match(instructions, /useMemo\(\(\) => buildKeywords\(ingredients\)/);
  assert.match(instructions, /text\.matchAll\(matcher\)/);
  assert.doesNotMatch(instructions, /uniqueKeywords\.forEach/);
});

test("fast imports reveal compactly and pasting a valid link imports right away", async () => {
  const shareTarget = await source("pages/ShareTargetPage.tsx");
  const sheet = await source("components/addRecipe/AddRecipeSheet.tsx");

  // Pace is chosen once when the result arrives, from the time since the import started.
  assert.match(shareTarget, /setRevealPace\(Date\.now\(\) - startedAt < FAST_IMPORT_MS \? COMPACT_REVEAL : FULL_REVEAL\)/);
  assert.match(shareTarget, /COMPACT_REVEAL: RevealPace = \{[^}]*ingredientStagger: 25[^}]*stepStagger: 50[^}]*doneHold: 500/);
  assert.match(shareTarget, /FULL_REVEAL: RevealPace = \{[^}]*ingredientStagger: 70[^}]*stepStagger: 140[^}]*doneHold: 1_400/);
  assert.match(sheet, /const pastedTarget = detectImportTarget\(text\);\s*if \(pastedTarget\) onImport\(pastedTarget\.url\);/);
});
