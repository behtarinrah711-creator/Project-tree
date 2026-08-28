import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function harness({asyncTraversal=false}={}){
  const source=await readFile(new URL('./childHistoryController.js',import.meta.url),'utf8');
  const listeners={}; const entries=[{state:null,url:'#/projects/p/dashboard'}]; let cursor=0;
  const exitGuards=new Map();
  const window={addEventListener(type,fn){listeners[type]=fn;}};
  const location={href:'#/projects/p/dashboard'};
  const history={
    get state(){return entries[cursor].state;},
    pushState(state,_title,url){entries.splice(++cursor);entries.push({state,url});},
    replaceState(state,_title,url){entries[cursor]={state,url};},
    back(){cursor--;listeners.popstate({state:entries[cursor].state});},
    forward(){cursor++;listeners.popstate({state:entries[cursor].state});},
    go(delta){
      const traverse=()=>{cursor+=delta;listeners.popstate({state:entries[cursor].state});};
      if(asyncTraversal) queueMicrotask(traverse); else traverse();
    }
  };
  window.KarhaBrowserHistory={
    current:()=>history.state,
    stateForChild:child=>({child}),
    push(patch,url){history.pushState(patch,'',url);},
    replace(patch,url){history.replaceState(patch,'',url);},
    go(delta){history.go(delta);},
    register(owner,fn){if(owner==='child')listeners.popstate=event=>fn(event.state,event);},
    registerExitGuard(owner,fn){exitGuards.set(owner,fn);return()=>exitGuards.delete(owner);},
  };
  const context={window,history,location,queueMicrotask,Promise};vm.createContext(context);vm.runInContext(source,context);
  return {api:window.KarhaChildHistory,history,entries,exitGuards,get cursor(){return cursor;}};
}

const settle=()=>new Promise(resolve=>queueMicrotask(resolve));

test('transient is revealed only after the consumed real Forward entry settles',async()=>{
  const h=await harness({asyncTraversal:true});
  let ready=0;
  h.api.register('contracts');
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice',{onReady:()=>ready++})});
  h.api.open('contracts');
  h.api.open('form');

  h.history.back();
  assert.equal(ready,0);
  assert.equal(h.api.top().key,'form');

  await settle();
  await settle(); // the original form Forward entry commits, then prompt opens
  assert.equal(ready,1);
  assert.equal(h.history.state.child.key,'transient:choice');
  assert.equal(h.entries[h.cursor-1].state.child.key,'form');
  assert.equal(h.entries[h.cursor-2].state.child.key,'contracts');
});

test('registration, top-only Back, deduplication and unregister',async()=>{
  const h=await harness(); const events=[];
  const unregisterA=h.api.register('a',{onPop:()=>events.push('a')});
  h.api.register('b',{onPop:()=>events.push('b')});
  h.api.open('a');h.api.open('a');h.api.open('b');
  assert.equal(h.entries.length,3);
  h.history.back();assert.deepEqual(events,['b']);assert.equal(h.api.isOpen('a'),true);
  unregisterA();assert.equal(h.api.isOpen('a'),false);
});

test('Back and Forward close and restore a child without remounting parent',async()=>{
  const h=await harness();let closes=0,restores=0,parentMounts=1;
  h.api.register('picker',{onPop:()=>closes++,onRestore:()=>restores++});
  h.api.open('picker',{field:'date'});h.history.back();h.history.forward();
  assert.equal(closes,1);assert.equal(restores,1);assert.equal(parentMounts,1);
  assert.deepEqual({...h.api.top().payload},{field:'date'});
});

test('transient modal Back dismisses only the modal and returns to the restored dirty form',async()=>{
  const h=await harness();
  let prompts=0;
  let dismisses=0;
  h.api.register('form',{
    onPop:()=>{
      prompts++;
      h.api.presentTransient('unsaved-form',{onDismiss:()=>dismisses++});
    }
  });

  h.api.open('form');
  assert.equal(h.api.top().key,'form');

  h.history.back();
  await settle();
  assert.equal(prompts,1);
  assert.equal(h.api.isOpen('form'),true);
  assert.equal(h.api.isTransientOpen('unsaved-form'),true);
  assert.match(h.api.top().key,/^transient:unsaved-form$/);
  assert.equal(h.history.state.child.id,h.api.top().id);
  assert.equal(h.entries[h.cursor-1].state.child.key,'form');

  h.history.back();
  assert.equal(dismisses,1);
  assert.equal(h.api.isTransientOpen('unsaved-form'),false);
  assert.equal(h.api.isOpen('form'),true);
  assert.equal(h.api.top().key,'form');
  assert.equal(h.history.state.child.id,h.api.top().id);
  assert.equal(h.exitGuards.get('child')(),true);

  h.history.back();
  await settle();
  assert.equal(prompts,2);
  assert.equal(h.api.isTransientOpen('unsaved-form'),true);
});

test('dirty form and transient settle for ten Back dismissal transactions',async()=>{
  const h=await harness();
  let dismisses=0;
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice',{onDismiss:()=>dismisses++})});
  h.api.open('form');

  for(let cycle=0;cycle<10;cycle++){
    h.history.back();
    assert.equal(h.api.top().key,'transient:choice');
    assert.equal(h.history.state.child.id,h.api.top().id);
    assert.equal(h.entries[h.cursor-1].state.child.key,'form');

    h.history.back();
    assert.equal(h.api.top().key,'form');
    assert.equal(h.history.state.child.id,h.api.top().id);
  }
  assert.equal(dismisses,10);
});

test('document exit protection is released when the restored dirty child resolves',async()=>{
  const h=await harness();
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice')});
  h.api.open('form');
  h.history.back();
  assert.equal(h.exitGuards.get('child')(),true);
  h.api.dismissTransient('choice',{after:()=>h.api.consume('form',{fromPopState:true})});
  assert.equal(h.exitGuards.get('child')(),false);
});

test('dirty transient restore preserves the real parent child stack',async()=>{
  const h=await harness();
  let prompts=0;
  let dismisses=0;
  const parentPops=[];

  h.api.register('contracts',{onPop:()=>parentPops.push('contracts')});
  h.api.register('form',{
    onPop:()=>{
      prompts++;
      h.api.presentTransient('unsaved-form',{onDismiss:()=>dismisses++});
    }
  });

  h.api.open('contracts');
  h.api.open('form');
  assert.equal(h.api.getDepth(),2);
  assert.equal(h.api.top().key,'form');

  // First Back asks about the dirty form. Restoring that consumed form must not
  // pop the real parent ('contracts') while the form is temporarily absent.
  h.history.back();
  await settle();
  assert.equal(prompts,1);
  assert.equal(parentPops.length,0);
  assert.equal(h.api.isOpen('contracts'),true);
  assert.equal(h.api.isOpen('form'),true);
  assert.equal(h.api.isTransientOpen('unsaved-form'),true);
  assert.equal(h.api.getDepth(),3);

  // Back from the visible confirmation dismisses only that transient layer.
  h.history.back();
  assert.equal(dismisses,1);
  assert.equal(parentPops.length,0);
  assert.equal(h.api.isTransientOpen('unsaved-form'),false);
  assert.equal(h.api.isOpen('contracts'),true);
  assert.equal(h.api.isOpen('form'),true);
  assert.equal(h.api.top().key,'form');
  assert.equal(h.api.getDepth(),2);
});

test('a stale rapid traversal cannot consume more than one current child generation',async()=>{
  const h=await harness();
  let dismisses=0;
  h.api.register('contracts',{onPop:()=>assert.fail('parent must not be consumed by stale pop')});
  h.api.register('form',{onPop:()=>h.api.presentTransient('choice',{onDismiss:()=>dismisses++})});
  h.api.open('contracts');
  h.api.open('form');
  h.history.back();
  assert.equal(h.api.top().key,'transient:choice');
  assert.equal(h.exitGuards.get('child')(),true);

  // Chromium can commit a queued traversal to the old contracts entry rather
  // than the direct predecessor (the freshly reconstructed form entry).
  h.history.go(-3);
  assert.equal(dismisses,1);
  assert.equal(h.api.top().key,'form');
  assert.equal(h.history.state.child.key,'form');
  assert.equal(h.api.getDepth(),2);
});

test('UI dismissal of a transient settles its entry before running the requested action',async()=>{
  const h=await harness();
  const actions=[];
  h.api.open('form');
  h.api.presentTransient('choice',{onDismiss:()=>actions.push('back')});
  assert.equal(h.api.isTransientOpen('choice'),true);

  h.api.dismissTransient('choice',{after:()=>actions.push('yes')});
  assert.deepEqual(actions,['yes']);
  assert.equal(h.api.isTransientOpen('choice'),false);
  assert.equal(h.api.top().key,'form');
});
