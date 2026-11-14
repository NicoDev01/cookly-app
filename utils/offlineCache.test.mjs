import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearOfflineCache,
  getCachedUser,
  hasStoredAuthToken,
  readOfflineCache,
  rememberUser,
  setOfflineStorage,
  writeOfflineCache,
} from '../services/offlineCache.ts';

/** localStorage-Ersatz; `maxItems` simuliert "Speicher voll". */
const memoryStorage = (maxItems = Infinity) => {
  const map = new Map();
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      if (!map.has(key) && map.size >= maxItems) throw new Error('QuotaExceededError');
      map.set(key, String(value));
    },
    removeItem: (key) => map.delete(key),
  };
};

test('ohne gemerkten Nutzer wird nichts gelesen oder geschrieben', () => {
  setOfflineStorage(memoryStorage());
  writeOfflineCache('favorites', [1, 2]);
  assert.equal(readOfflineCache('favorites'), undefined);
});

test('Server-Ergebnis wird je Nutzer gespeichert; null löscht den Eintrag', () => {
  setOfflineStorage(memoryStorage());
  rememberUser({ _id: 'u1', onboardingCompleted: true });
  writeOfflineCache('recipe-a', { title: 'Lasagne' });
  assert.deepEqual(readOfflineCache('recipe-a'), { title: 'Lasagne' });
  assert.equal(getCachedUser()._id, 'u1');
  writeOfflineCache('recipe-a', null);
  assert.equal(readOfflineCache('recipe-a'), undefined);
});

test('Kontowechsel und Abmelden leeren den Cache', () => {
  const storage = memoryStorage();
  storage.setItem('fremd', 'bleibt');
  setOfflineStorage(storage);
  rememberUser({ _id: 'u1' });
  writeOfflineCache('shopping-list', ['Milch']);
  rememberUser({ _id: 'u2' });
  assert.equal(readOfflineCache('shopping-list'), undefined);
  assert.equal(getCachedUser()._id, 'u2');
  clearOfflineCache();
  assert.equal(getCachedUser(), undefined);
  assert.equal(storage.getItem('fremd'), 'bleibt', 'nur eigene Schlüssel löschen');
});

test('Geöffnete Rezepte sind begrenzt, die ältesten fliegen zuerst', async () => {
  setOfflineStorage(memoryStorage());
  rememberUser({ _id: 'u1' });
  for (let i = 0; i < 45; i++) {
    writeOfflineCache(`recipe-${i}`, { i });
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(readOfflineCache('recipe-0'), undefined);
  assert.equal(readOfflineCache('recipe-4'), undefined);
  assert.deepEqual(readOfflineCache('recipe-5'), { i: 5 });
  assert.deepEqual(readOfflineCache('recipe-44'), { i: 44 });
});

test('Speicher voll: alte Einträge weichen, sonst ohne Fehler weiter', async () => {
  const storage = memoryStorage(5);
  setOfflineStorage(storage);
  rememberUser({ _id: 'u1' });
  for (let i = 0; i < 6; i++) {
    writeOfflineCache(`category-${i}`, { i });
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.deepEqual(readOfflineCache('category-5'), { i: 5 });
  assert.equal(readOfflineCache('category-0'), undefined);

  setOfflineStorage({ ...storage, setItem: () => { throw new Error('gesperrt'); }, getItem: () => { throw new Error('gesperrt'); } });
  assert.doesNotThrow(() => writeOfflineCache('favorites', []));
  assert.equal(readOfflineCache('favorites'), undefined);
});

test('Login-Token wird nur für das eigene Deployment erkannt', () => {
  const storage = memoryStorage();
  setOfflineStorage(storage);
  assert.equal(hasStoredAuthToken('https://happy-fox-123.convex.cloud'), false);
  storage.setItem('__convexAuthJWT_httpsotherdeploy1convexcloud', 'jwt');
  assert.equal(hasStoredAuthToken('https://happy-fox-123.convex.cloud'), false);
  storage.setItem('__convexAuthJWT_httpshappyfox123convexcloud', 'jwt');
  assert.equal(hasStoredAuthToken('https://happy-fox-123.convex.cloud'), true);
});
