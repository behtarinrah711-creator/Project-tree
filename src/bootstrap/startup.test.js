import test from 'node:test';
import assert from 'node:assert/strict';
import { runApplicationStartup } from './startupRunner.js';

function shellHarness(){
  const listeners={};
  const makeElement=id=>{
    const handlers={};
    const classes=new Set(id==='drawerOverlay'?['hidden']:[]);
    return {id,dataset:{},classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)},
      addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn),
      click(){ (handlers.click||[]).forEach(fn=>fn({target:this})); }};
  };
  const elements=Object.fromEntries(['drawerOverlay','hamburgerBtn','avatarBtn','drawerSigninBtn'].map(id=>[id,makeElement(id)]));
  class CustomEvent{ constructor(type,init={}){this.type=type;this.detail=init.detail;} }
  const windowRef={CustomEvent,firebase:{auth:()=>({currentUser:null})},dispatchEvent:event=>(listeners[event.type]||[]).forEach(fn=>fn(event)),addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn)};
  return {windowRef,documentRef:{getElementById:id=>elements[id]},elements};
}

test('application rejection is observable and cannot disable the independent shell', async () => {
  const h=shellHarness();
  let initialized=0;
  const authFactory=()=>({currentUser:null});
  const firebaseRef={apps:[],initializeApp(){initialized++;this.apps.push({});},auth:authFactory};
  h.windowRef.firebase=firebaseRef;
  const errors=[]; let startupError=null;
  h.windowRef.addEventListener('karha:startup-error',event=>{startupError=event.detail.error;});
  const oldWindow=globalThis.window;
  const oldDocument=globalThis.document;
  globalThis.window=h.windowRef;
  globalThis.document=h.documentRef;
  try{
    await import(`./shellEntry.js?test=${Date.now()}`);
  }finally{
    globalThis.window=oldWindow;
    globalThis.document=oldDocument;
  }
  const failure=new Error('intentional application failure');
  await assert.rejects(runApplicationStartup(()=>Promise.reject(failure),{
    windowRef:h.windowRef,consoleRef:{error:(...args)=>errors.push(args)},
  }),failure);
  assert.equal(startupError,failure);
  assert.equal(errors.length,1);
  assert.equal(initialized,1);
  h.elements.hamburgerBtn.click();
  assert.equal(h.elements.drawerOverlay.classList.contains('hidden'),false);
});

test('successful application startup publishes KarhaApp, loads legacy, then starts router', async () => {
  const oldWindow=globalThis.window;
  const oldDocument=globalThis.document;
  const oldCustomEvent=globalThis.CustomEvent;
  class CustomEvent{constructor(type){this.type=type;}}
  const events=[];
  const stored=JSON.stringify({projects:[{id:'project-1',name:'Existing project',tasks:[{id:'task-1',text:'Existing task'}]}]});
  globalThis.window={location:{search:'',hash:''},localStorage:{getItem:key=>key==='gtasks-clone-v2'?stored:null,setItem(){},removeItem(){}},CustomEvent,dispatchEvent:event=>events.push(event.type)};
  globalThis.document={getElementById:()=>({}),readyState:'complete'};
  globalThis.CustomEvent=CustomEvent;
  try{
    const {startApplication}=await import(`./applicationStartup.js?test=${Date.now()}`);
    const order=[];
    const registry={registered:[],register(module){this.registered.push(module);}};
    const app=await startApplication({registry,modules:[{id:'dashboard'}],legacyLoader:async()=>order.push('legacy'),router:{start:()=>order.push('router')},windowRef:globalThis.window});
    assert.equal(app,globalThis.window.KarhaApp);
    assert.deepEqual(registry.registered,[{id:'dashboard'}]);
    assert.deepEqual(order,['legacy','router']);
    assert.deepEqual(events,['karha:ready']);
    assert.equal(app.projectWorkspace.listProjects()[0].id,'project-1');
    assert.equal(app.taskRuntime.list('project-1')[0].id,'task-1');
  }finally{
    globalThis.window=oldWindow;
    globalThis.document=oldDocument;
    globalThis.CustomEvent=oldCustomEvent;
  }
});
