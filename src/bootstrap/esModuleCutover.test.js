import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';

test('C4 has one internal module entry and no sequential runtime loader',async()=>{
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  const internal=[...html.matchAll(/<script\b[^>]*src="(src\/[^"]+)"[^>]*>/g)];
  assert.deepEqual(internal.map(match=>match[1]),['src/bootstrap/app.js']);
  assert.match(internal[0][0],/type="module"/);
  await assert.rejects(access(new URL('./applicationRuntimeLoader.js',import.meta.url)));
  const app=await readFile(new URL('./app.js',import.meta.url),'utf8');
  assert.match(app,/import '\.\/cacheGuard\.js'/);
  assert.match(app,/import '\.\/shellEntry\.js'/);
});

test('startup reaches runtime through import rather than injected scripts',async()=>{
  const startup=await readFile(new URL('./applicationStartup.js',import.meta.url),'utf8');
  assert.match(startup,/loadRuntime = \(\) => import\('\.\/applicationRuntime\.js'\)/);
  assert.doesNotMatch(startup,/createElement\(['"]script|appendChild\(script|KarhaApplicationRuntimePromise/);
});

test('applicationRuntime remains a small orchestrator and owner bodies stay in modules',async()=>{
  const runtime=await readFile(new URL('./applicationRuntime.js',import.meta.url),'utf8');
  assert.ok(runtime.split(/\r?\n/).length <= 200, 'runtime orchestrator exceeded 200 lines');
  for(const ownerMarker of [
    'installChildHistoryController', 'installContractHistoryController',
    'function renderAll', 'function openSearchTemplate', 'function loadData',
  ]) assert.doesNotMatch(runtime,new RegExp(ownerMarker));
  for(const ownerPath of [
    '../core/applicationFoundation.js', '../core/childHistoryController.js',
    '../ui/workspaceFormPresentation.js', '../ui/workspacePresentationRuntime.js',
    '../modules/contracts/searchTemplateModule.js', '../modules/runtime/featureComposition.js',
  ]) assert.match(runtime,new RegExp(`from ['"]${ownerPath.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}['"]`));
});
