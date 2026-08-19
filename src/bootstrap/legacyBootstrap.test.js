import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadLegacyRuntime } from './legacyBootstrap.js';

function createDocumentHarness(){
  let runtimeScript = null;
  const documentRef = {
    querySelector(){ return runtimeScript; },
    createElement(tagName){
      assert.equal(tagName, 'script');
      const listeners = new Map();
      return {
        async: true,
        dataset: {},
        addEventListener(type, callback){ listeners.set(type, callback); },
        dispatch(type){ listeners.get(type)?.(); },
      };
    },
    body: {
      appendChild(script){
        runtimeScript = script;
        queueMicrotask(() => script.dispatch('load'));
      },
    },
  };
  return { documentRef, getRuntimeScript: () => runtimeScript };
}

test('legacy loader creates one ordered classic script', async () => {
  const harness = createDocumentHarness();
  const first = await loadLegacyRuntime({ documentRef: harness.documentRef, sourceUrl: '/legacyApp.js' });
  const second = await loadLegacyRuntime({ documentRef: harness.documentRef, sourceUrl: '/legacyApp.js' });

  assert.equal(first, second);
  assert.equal(first.src, '/legacyApp.js');
  assert.equal(first.async, false);
  assert.equal(first.type, undefined);
  assert.equal(first.dataset.loaded, 'true');
});

test('HTML schedules independent shell before application and does not schedule legacyApp', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const shellIndex=html.indexOf('<script type="module" src="src/bootstrap/shellEntry.js"></script>');
  const appIndex=html.indexOf('<script type="module" src="src/bootstrap/app.js"></script>');
  assert.ok(shellIndex >= 0);
  assert.ok(appIndex > shellIndex);
  assert.doesNotMatch(html, /<script[^>]+src="src\/legacy\/legacyApp\.js"/);
});

test('legacy runtime remains a classic-script source without module declarations', async () => {
  const source = await readFile(new URL('../legacy/legacyApp.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*(?:import|export)\s/m);
  assert.match(source, /installLegacyCompatibilityBoundary\(\);\s*\nloadData\(\);/);
});
