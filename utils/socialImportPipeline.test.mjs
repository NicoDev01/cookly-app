import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeFacebookUrl,
  canonicalizeInstagramUrl,
  extractFacebookPostId,
  extractInstagramShortCode,
  isLikelyFacebookReelUrl,
  isSupportedFacebookUrl,
  isSupportedInstagramUrl,
  needsInstagramRedirectResolution,
} from "../convex/lib/socialUrls.ts";
import {
  canonicalizeTiktokUrl,
  extractTiktokVideoId,
  isSupportedTiktokUrl,
  needsTiktokRedirectResolution,
  rankSubtitleLinks,
  vttToPlainText,
} from "../convex/lib/tiktokContent.ts";
import {
  buildGeminiInput,
  deriveTitleFromCaption,
  extractApifyErrorCode,
  extractFirstHttpUrl,
  extractTextCandidates,
  isExistingRecipeUsable,
  isGenericRecipeTitle,
  normalizeRecipeData,
  hasBudgetForAttempt,
  pickLongestText,
  scoreCandidate,
  selectBestCandidate,
} from "../convex/socialImportShared.ts";

// Muss zu SCRAPE_PHASE_BUDGET_MS in convex/socialImport.ts passen.
const SCRAPE_PHASE_BUDGET_MS = 85_000;

test("ein Folgeversuch startet nur, wenn er ins Client-Timeout passt", () => {
  // waitForImport pollt 120 s. Sprengt die Scraping-Phase das, sieht der Nutzer einen
  // Timeout, obwohl der Server das Rezept noch schreibt.
  const transcriptionTimeout = 45_000;

  // Normalfall: Erstversuch ~25 s -> zweiter Versuch passt noch.
  assert.ok(hasBudgetForAttempt(27_000, transcriptionTimeout, SCRAPE_PHASE_BUDGET_MS));

  // Erstversuch lief in sein Timeout -> zweiter Versuch wird übersprungen statt zu überziehen.
  assert.equal(hasBudgetForAttempt(50_000, transcriptionTimeout, SCRAPE_PHASE_BUDGET_MS), false);

  // Genau auf der Grenze ist noch erlaubt.
  assert.ok(hasBudgetForAttempt(40_000, 45_000, SCRAPE_PHASE_BUDGET_MS));
  assert.equal(hasBudgetForAttempt(40_001, 45_000, SCRAPE_PHASE_BUDGET_MS), false);
});

// --- TikTok-URLs -----------------------------------------------------------

test("TikTok: akzeptiert Video-, Foto- und Kurzlink-URLs", () => {
  assert.ok(isSupportedTiktokUrl("https://www.tiktok.com/@koch/video/7673045152113495329"));
  assert.ok(isSupportedTiktokUrl("https://www.tiktok.com/@koch/photo/7673045152113495329"));
  assert.ok(isSupportedTiktokUrl("https://vm.tiktok.com/ZGxABCdef/"));
  assert.ok(isSupportedTiktokUrl("https://www.tiktok.com/t/ZTxABCdef/"));

  assert.equal(isSupportedTiktokUrl("https://www.tiktok.com/@koch"), false);
  assert.equal(isSupportedTiktokUrl("https://tiktok.evil.com/@koch/video/1"), false);
  assert.equal(isSupportedTiktokUrl("nicht mal eine url"), false);
});

test("TikTok: kanonisiert auf www und wirft Share-Tracking weg", () => {
  assert.equal(
    canonicalizeTiktokUrl(
      "https://www.tiktok.com/@mascha_wassermelone/video/7673045152113495329?is_from_webapp=1&sender_device=pc&web_id=123",
    ),
    "https://www.tiktok.com/@mascha_wassermelone/video/7673045152113495329",
  );
  // Zwei Nutzer, die denselben Beitrag mit unterschiedlichem Tracking teilen, müssen dedupen.
  assert.equal(
    canonicalizeTiktokUrl("https://tiktok.com/@a/video/42?_r=1&_t=xyz"),
    canonicalizeTiktokUrl("https://www.tiktok.com/@a/video/42?utm_source=share"),
  );
});

test("TikTok: Kurzlinks bleiben unangetastet und werden zum Auflösen markiert", () => {
  assert.equal(canonicalizeTiktokUrl("https://vm.tiktok.com/ZGxABCdef/"), "https://vm.tiktok.com/ZGxABCdef/");
  assert.ok(needsTiktokRedirectResolution("https://vm.tiktok.com/ZGxABCdef/"));
  assert.ok(needsTiktokRedirectResolution("https://www.tiktok.com/t/ZTxABCdef/"));
  assert.equal(needsTiktokRedirectResolution("https://www.tiktok.com/@a/video/42"), false);
});

test("TikTok: Video-ID ist der Matching-Schlüssel", () => {
  assert.equal(extractTiktokVideoId("https://www.tiktok.com/@a/video/7673045152113495329"), "7673045152113495329");
  assert.equal(extractTiktokVideoId("https://www.tiktok.com/@a/photo/123"), "123");
  assert.equal(extractTiktokVideoId("https://vm.tiktok.com/ZGxABCdef/"), "");
});

// --- TikTok-Untertitel -----------------------------------------------------

test("Untertitel: ASR und Deutsch werden bevorzugt, fremde Hosts verworfen", () => {
  const ranked = rankSubtitleLinks([
    { language: "eng-US", source: "MT", downloadLink: "https://api.apify.com/v2/key-value-stores/x/records/en.vtt" },
    { language: "deu-DE", source: "ASR", downloadLink: "https://api.apify.com/v2/key-value-stores/x/records/de.vtt" },
    { language: "fra-FR", source: "ASR", downloadLink: "https://api.apify.com/v2/key-value-stores/x/records/fr.vtt" },
    { language: "deu-DE", source: "ASR", downloadLink: "https://v16m-webapp.tiktokcdn-us.com/signed.vtt" },
  ]);

  assert.equal(ranked.length, 2, "höchstens zwei Spuren");
  assert.equal(ranked[0].language, "deu-DE");
  assert.equal(ranked[1].language, "fra-FR", "ASR schlägt Maschinenübersetzung");
  assert.ok(ranked.every((entry) => entry.url.startsWith("https://api.apify.com/")));
});

test("Untertitel: leere oder kaputte Eingaben ergeben eine leere Liste", () => {
  assert.deepEqual(rankSubtitleLinks(undefined), []);
  assert.deepEqual(rankSubtitleLinks([]), []);
  assert.deepEqual(rankSubtitleLinks([{ language: "deu-DE" }, null, "kaputt"]), []);
});

test("WebVTT wird zu Fließtext ohne Timings und Dubletten", () => {
  const vtt = [
    "WEBVTT",
    "",
    "1",
    "00:00:00.080 --> 00:00:03.360",
    "ich nehme Cannelloni und fülle sie mit Würstchen",
    "",
    "00:00:04.040 --> 00:00:05.320",
    "ich nehme Cannelloni und fülle sie mit Würstchen",
    "",
    "00:00:07.000 --> 00:00:09.360",
    "<c>dazu 200 g Sahne</c>",
  ].join("\n");

  assert.equal(vttToPlainText(vtt), "ich nehme Cannelloni und fülle sie mit Würstchen dazu 200 g Sahne");
  assert.equal(vttToPlainText("WEBVTT\n\n"), "");
});

// --- Instagram / Facebook: Verhalten muss der Refactor erhalten -------------

test("Instagram: Erkennung, Kanonisierung und Shortcode bleiben stabil", () => {
  assert.ok(isSupportedInstagramUrl("https://www.instagram.com/reel/DUIdyKlDOaX/"));
  assert.equal(isSupportedInstagramUrl("https://instagram.com/koch"), false);

  assert.equal(
    canonicalizeInstagramUrl("https://instagram.com/p/ABC123/?igsh=xyz&utm_source=share"),
    "https://www.instagram.com/p/ABC123/",
  );
  assert.equal(extractInstagramShortCode("https://www.instagram.com/reel/DUIdyKlDOaX/"), "DUIdyKlDOaX");
  assert.ok(needsInstagramRedirectResolution("https://www.instagram.com/share/reel/XyZ/"));
  assert.equal(needsInstagramRedirectResolution("https://www.instagram.com/p/ABC123/"), false);
});

test("Facebook: Reel-Erkennung und ID-Extraktion bleiben stabil", () => {
  assert.ok(isSupportedFacebookUrl("https://fb.watch/abc123/"));
  assert.ok(isLikelyFacebookReelUrl("https://www.facebook.com/share/r/1AiDe5uE4M/"));
  assert.ok(isLikelyFacebookReelUrl("https://fb.watch/abc/"));
  assert.equal(isLikelyFacebookReelUrl("https://www.facebook.com/koch/posts/123456789"), false);

  assert.equal(
    canonicalizeFacebookUrl("https://m.facebook.com/story.php?story_fbid=123456789&id=987654321&fbclid=x"),
    "https://www.facebook.com/story.php?story_fbid=123456789&id=987654321",
  );
  assert.equal(extractFacebookPostId("https://www.facebook.com/koch/posts/1234567890123"), "1234567890123");
});

// --- Gemeinsame Extraktion -------------------------------------------------

test("Textkandidaten werden über verschachtelte Pfade eingesammelt", () => {
  const post = {
    text: "kurz",
    videoMeta: { aiVideoSummary: "eine deutlich längere Zusammenfassung des Videos" },
    media: [{ ocrText: "OCR-Text" }],
  };

  const candidates = extractTextCandidates(post, ["text", "videoMeta.aiVideoSummary", "media[0].ocrText"]);
  assert.deepEqual(candidates, ["kurz", "eine deutlich längere Zusammenfassung des Videos", "OCR-Text"]);
  assert.equal(pickLongestText(candidates), "eine deutlich längere Zusammenfassung des Videos");
  assert.equal(pickLongestText([]), "");
});

test("Bild-URL nimmt den ersten gültigen http-Pfad", () => {
  const post = { videoMeta: { coverUrl: "", originalCoverUrl: "https://p16.tiktokcdn.com/cover.jpg" } };
  assert.equal(
    extractFirstHttpUrl(post, ["videoMeta.coverUrl", "videoMeta.originalCoverUrl"]),
    "https://p16.tiktokcdn.com/cover.jpg",
  );
  assert.equal(extractFirstHttpUrl({}, ["a.b"]), "");
});

test("Gemini-Input stellt Untertitel vor die restlichen Kandidaten und dedupliziert", () => {
  const input = buildGeminiInput("Caption", ["Caption", "Weiterer Text"], ["Transkript"]);
  assert.equal(input, "Caption\n\n---\n\nTranskript\n\n---\n\nWeiterer Text");

  assert.equal(buildGeminiInput("abcdefghij", [], [], { maxChars: 4 }), "abcd");
  assert.equal(buildGeminiInput("a", ["b", "c", "d"], [], { maxParts: 2 }), "a\n\n---\n\nb");
});

test("Apify-Fehler-Items werden als Fehlercode erkannt", () => {
  assert.equal(
    extractApifyErrorCode([{ error: "Post is private", errorCode: "POST_NOT_FOUND_OR_PRIVATE" }]),
    "POST_NOT_FOUND_OR_PRIVATE",
  );
  assert.equal(extractApifyErrorCode([{ text: "normales Item" }]), null);
  assert.equal(extractApifyErrorCode([]), null);
});

// --- Scoring und Normalisierung --------------------------------------------

test("Kandidat mit passender Video-ID gewinnt gegen einen längeren Fremdtext", () => {
  const base = {
    targetCanonicalUrl: "https://www.tiktok.com/@a/video/42",
    targetKey: "42",
    imageUrl: "https://cdn/x.jpg",
    minCaptionLength: 12,
  };

  const richtig = scoreCandidate({
    ...base,
    candidateCanonicalUrl: "https://www.tiktok.com/@a/video/42",
    candidateKey: "42",
    caption: "Zutaten: 200 g Mehl",
  });
  const falsch = scoreCandidate({
    ...base,
    candidateCanonicalUrl: "https://www.tiktok.com/@a/video/99",
    candidateKey: "99",
    caption: "x".repeat(500),
  });

  assert.ok(richtig > falsch, `erwartet ${richtig} > ${falsch}`);
});

test("Bei Punktegleichstand gewinnt der Kandidat mit mehr Gesamttext (Untertitel schlagen Erstversuch)", () => {
  // Derselbe Beitrag aus zwei Actor-Läufen: identischer Score, der zweite Lauf
  // hat das ASR-Transkript als extraText. Der stabile Sort darf nicht den
  // Erstversuch ohne Untertitel durchreichen.
  const erstversuch = {
    post: {},
    caption: "kurze Beschreibung",
    extraTexts: [],
    imageUrl: "https://cdn/x.jpg",
    canonicalUrl: "https://www.tiktok.com/@a/video/42",
    key: "42",
    score: scoreCandidate({
      targetCanonicalUrl: "https://www.tiktok.com/@a/video/42",
      targetKey: "42",
      candidateCanonicalUrl: "https://www.tiktok.com/@a/video/42",
      candidateKey: "42",
      caption: "kurze Beschreibung",
      imageUrl: "https://cdn/x.jpg",
      minCaptionLength: 12,
    }),
  };
  const folgeversuch = {
    ...erstversuch,
    extraTexts: ["x".repeat(1500)],
  };

  assert.equal(erstversuch.score, folgeversuch.score, "Scores müssen hier tatsächlich gleich sein");
  assert.equal(selectBestCandidate([erstversuch, folgeversuch]), folgeversuch);
  assert.equal(selectBestCandidate([folgeversuch]), folgeversuch);
  assert.equal(selectBestCandidate([]), null);
});

test("normalizeRecipeData härtet Modellausgaben ab", () => {
  const recipe = normalizeRecipeData({
    title: "  Cannelloni   mit Würstchen ",
    category: "Erfundene Kategorie",
    prepTimeMinutes: -5,
    difficulty: "unbekannt",
    portions: 0,
    ingredients: [
      { name: " Mehl ", amount: " 200 g " },
      { name: "", amount: "1" },
      "kaputt",
      { name: "Salz" },
    ],
    instructions: [
      { text: " Im Ofen backen ", icon: "nicht_erlaubt" },
      { text: "" },
    ],
  });

  assert.equal(recipe.title, "Cannelloni mit Würstchen");
  assert.equal(recipe.category, "Sonstiges");
  assert.equal(recipe.prepTimeMinutes, 15);
  assert.equal(recipe.difficulty, "Mittel");
  assert.equal(recipe.portions, 2);
  assert.deepEqual(recipe.ingredients, [
    { name: "Mehl", amount: "200 g", checked: false },
    { name: "Salz", checked: false },
  ]);
  assert.deepEqual(recipe.instructions, [{ text: "Im Ofen backen", icon: "oven_gen" }]);
  assert.throws(() => normalizeRecipeData("kein Objekt"));
});

test("generische Titel werden erkannt und aus der Caption ersetzt", () => {
  for (const title of ["Rezept", "TikTok Rezept", "Rezept von TikTok", "  untitled ", ""]) {
    assert.ok(isGenericRecipeTitle(title), `sollte generisch sein: ${title}`);
  }
  assert.equal(isGenericRecipeTitle("Cannelloni mit Würstchen"), false);

  const caption = "#foodtok\nhttps://example.com\nNudeln Pro Max\n1. Cannelloni füllen";
  assert.equal(deriveTitleFromCaption(caption), "Nudeln Pro Max");
  assert.equal(deriveTitleFromCaption("#nur #hashtags"), "");
});

test("unvollständige Bestandsrezepte gelten als stale und werden überschrieben", () => {
  const vollstaendig = { title: "Lasagne", ingredients: [{ name: "Mehl" }], instructions: [{ text: "backen" }] };
  assert.ok(isExistingRecipeUsable(vollstaendig));

  assert.equal(isExistingRecipeUsable({ ...vollstaendig, ingredients: [] }), false);
  assert.equal(isExistingRecipeUsable({ ...vollstaendig, instructions: [] }), false);
  assert.equal(isExistingRecipeUsable({ ...vollstaendig, title: "Rezept" }), false);
  assert.equal(isExistingRecipeUsable(null), false);
});
