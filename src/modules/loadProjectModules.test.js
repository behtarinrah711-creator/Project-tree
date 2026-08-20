import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProjectModules } from './loadProjectModules.js';

test('one failed feature module does not block the remaining project modules', async () => {
  const errors=[];
  const modules=await loadProjectModules({
    importers:[
      ['dashboard', async()=>({default:{id:'dashboard'}})],
      ['minutes', async()=>{ throw Object.assign(new Error('503'),{status:503}); }],
      ['reports', async()=>({default:{id:'reports'}})],
    ],
    onError:(id,error)=>errors.push([id,error.message]),
  });

  assert.deepEqual(modules.map(module=>module.id),['dashboard','reports']);
  assert.deepEqual(errors,[['minutes','503']]);
});
