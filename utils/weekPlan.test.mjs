import test from 'node:test';
import assert from 'node:assert/strict';

import { mondayOf, slotLabel, toDateString, weekLabel, weekNumber, weekStartForOffset } from './weekPlan.ts';

test('mondayOf returns the Monday of the same week, also for Sundays', () => {
  assert.equal(toDateString(mondayOf(new Date(2026, 10, 9))), '2026-11-09'); // Montag
  assert.equal(toDateString(mondayOf(new Date(2026, 10, 15))), '2026-11-09'); // Sonntag
  assert.equal(toDateString(mondayOf(new Date(2026, 10, 12, 23, 30))), '2026-11-09');
});

test('weekStartForOffset moves in whole weeks across month borders', () => {
  const today = new Date(2026, 10, 25);
  assert.equal(toDateString(weekStartForOffset(0, today)), '2026-11-23');
  assert.equal(toDateString(weekStartForOffset(1, today)), '2026-11-30');
  assert.equal(toDateString(weekStartForOffset(-1, today)), '2026-11-16');
});

test('weekNumber follows ISO weeks', () => {
  assert.equal(weekNumber(new Date(2026, 10, 9)), 46);
  assert.equal(weekNumber(new Date(2027, 0, 1)), 53);
});

test('weekLabel names nearby weeks and falls back to the week number', () => {
  assert.equal(weekLabel(0, 46), 'Diese Woche');
  assert.equal(weekLabel(1, 47), 'Nächste Woche');
  assert.equal(weekLabel(-1, 45), 'Letzte Woche');
  assert.equal(weekLabel(3, 49), 'KW 49');
});

test('slotLabel shows the weekday or "Ohne Tag"', () => {
  assert.equal(slotLabel({ date: '2026-11-10', scope: 'day' }), 'Di');
  assert.equal(slotLabel({ date: '2026-11-09', scope: 'week' }), 'Ohne Tag');
});
