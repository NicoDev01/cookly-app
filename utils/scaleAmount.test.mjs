import test from 'node:test';
import assert from 'node:assert/strict';

import { scaleAmount } from './scaleAmount.ts';

const cases = [
  // [Eingabe, Faktor, erwartet]
  ['1 Dose', 1, '1 Dose'],
  ['1 Dose', 2, '2 Dosen'],
  ['1 Dose', 1.5, '1,5 Dosen'],
  ['2 Dosen', 0.5, '1 Dose'],
  ['1 Dose (400 g)', 2, '2 Dosen (400 g)'],
  ['4', 0.5, '2'],
  ['1', 0.5, '0,5'],
  ['1', 0.25, '0,25'],
  ['1 TL', 1.5, '1,5 TL'],
  ['1 TL', 0.5, '0,5 TL'],
  ['3 EL', 1 / 3, '1 EL'],
  ['2 EL', 1.25, '2,5 EL'],
  ['200 g', 1.5, '300 g'],
  ['125 g', 0.5, '65 g'],
  ['30 g', 1.5, '45 g'],
  ['200g', 2, '400g'],
  ['7 g', 1.5, '11 g'],
  ['1,5 kg', 1.5, '2,3 kg'],
  ['0,5 l', 0.5, '0,25 l'],
  ['1.000 g', 0.5, '500 g'],
  ['1/2 TL', 2, '1 TL'],
  ['1 1/2 Tassen', 2, '3 Tassen'],
  ['½ Bund', 3, '1,5 Bund'],
  ['1½ Dosen', 2, '3 Dosen'],
  ['1-2 EL', 2, '2-4 EL'],
  ['1–2 Zehen', 0.5, '0,5–1 Zehe'],
  ['1 Dose', 0.5, '0,5 Dose'],
  ['ca. 100 ml', 2, 'ca. 200 ml'],
  ['eine Dose', 2, '2 Dosen'],
  ['eine halbe Zitrone', 2, '1 Zitrone'],
  ['halbe Zitrone', 3, '1,5 Zitrone'],
  ['zwei Zehen', 0.5, '1 Zehe'],
  ['ein paar Blätter', 2, 'ein paar Blätter'],
  ['etwas', 2, 'etwas'],
  ['nach Belieben', 3, 'nach Belieben'],
  ['Prise', 2, 'Prise'],
  ['1 Prise', 2, '2 Prisen'],
  ['1 Handvoll', 2, '2 Handvoll'],
];

for (const [input, factor, expected] of cases) {
  test(`${input} × ${factor}`, () => {
    assert.equal(scaleAmount(input, factor), expected);
  });
}

test('leere Menge bleibt leer', () => {
  assert.equal(scaleAmount(undefined, 2), undefined);
  assert.equal(scaleAmount('', 2), '');
});
