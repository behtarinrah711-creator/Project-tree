import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTaskSnapshot } from './taskCloud.js';
import { buildProjectCloudPayload } from './cloudSyncProject.js';

test('empty incoming does not wipe non-empty local tasks', () => {
  const norm = t => ({ ...t, id: String(t.id) });
  const merged = mergeTaskSnapshot([], [{ id: 't1', title: 'A' }], [], norm);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 't1');
});

test('buildProjectCloudPayload prefers store over empty live collection', () => {
  const policy = {
    shouldUploadCollection(store, live){
      return !(store.length > 0 && live.length === 0);
    },
  };
  const p = { name: 'P', ownerUid: 'u', contacts: [], activityTemplates: [], contractTemplates: [], contracts: [] };
  const store = { contacts: [{ id: 'c1' }], activityTemplates: [], contractTemplates: [], contracts: [] };
  const payload = buildProjectCloudPayload(p, store, policy, e => String(e || ''), 2);
  assert.equal(payload.contacts.length, 1);
});
