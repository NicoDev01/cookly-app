import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhaseSequencer, MIN_SHARE_TARGET_PHASE_MS } from './shareTargetPhases.ts';

test('share target phases wait at least the minimum display time between transitions', async () => {
  const calls = [];
  let now = 1000;
  const sequencer = createPhaseSequencer({
    now: () => now,
    wait: async (ms) => {
      calls.push(ms);
      now += ms;
    },
  });

  await sequencer.show('analyzing');
  now += 100;
  await sequencer.show('extrahieren');
  now += 250;
  await sequencer.show('importieren');

  assert.equal(MIN_SHARE_TARGET_PHASE_MS, 800);
  assert.deepEqual(calls, [700, 550]);
});

test('share target phases do not wait before the first phase', async () => {
  const calls = [];
  const sequencer = createPhaseSequencer({
    now: () => 0,
    wait: async (ms) => calls.push(ms),
  });

  await sequencer.show('analyzing');

  assert.deepEqual(calls, []);
});

test('share target phases can hold the final phase before leaving processing UI', async () => {
  const calls = [];
  let now = 5000;
  const sequencer = createPhaseSequencer({
    now: () => now,
    wait: async (ms) => {
      calls.push(ms);
      now += ms;
    },
  });

  await sequencer.show('importieren');
  now += 300;
  await sequencer.finish();

  assert.deepEqual(calls, [500]);
});
