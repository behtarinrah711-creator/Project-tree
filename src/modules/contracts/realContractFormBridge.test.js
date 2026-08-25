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
});
