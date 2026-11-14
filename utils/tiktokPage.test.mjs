import assert from "node:assert/strict";
import test from "node:test";
import { isTiktokCdnUrl, parseTiktokVideoPage } from "../convex/lib/tiktokContent.ts";

const page = (scope) =>
  `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: scope })}</script></html>`;

const item = {
  id: "7696865131501833494",
  desc: "  Kräuterbaguette vom Blech: 4 Baguettes, 200 g Käse … ",
  video: {
    cover: "https://p16-common-sign.tiktokcdn-eu.com/cover.jpg",
    originCover: "https://evil.example.com/cover.jpg",
    subtitleInfos: [
      { LanguageCodeName: "eng-US", Url: "https://v16-webapp.tiktokcdn-eu.com/en", Format: "webvtt", Source: "MT" },
      { LanguageCodeName: "deu-DE", Url: "https://v16-webapp.tiktokcdn-eu.com/de", Format: "webvtt", Source: "ASR" },
      { LanguageCodeName: "deu-DE", Url: "http://169.254.169.254/latest", Format: "webvtt", Source: "ASR" },
      { LanguageCodeName: "fra-FR", Url: "https://v16-webapp.tiktokcdn-eu.com/fr", Format: "webvtt", Source: "MT" },
    ],
  },
};

test("TikTok-Videoseite: Beschreibung, Titelbild und Untertitel (ASR/Deutsch zuerst)", () => {
  const data = parseTiktokVideoPage(page({ "webapp.reflow.video.detail": { itemInfo: { itemStruct: item } } }), item.id);
  assert.equal(data.description, "Kräuterbaguette vom Blech: 4 Baguettes, 200 g Käse …");
  assert.equal(data.coverUrl, "https://p16-common-sign.tiktokcdn-eu.com/cover.jpg", "fremde Hosts werden übergangen");
  assert.deepEqual(data.subtitles.map((s) => s.url), [
    "https://v16-webapp.tiktokcdn-eu.com/de",
    "https://v16-webapp.tiktokcdn-eu.com/en",
  ]);
});

test("TikTok-Videoseite: Desktop-Layout wird ebenfalls gelesen", () => {
  const data = parseTiktokVideoPage(page({ "webapp.video-detail": { itemInfo: { itemStruct: item } } }), item.id);
  assert.equal(data?.videoId, item.id);
});

test("TikTok-Videoseite: anderes Video, Bot-Schutz oder kaputtes JSON → null (Apify übernimmt)", () => {
  const html = page({ "webapp.reflow.video.detail": { itemInfo: { itemStruct: item } } });
  assert.equal(parseTiktokVideoPage(html, "123"), null);
  assert.equal(parseTiktokVideoPage("<html>captcha</html>", item.id), null);
  assert.equal(parseTiktokVideoPage('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{kaputt</script>', item.id), null);
  assert.equal(parseTiktokVideoPage(page({}), item.id), null);
});

test("Nur HTTPS-URLs von TikToks CDN werden abgerufen", () => {
  assert.equal(isTiktokCdnUrl("https://v16-webapp.tiktokcdn-eu.com/x"), true);
  assert.equal(isTiktokCdnUrl("https://p16.tiktokcdn.com/x"), true);
  assert.equal(isTiktokCdnUrl("http://p16.tiktokcdn.com/x"), false);
  assert.equal(isTiktokCdnUrl("https://tiktokcdn.com.evil.example/x"), false);
  assert.equal(isTiktokCdnUrl("https://eviltiktokcdn.com/x"), false);
});
