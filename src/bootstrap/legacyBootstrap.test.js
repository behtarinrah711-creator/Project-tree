import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadLegacyRuntime } from './legacyBootstrap.js';

function createDocumentHarness(){
  let runtimeScript = null;
  const template = { innerHTML:'', content:{ firstElementChild:{nodeName:'DIV'} } };
  const documentRef = {
    querySelector(){ return runtimeScript; },
    createElement(tagName){
      if(tagName === 'template') return template;
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
  return { documentRef, template, getRuntimeScript: () => runtimeScript };
}

test('legacy loader installs required global HTML helper before classic runtime', async () => {
  const harness = createDocumentHarness();
  const windowRef = {};
  await loadLegacyRuntime({ documentRef: harness.documentRef, windowRef, sourceUrl: '/legacyApp.js' });

  assert.equal(typeof windowRef.elFromHtml, 'function');
  assert.equal(windowRef.elFromHtml(' <div>x</div> '), harness.template.content.firstElementChild);
  assert.equal(harness.template.innerHTML, '<div>x</div>');
});

test('legacy loader creates one ordered classic script', async () => {
  const harness = createDocumentHarness();
  const windowRef = {};
  const first = await loadLegacyRuntime({ documentRef: harness.documentRef, windowRef, sourceUrl: '/legacyApp.js' });
  const second = await loadLegacyRuntime({ documentRef: harness.documentRef, windowRef, sourceUrl: '/legacyApp.js' });

  assert.equal(first, second);
  assert.equal(first.src, '/legacyApp.js');
  assert.equal(first.async, false);
  assert.equal(first.type, undefined);
  assert.equal(first.dataset.loaded, 'true');
});

test('HTML has independent shell and application entries and no direct legacyApp script', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="src\/bootstrap\/shellEntry\.js"><\/script>/);
  assert.match(html, /<script type="module" src="src\/bootstrap\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script[^>]+src="src\/legacy\/legacyApp\.js"/);
});

test('legacy runtime remains a classic-script source without module declarations', async () => {
  const source = await readFile(new URL('../legacy/legacyApp.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*(?:import|export)\s/m);
  assert.match(source, /installLegacyCompatibilityBoundary\(\);\s*\nloadData\(\);/);
});
