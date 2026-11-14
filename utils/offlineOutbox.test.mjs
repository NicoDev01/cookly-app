import assert from 'node:assert/strict';
import test from 'node:test';
import { clearOfflineCache, rememberUser, setOfflineStorage } from '../services/offlineCache.ts';
import {
  enqueue,
  flushOutbox,
  getOutbox,
  overlayFavorite,
  overlayFavoritesList,
  overlayShoppingList,
  pendingOps,
  setOutboxStorage,
  supersede,
} from '../services/offlineOutbox.ts';

const memoryStorage = () => {
  const map = new Map();
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};

const fresh = (user = 'u1') => {
  const storage = memoryStorage();
  setOfflineStorage(storage);
  setOutboxStorage(storage);
  if (user) rememberUser({ _id: user });
  return storage;
};

test('ohne gemerkten Nutzer wird nichts gemerkt', () => {
  fresh(null);
  assert.equal(enqueue({ kind: 'shopping.remove', ids: ['a'] }), false);
  assert.deepEqual(pendingOps(), []);
});

test('je ID zusammengefasst: letzter Wert gewinnt, Entfernen schlägt Abhaken', () => {
  fresh();
  enqueue({ kind: 'shopping.setChecked', ids: ['a', 'b'], checked: true });
  enqueue({ kind: 'shopping.setChecked', ids: ['a'], checked: false });
  enqueue({ kind: 'shopping.remove', ids: ['b'] });
  enqueue({ kind: 'shopping.setChecked', ids: ['b'], checked: false });
  enqueue({ kind: 'recipe.setFavorite', id: 'r1', isFavorite: true });
  enqueue({ kind: 'recipe.setFavorite', id: 'r1', isFavorite: false });
  assert.deepEqual(pendingOps(), [
    { kind: 'shopping.remove', ids: ['b'] },
    { kind: 'shopping.setChecked', ids: ['a'], checked: false },
    { kind: 'recipe.setFavorite', id: 'r1', isFavorite: false },
  ]);
});

test('Overlay legt offene Ops über Cache- oder Live-Daten', () => {
  fresh();
  const list = [
    { _id: 'a', checked: false },
    { _id: 'b', checked: false },
    { _id: 'c', checked: true },
  ];
  assert.equal(overlayShoppingList(list), list, 'ohne Ops unverändert');
  enqueue({ kind: 'shopping.setChecked', ids: ['a'], checked: true });
  enqueue({ kind: 'shopping.remove', ids: ['b'] });
  assert.deepEqual(overlayShoppingList(list), [
    { _id: 'a', checked: true },
    { _id: 'c', checked: true },
  ]);

  enqueue({ kind: 'recipe.setFavorite', id: 'r1', isFavorite: false });
  enqueue({ kind: 'recipe.setFavorite', id: 'r2', isFavorite: true });
  assert.deepEqual(overlayFavorite({ _id: 'r2', isFavorite: false }), { _id: 'r2', isFavorite: true });
  assert.deepEqual(overlayFavoritesList([{ _id: 'r1', isFavorite: true }, { _id: 'r3', isFavorite: true }]), [{ _id: 'r3', isFavorite: true }]);
});

test('Outbox überlebt Neustart (liegt im Speicher), Snapshot bleibt stabil', () => {
  const storage = fresh();
  enqueue({ kind: 'shopping.remove', ids: ['a'] });
  const first = getOutbox();
  assert.equal(getOutbox(), first);
  setOutboxStorage(storage); // wie ein Neustart: In-Memory-Stand weg
  assert.deepEqual(getOutbox().shopping, { a: { removed: true } });
});

test('Nutzerwechsel und Abmelden leeren die Outbox; fremde Ops werden nie gelesen', () => {
  const storage = fresh();
  enqueue({ kind: 'shopping.remove', ids: ['a'] });
  rememberUser({ _id: 'u2' });
  assert.deepEqual(pendingOps(), []);
  enqueue({ kind: 'recipe.setFavorite', id: 'r1', isFavorite: true });
  clearOfflineCache();
  assert.deepEqual(pendingOps(), []);
  // Auch ohne Leeren: Ops eines anderen Nutzers bleiben unsichtbar.
  rememberUser({ _id: 'u3' });
  storage.setItem('cookly.offline.outbox', JSON.stringify({ user: 'u9', shopping: { x: { removed: true } }, favorites: {} }));
  assert.deepEqual(pendingOps(), []);
});

test('online gesendete Op ersetzt offene Ops derselben IDs', () => {
  fresh();
  enqueue({ kind: 'recipe.setFavorite', id: 'r1', isFavorite: true });
  enqueue({ kind: 'shopping.setChecked', ids: ['a'], checked: true });
  enqueue({ kind: 'shopping.remove', ids: ['b'] });
  supersede({ kind: 'recipe.setFavorite', id: 'r1', isFavorite: false });
  supersede({ kind: 'shopping.setChecked', ids: ['a', 'b'], checked: false });
  assert.deepEqual(pendingOps(), [{ kind: 'shopping.remove', ids: ['b'] }], 'Entfernen bleibt bei bloßem Abhaken');
});

test('Nachreichen: Erfolg und Serverfehler entfernen die Op, Netzfehler lässt sie liegen', async () => {
  fresh();
  enqueue({ kind: 'shopping.remove', ids: ['a'] });
  enqueue({ kind: 'recipe.setFavorite', id: 'deleted', isFavorite: true });
  const sent = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    await flushOutbox(async (op) => {
      sent.push(op.kind);
      if (op.kind === 'recipe.setFavorite') throw new Error('Recipe not found or access denied');
    }, () => false);
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(sent, ['shopping.remove', 'recipe.setFavorite']);
  assert.deepEqual(pendingOps(), [], 'Server gewinnt: abgelehnte Op verworfen');

  enqueue({ kind: 'shopping.setChecked', ids: ['c'], checked: true });
  await flushOutbox(async () => {
    throw new Error('network');
  }, () => true);
  assert.deepEqual(pendingOps(), [{ kind: 'shopping.setChecked', ids: ['c'], checked: true }]);
});

test('Nachreichen: während des Sendens erneut Getipptes bleibt für die nächste Runde', async () => {
  fresh();
  enqueue({ kind: 'recipe.setFavorite', id: 'r1', isFavorite: true });
  const sent = [];
  await flushOutbox(async (op) => {
    sent.push(op.isFavorite);
    if (sent.length === 1) enqueue({ kind: 'recipe.setFavorite', id: 'r1', isFavorite: false });
  }, () => false);
  assert.deepEqual(sent, [true, false], 'zweiter Wert wird nachgeschickt, nicht verworfen');
  assert.deepEqual(pendingOps(), []);
});
