import { test } from 'node:test';
import assert from 'node:assert/strict';

test('contracts renderer wires the real list Add button to the contract form', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let openedWith = 'not-called';
  const add = {};
  const body = { innerHTML: '' };

  globalThis.window = {
    location: { hash: '' },
    KarhaLegacy: { openContractForm(id){ openedWith = id; } }
  };
  globalThis.document = {
    getElementById(id){
      if(id === 'contractAddBtn') return add;
      if(id === 'contractsPageBody') return body;
      return null;
    }
  };

  try {
    const { default: contractsModule } = await import('./contractsModule.js');
    contractsModule.render();
    assert.equal(typeof add.onclick, 'function');
    add.onclick();
    assert.equal(openedWith, null);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
