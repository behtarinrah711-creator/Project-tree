import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));

describe('KarhaRealContractForm global bridge', () => {
  it('contracts index installs window.KarhaRealContractForm', () => {
    const src = readFileSync(join(dir, 'index.js'), 'utf8');
    assert.match(
      src,
      /window\.KarhaRealContractForm\s*=\s*realContractFormModule/,
      'index.js must assign realContractFormModule to window.KarhaRealContractForm'
    );
  });

  it('routes canonical UI primitives through KarhaUI before legacy fallback', () => {
    const src = readFileSync(join(dir, 'realContractFormModule.js'), 'utf8');
    const helper = src.match(/function helper\(name, \.\.\.args\) \{([\s\S]*?)\n\}/)?.[1] || '';
    assert.match(helper, /window\.KarhaUI\?\.\[name\]/, 'helper must consult KarhaUI');
    assert.match(helper, /return window\.KarhaUI\[name\]\(\.\.\.args\)/, 'helper must call the canonical KarhaUI primitive');
    assert.ok(
      helper.indexOf('window.KarhaUI') < helper.indexOf('legacy(name, ...args)'),
      'KarhaUI must be preferred before the compatibility fallback'
    );
  });

  it('uses the consumed contract-form transition as the Back authority', () => {
    const src = readFileSync(join(dir, 'realContractFormModule.js'), 'utf8');
    const requestClose = src.match(/requestClose\(fromPopState = false, transition = null\) \{([\s\S]*?)\n  \},\n\n  saveDraft/)?.[1] || '';
    assert.match(requestClose, /restoreConsumedForm\?\.\(transition\)/, 'Stay must restore the consumed canonical contract-form entry');
    assert.match(requestClose, /transition\?\.consumed/, 'requestClose must inspect the explicit consumed transition');
    assert.match(requestClose, /transition\?\.layer\?\.key\s*===\s*'contract-form'/, 'only a consumed contract-form transition may be restored');
    assert.doesNotMatch(requestClose, /formOwned\?\.\(\)/, 'Back handling must not infer ownership after the controller already popped the form layer');
  });
});
