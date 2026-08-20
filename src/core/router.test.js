import assert from 'node:assert/strict';
import test from 'node:test';

test('project routes decode the selected project and module identifiers', async () => {
  globalThis.window={location:{hash:'#/projects/%D9%BE%D8%B1%D9%88%DA%98%D9%87%20%DB%B1/dashboard'}};
  const { parseRoute }=await import(`./router.js?decode=${Date.now()}`);
  assert.deepEqual(parseRoute(),{projectId:'پروژه ۱',moduleId:'dashboard'});
});
