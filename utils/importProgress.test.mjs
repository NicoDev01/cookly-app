import assert from 'node:assert/strict';
import test from 'node:test';
import { approachPercent, importStepFromOperation } from './importProgress.ts';

test('Import-Schritt folgt Status und Phase der Operation', () => {
  assert.equal(importStepFromOperation(undefined), 'detect');
  assert.equal(importStepFromOperation({ status: 'reserved' }), 'detect');
  assert.equal(importStepFromOperation({ status: 'running' }), 'scrape');
  assert.equal(importStepFromOperation({ status: 'running', phase: 'extracting' }), 'extract');
  assert.equal(importStepFromOperation({ status: 'succeeded', phase: 'extracting' }), 'save');
});

test('Fortschritt startet am Vorwert, steigt stetig und erreicht das Ziel nie', () => {
  assert.equal(approachPercent(40, 92, 0, 3_000), 40);
  const a = approachPercent(40, 92, 1_000, 3_000);
  const b = approachPercent(40, 92, 5_000, 3_000);
  const late = approachPercent(40, 92, 120_000, 3_000);
  assert.ok(a > 40 && b > a);
  assert.ok(late < 92 && late > 86);
  // Liegt der Vorwert schon über dem Ziel, geht es nicht rückwärts.
  assert.equal(approachPercent(60, 55, 2_000, 3_000), 60);
});
