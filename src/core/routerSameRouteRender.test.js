import assert from 'node:assert/strict';
import test from 'node:test';

test('same-route replace queues one modular remount instead of synchronizing inline',async()=>{
  const listeners=new Map();
  globalThis.CustomEvent=class { constructor(type,init={}){this.type=type;this.detail=init.detail;} };
  globalThis.document={readyState:'complete'};
  globalThis.window={
    location:{hash:'#/projects/P/dashboard',search:''},
    addEventListener(type,listener){const list=listeners.get(type)||[];list.push(listener);listeners.set(type,list);},
    dispatchEvent(event){(listeners.get(event.type)||[]).forEach(listener=>listener(event));},
    history:{
      pushState(_s,_t,url){window.location.hash=url;},
      replaceState(_s,_t,url){window.location.hash=url;},
    },
  };
  const {AppRouter}=await import(`./router.js?same-route=${Date.now()}`);
  const {moduleRegistry}=await import('./moduleRegistry.js');
  let mounts=0;
  moduleRegistry.register({id:'dashboard',mount(){mounts++;return {projectId:'P',moduleId:'dashboard'};}});
  const router=new AppRouter();
  router.start();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(mounts,1);

  router.navigate('P','dashboard',{replace:true});
  router.navigate('P','dashboard',{replace:true});
  assert.equal(mounts,1,'same-stack legacy route replacement must not remount inline');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(mounts,2,'queued replacements coalesce into one final modular render');
});
