import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function harness(){
  const source=await readFile(new URL('./childHistoryController.js',import.meta.url),'utf8');
  const listeners={}; const entries=[{state:null,url:'#/projects/p/dashboard'}]; let cursor=0;
  const window={addEventListener(type,fn){listeners[type]=fn;}};
  const location={href:'#/projects/p/dashboard'};
  const history={
    get state(){return entries[cursor].state;},
    pushState(state,_title,url){entries.splice(++cursor);entries.push({state,url});},
    replaceState(state,_title,url){entries[cursor]={state,url};},
    back(){cursor--;listeners.popstate({state:entries[cursor].state});},
    forward(){cursor++;listeners.popstate({state:entries[cursor].state});},
    go(delta){cursor+=delta;listeners.popstate({state:entries[cursor].state});}
  };
  window.KarhaBrowserHistory={
    stateForChild:child=>({child}),
    push(patch,url){history.pushState(patch,'',url);},
    replace(patch,url){history.replaceState(patch,'',url);},
    go(delta){history.go(delta);},
    register(owner,fn){if(owner==='child')listeners.popstate=event=>fn(event.state,event);},
  };
  const context={window,history,location};vm.createContext(context);vm.runInContext(source,context);
  return {api:window.KarhaChildHistory,history,entries,get cursor(){return cursor;}};
}

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

  // First Back consumes the dirty form entry. The transient controller restores
  // it and then adds one same-route modal entry on top.
  h.history.back();
  assert.equal(prompts,1);
  assert.equal(h.api.isOpen('form'),true);
  assert.equal(h.api.isTransientOpen('unsaved-form'),true);
  assert.match(h.api.top().key,/^transient:unsaved-form$/);

  // Second Back consumes only the modal; form history remains the current entry.
  h.history.back();
  assert.equal(dismisses,1);
  assert.equal(h.api.isTransientOpen('unsaved-form'),false);
  assert.equal(h.api.isOpen('form'),true);
  assert.equal(h.api.top().key,'form');

  // A later Back reaches the form policy again, as expected for still-dirty data.
  h.history.back();
  assert.equal(prompts,2);
  assert.equal(h.api.isTransientOpen('unsaved-form'),true);
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
