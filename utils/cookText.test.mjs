import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCookSteps, amountPrefix } from './cookText.ts';

const ing = (amount, name) => ({ amount, name });
const kinds = (segs) => segs.filter((s) => s.kind !== 'text').map((s) => `${s.kind}:${s.text}${s.amount ? `(${s.amount})` : ''}`);

test('Menge nur beim ersten Vorkommen', () => {
  const { segments } = buildCookSteps(
    ['Die Hälfte der Butter schmelzen.', 'Restliche Butter unterrühren.'],
    [ing('50 g', 'Butter')],
  );
  assert.deepEqual(kinds(segments[0]), ['ingredient:Butter(50 g)']);
  assert.deepEqual(kinds(segments[1]), ['ingredient:Butter']);
});

test('Stückzahl mit ×, Einheit ohne', () => {
  assert.equal(amountPrefix('4'), '4 ×');
  assert.equal(amountPrefix('1,5'), '1,5 ×');
  assert.equal(amountPrefix('1 Dose'), '1 Dose');
  assert.equal(amountPrefix(''), null);
  assert.equal(amountPrefix(undefined), null);
});

test('Zeiten: Spanne nimmt den höheren Wert', () => {
  const { segments } = buildCookSteps(['6–8 Minuten stocken lassen, dann 1 Std. ruhen und 30 Sek. rühren.'], []);
  const times = segments[0].filter((s) => s.kind === 'time').map((s) => s.seconds);
  assert.deepEqual(times, [480, 3600, 30]);
});

test('Hitze wird erkannt', () => {
  const { segments } = buildCookSteps(['Bei mittlerer Hitze anbraten, dann bei 180 °C Umluft backen.'], []);
  assert.deepEqual(kinds(segments[0]), ['heat:mittlerer Hitze', 'heat:180 °C Umluft']);
});

test('Ofen-Hinweis, wenn der Ofen erst später kommt', () => {
  const { ovenHint } = buildCookSteps(['Teig rühren.', 'Im Ofen bei 200 Grad 20 Minuten backen.'], []);
  assert.equal(ovenHint, 'Ofen auf 200 Grad vorheizen');
});

test('kein Ofen-Hinweis, wenn Vorheizen schon drinsteht oder der Ofen in Schritt 1 ist', () => {
  assert.equal(buildCookSteps(['Ofen auf 180 °C vorheizen.', 'Im Ofen 20 Minuten backen.'], []).ovenHint, null);
  assert.equal(buildCookSteps(['Im Ofen bei 180 °C backen.'], []).ovenHint, null);
  assert.equal(buildCookSteps(['Zwiebel würfeln.'], []).ovenHint, null);
});

test('Timer-Name aus der ersten Zutat, sonst Schrittnummer', () => {
  const { labels } = buildCookSteps(['Tomaten 10 Minuten köcheln.', 'Abschmecken.'], [ing('1 Dose', 'Gehackte Tomaten')]);
  assert.equal(labels[0], 'Tomaten');
  assert.equal(labels[1], 'Schritt 2');
});
