import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
async function sources(directory=root){
  const entries=await readdir(directory,{withFileTypes:true});
  return (await Promise.all(entries.map(async entry=>{
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory()) return sources(absolute);
    if(entry.isFile()&&entry.name.endsWith('.js')&&!entry.name.endsWith('.test.js')) return readFile(absolute,'utf8');
    return '';
  }))).flat();
}

test('C4 production Karha global references stay within the reviewed ceiling',async()=>{
  const text=(await sources()).join('\n');
  const references=text.match(/\bwindow(?:Ref)?\.Karha[A-Za-z0-9_$]*/g)||[];
  // Machine-readable ceiling: C4 correction reduced the branch from 509.
  assert.ok(references.length <= 352, `review Karha global growth: ${references.length}`);
});
