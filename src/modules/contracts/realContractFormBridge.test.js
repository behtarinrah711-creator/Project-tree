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
});
