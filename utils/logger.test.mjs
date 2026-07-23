import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLogRingBuffer,
  shouldForwardToSink,
  serializeLogData,
  formatLogLine,
} from './logger.ts';

const entry = (over = {}) => ({
  ts: 0,
  level: 'info',
  scope: 'Test',
  message: 'hello',
  ...over,
});

test('ring buffer keeps insertion order and exposes an immutable copy', () => {
  const buf = createLogRingBuffer(10);
  buf.push(entry({ message: 'a' }));
  buf.push(entry({ message: 'b' }));

  const list = buf.list();
  assert.deepEqual(list.map((e) => e.message), ['a', 'b']);

  // Mutating the returned copy must not affect the buffer.
  list.pop();
  assert.equal(buf.size, 2);
});

test('ring buffer evicts oldest entries beyond capacity', () => {
  const buf = createLogRingBuffer(3);
  for (let i = 0; i < 5; i++) buf.push(entry({ message: String(i) }));

  assert.equal(buf.size, 3);
  assert.deepEqual(buf.list().map((e) => e.message), ['2', '3', '4']);
});

test('ring buffer clear empties the buffer', () => {
  const buf = createLogRingBuffer(3);
  buf.push(entry());
  buf.clear();
  assert.equal(buf.size, 0);
  assert.deepEqual(buf.list(), []);
});

test('only warn and error are forwarded to sinks', () => {
  assert.equal(shouldForwardToSink('debug'), false);
  assert.equal(shouldForwardToSink('info'), false);
  assert.equal(shouldForwardToSink('warn'), true);
  assert.equal(shouldForwardToSink('error'), true);
});

test('serializeLogData turns Errors into a readable object', () => {
  const err = new Error('boom');
  const result = serializeLogData(err);
  assert.equal(result.name, 'Error');
  assert.equal(result.message, 'boom');
  assert.equal(typeof result.stack, 'string');
});

test('serializeLogData truncates very long strings', () => {
  const long = 'x'.repeat(5000);
  const result = serializeLogData(long);
  assert.ok(result.endsWith('…[gekürzt]'));
  assert.ok(result.length < 5000);
});

test('serializeLogData passes through undefined and plain objects', () => {
  assert.equal(serializeLogData(undefined), undefined);
  assert.deepEqual(serializeLogData({ a: 1 }), { a: 1 });
});

test('formatLogLine renders level, scope, message and data', () => {
  const line = formatLogLine(entry({ ts: 0, level: 'error', scope: 'Auth', message: 'failed', data: { code: 1 } }));
  assert.match(line, /\[ERROR\] Auth: failed/);
  assert.match(line, /\{"code":1\}/);
});

test('formatLogLine omits data when undefined', () => {
  const line = formatLogLine(entry({ ts: 0, level: 'info', scope: 'X', message: 'm' }));
  assert.match(line, /\[INFO\] X: m$/);
});
