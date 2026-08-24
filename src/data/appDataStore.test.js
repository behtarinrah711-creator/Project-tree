import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppDataStore, createEmptySnapshot, APP_DATA_STORAGE_KEY } from './appDataStore.js';

function memoryStorage(initial = {}){
  const map = new Map(Object.entries(initial));
  return {
    getItem(k){ return map.has(k) ? map.get(k) : null; },
    setItem(k,v){ map.set(k, String(v)); },
    removeItem(k){ map.delete(k); },
  };
}

describe('appDataStore D1', () => {
  it('starts with empty shape', () => {
    const s = createAppDataStore({ storage: memoryStorage(), schemaVersion: 8 });
    const snap = s.getSnapshot();
    assert.deepEqual(snap, createEmptySnapshot(8));
  });

  it('loadFromStorage hydrates and keeps same reference on getSnapshot', () => {
    const payload = {
      schemaVersion: 8,
      projects: [{ id: 'p1', name: 'A', tasks: [] }],
      viewMode: 'simple',
      activeTab: 'p1',
      starredOrder: ['p1'],
    };
    const storage = memoryStorage({
      [APP_DATA_STORAGE_KEY]: JSON.stringify(payload),
    });
    const s = createAppDataStore({ storage, schemaVersion: 8 });
    const a = s.loadFromStorage();
    const b = s.getSnapshot();
    assert.equal(a, b);
    assert.equal(b.projects[0].id, 'p1');
    assert.equal(b.activeTab, 'p1');
  });

  it('persistLocal writes canonical snapshot', () => {
    const storage = memoryStorage();
    const s = createAppDataStore({ storage, schemaVersion: 8 });
    s.getSnapshot().projects.push({ id: 'x', name: 'X' });
    s.getSnapshot().activeTab = 'x';
    assert.equal(s.persistLocal(), true);
    const again = createAppDataStore({ storage, schemaVersion: 8 });
    again.loadFromStorage();
    assert.equal(again.getSnapshot().projects[0].id, 'x');
    assert.equal(again.getActiveTab(), 'x');
  });

  it('replaceSnapshot becomes the shared reference', () => {
    const s = createAppDataStore({ storage: memoryStorage(), schemaVersion: 8 });
    const next = { schemaVersion: 8, projects: [{ id: 'n' }], viewMode: 'simple', activeTab: null, starredOrder: [] };
    const ref = s.replaceSnapshot(next);
    assert.equal(s.getSnapshot(), ref);
    assert.equal(ref.projects[0].id, 'n');
  });
});

describe('appDataStore D2', () => {
  it('setActiveTab and setViewMode are sole writers', () => {
    const s = createAppDataStore({ storage: memoryStorage(), schemaVersion: 8 });
    s.setActiveTab('p9');
    s.setViewMode('cost');
    assert.equal(s.getActiveTab(), 'p9');
    assert.equal(s.getViewMode(), 'cost');
    assert.equal(s.getSnapshot().activeTab, 'p9');
    assert.equal(s.getSnapshot().viewMode, 'cost');
  });

  it('setViewMode empty falls back to simple', () => {
    const s = createAppDataStore({ storage: memoryStorage(), schemaVersion: 8 });
    s.setViewMode('');
    assert.equal(s.getViewMode(), 'simple');
  });
});
