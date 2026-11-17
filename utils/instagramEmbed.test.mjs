import assert from "node:assert/strict";
import test from "node:test";
import { isInstagramCdnUrl, parseInstagramEmbedPage } from "../convex/lib/instagramContent.ts";

const CODE = "DdXpTijNyt1";
const IMG = "https://scontent-fra3-1.cdninstagram.com/v/t51/1.jpg?stp=a&ccb=7-5";

const structuredPage = (media) => {
  const contextJSON = JSON.stringify({ context: { type: "GraphVideo", shortcode: media.shortcode }, gql_data: { shortcode_media: media } });
  return `<html><script>{"require":[["PolarisEmbedSimple","init",[],[{"isRichEmbed":true,"contextJSON":${JSON.stringify(contextJSON)}}]]]}</script></html>`;
};

const htmlPage = (code, captionHtml, imgSrc = IMG.replace(/&/g, "&amp;")) =>
  `<html><a href="https://www.instagram.com/p/${code}/?utm_source=ig_embed">x</a>` +
  `<img class="EmbeddedMediaImage" alt="Instagram post" src="${imgSrc}" />` +
  `<div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/koch/">koch</a><br /><br />${captionHtml}` +
  `<div class="CaptionComments">Alle Kommentare</div></div>` +
  `<script>{"contextJSON":null}</script></html>`;

test("Instagram-Embed: strukturierte Daten (contextJSON)", () => {
  const data = parseInstagramEmbedPage(structuredPage({
    shortcode: CODE,
    display_url: IMG,
    edge_media_to_caption: { edges: [{ node: { text: "  Linsencurry\n\n\n\nZutaten:\n200 g Linsen  " } }] },
  }), CODE);
  assert.deepEqual(data, { shortcode: CODE, caption: "Linsencurry\n\nZutaten:\n200 g Linsen", imageUrl: IMG });
});

test("Instagram-Embed: nur HTML (contextJSON null), Nutzername und Entities bereinigt", () => {
  const data = parseInstagramEmbedPage(
    htmlPage(CODE, `Big Mac Wrap &#x1f354;<br />Zutaten<br />200&nbsp;g Hack &amp; Salat<br /><a href="/explore/tags/rezept/">#rezept</a> von &#064;koch`),
    CODE,
  );
  assert.equal(data.caption, "Big Mac Wrap 🍔\nZutaten\n200 g Hack & Salat\n#rezept von @koch");
  assert.equal(data.imageUrl, IMG);
});

test("Instagram-Embed: fremder Beitrag, fehlende Caption oder fremde Bild-Hosts", () => {
  assert.equal(parseInstagramEmbedPage(structuredPage({ shortcode: "ANDERER123", edge_media_to_caption: { edges: [{ node: { text: "x" } }] } }), CODE), null);
  assert.equal(parseInstagramEmbedPage(htmlPage("ANDERER123", "Rezept"), CODE), null);
  assert.equal(parseInstagramEmbedPage(htmlPage(CODE, "  "), CODE), null);
  assert.equal(parseInstagramEmbedPage("<html>Login</html>", CODE), null);
  assert.equal(parseInstagramEmbedPage("", CODE), null);
  assert.equal(parseInstagramEmbedPage(htmlPage(CODE, "Rezept", "https://evil.example.com/a.jpg"), CODE).imageUrl, undefined);
});

test("Instagram-CDN-Hosts", () => {
  assert.equal(isInstagramCdnUrl(IMG), true);
  assert.equal(isInstagramCdnUrl("https://scontent.xx.fbcdn.net/a.jpg"), true);
  assert.equal(isInstagramCdnUrl("http://scontent.cdninstagram.com/a.jpg"), false);
  assert.equal(isInstagramCdnUrl("https://cdninstagram.com.evil.example/a.jpg"), false);
  assert.equal(isInstagramCdnUrl(undefined), false);
});
