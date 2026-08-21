import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAppSessionCache, installLogoutSessionGuard } from './logoutSessionGuard.js';

function makeStorage(entries={}){
  const map=new Map(Object.entries(entries));
  return {
    get length(){ return map.size; },
    key(i){ return [...map.keys()][i] ?? null; },
    removeItem(key){ map.delete(key); },
    getItem(key){ return map.get(key) ?? null; },
  };
}

test('clearAppSessionCache removes only Project-tree app keys', ()=>{
  const storage=makeStorage({
    'gtasks-clone-v2':'projects',
    'gtasks-task-recovery-v1':'tasks',
    'karha_user_profile_v1':'profile',
    'other-app-key':'keep',
  });
  assert.equal(clearAppSessionCache(storage),3);
  assert.equal(storage.getItem('gtasks-clone-v2'),null);
  assert.equal(storage.getItem('karha_user_profile_v1'),null);
  assert.equal(storage.getItem('other-app-key'),'keep');
});

test('guard preserves guest cache on initial signed-out startup', ()=>{
  let callback;
  let reloads=0;
  const storage=makeStorage({'gtasks-clone-v2':'guest'});
  const windowRef={
    firebase:{auth:()=>({currentUser:null,onAuthStateChanged(fn){callback=fn;}})},
    localStorage:storage,
    sessionStorage:{clear(){}},
    location:{reload(){reloads++;}},
  };
  assert.equal(installLogoutSessionGuard({windowRef}),true);
  callback(null);
  assert.equal(storage.getItem('gtasks-clone-v2'),'guest');
  assert.equal(reloads,0);
});

test('guard clears app cache and reloads on authenticated logout', ()=>{
  let callback;
  let reloads=0;
  let sessionClears=0;
  const storage=makeStorage({
    'gtasks-clone-v2':'account-data',
    'gtasks-task-recovery-v1':'account-tasks',
    'karha_status_reports_v1':'reports',
    'other-app-key':'keep',
  });
  const auth={currentUser:{uid:'u1'},onAuthStateChanged(fn){callback=fn;}};
  const windowRef={
    firebase:{auth:()=>auth},
    localStorage:storage,
    sessionStorage:{clear(){sessionClears++;}},
    location:{reload(){reloads++;}},
  };
  installLogoutSessionGuard({windowRef});
  callback(null);
  assert.equal(storage.getItem('gtasks-clone-v2'),null);
  assert.equal(storage.getItem('gtasks-task-recovery-v1'),null);
  assert.equal(storage.getItem('karha_status_reports_v1'),null);
  assert.equal(storage.getItem('other-app-key'),'keep');
  assert.equal(sessionClears,1);
  assert.equal(reloads,1);
});
