import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('legacy has no Firebase/Auth/recovery implementation bodies',async()=>{
  const source=await readFile(new URL('../legacy/legacyApp.js',import.meta.url),'utf8');
  for(const forbidden of ['firebase.initializeApp','onAuthStateChanged','collectionGroup(','function recoverLegacyTasksForProject','function migrateGuestDataToCloud'])
    assert.doesNotMatch(source,new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(source,/cloudRuntime\.lifecycle\.permanentlyDelete\(p\)/);
});
