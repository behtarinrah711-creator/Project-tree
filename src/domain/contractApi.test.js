import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canDeleteContract, findContractReferences } from './deleteGuard.js';

test('contract delete is blocked only by live contractStatusReports.contractId', () => {
  const projects = [{
    id:'p1',
    name:'P',
    contracts:[{id:'rc1'}],
    contractStatusReports:[{id:'csr1', contractId:'rc1'}],
  }];
  assert.deepEqual(findContractReferences(projects, 'rc1').map(r => r.kind), ['contractStatusReport']);
  assert.equal(canDeleteContract(projects, 'rc1').ok, false);
  projects[0].contractStatusReports[0].trashed = true;
  assert.equal(canDeleteContract(projects, 'rc1').ok, true);
});

test('contractApi persist after write is cloud-only', async () => {
  const source = await readFile(new URL('./contractApi.js', import.meta.url), 'utf8');
  assert.match(source, /persist\?\.\(\{\s*local\s*:\s*false\s*\}\)/);
  assert.doesNotMatch(source, /persist\?\.\(\)/);
});

test('contractApi owns template save and trash methods', async () => {
  const source = await readFile(new URL('./contractApi.js', import.meta.url), 'utf8');
  assert.match(source, /saveTemplate\s*\(/);
  assert.match(source, /trashTemplate\s*\(/);
  assert.match(source, /listTemplatesPage\s*\(/);
});
