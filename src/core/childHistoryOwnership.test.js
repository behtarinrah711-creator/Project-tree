import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

test('only Router and childHistoryController install production popstate listeners',()=>{
  const output=execFileSync('rg',['-l',"addEventListener\\(['\\\"]popstate",'src','--glob','*.js','--glob','!*.test.js'],{encoding:'utf8'}).trim().split('\n').sort();
  assert.deepEqual(output,['src/core/childHistoryController.js','src/core/router.js']);
});

test('presentation and Contract compatibility contain no browser-history implementation',async()=>{
  for(const relative of ['../ui/workspacePresentationRuntime.js','../modules/contracts/contractCompatibility.js']){
    const source=await readFile(new URL(relative,import.meta.url),'utf8');
    assert.doesNotMatch(source,/history\.(?:pushState|replaceState|back|go)|addEventListener\(['"]popstate/);
  }
  const compatibility=await readFile(new URL('../modules/contracts/contractCompatibility.js',import.meta.url),'utf8');
  assert.doesNotMatch(compatibility,/\blet\s+(?:dirty|state|.*History)/);
  assert.match(compatibility,/KarhaContractFormLifecycle/);
});
