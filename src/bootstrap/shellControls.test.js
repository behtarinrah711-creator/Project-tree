import test from 'node:test';
import assert from 'node:assert/strict';
import { bindShellControls } from './shellControls.js';

function element(id){
  const listeners = {};
  const classes = new Set(id === 'drawerOverlay' ? ['hidden'] : []);
  return {
    id, dataset: {}, textContent:'',
    classList: { add:value=>classes.add(value), remove:value=>classes.delete(value), contains:value=>classes.has(value) },
    addEventListener(type, handler){ (listeners[type] ||= []).push(handler); },
    async click(target=this){
      for(const handler of (listeners.click || [])) await handler({target});
    },
    listenerCount(type){ return (listeners[type] || []).length; },
  };
}

function harness({user=null,popupError=null,withFirebase=true}={}){
  const elements = Object.fromEntries(['drawerOverlay','hamburgerBtn','avatarBtn','drawerSigninBtn','toast'].map(id=>[id,element(id)]));
  const events=[];
  class CustomEvent { constructor(type,options={}){ this.type=type; this.detail=options.detail; } }
  const auth = {
    currentUser:user, popupCalls:0, redirectCalls:0, signoutCalls:0,
    async signOut(){ this.signoutCalls++; },
    async signInWithPopup(){ this.popupCalls++; if(popupError) throw popupError; },
    async signInWithRedirect(){ this.redirectCalls++; },
  };
  const authFactory=()=>auth;
  authFactory.GoogleAuthProvider=class {};
  const windowRef={
    CustomEvent,
    dispatchEvent:event=>events.push(event),
    setTimeout:fn=>{ fn(); return 1; },
    location:{hostname:'behtarinrah711-creator.github.io'},
  };
  if(withFirebase) windowRef.firebase={auth:authFactory};
  return {elements,auth,events,windowRef,documentRef:{getElementById:id=>elements[id]}};
}

test('empty-storage shell opens the drawer before project startup', async () => {
  const h=harness();
  assert.equal(bindShellControls(h),true);
  await h.elements.hamburgerBtn.click();
  assert.equal(h.elements.drawerOverlay.classList.contains('hidden'),false);
  assert.deepEqual(h.events.map(event=>event.type),['karha:drawer-open']);
});

test('logged-out login starts Firebase popup and binding is idempotent', async () => {
  const h=harness();
  bindShellControls(h);
  bindShellControls(h);
  assert.equal(h.elements.drawerSigninBtn.listenerCount('click'),1);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,1);
});

test('logged-in account action signs out and closes the drawer', async () => {
  const h=harness({user:{uid:'user-1'}});
  bindShellControls(h);
  await h.elements.hamburgerBtn.click();
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.signoutCalls,1);
  assert.equal(h.elements.drawerOverlay.classList.contains('hidden'),true);
});

test('unauthorized domain is surfaced instead of silently redirecting', async () => {
  const h=harness({popupError:{code:'auth/unauthorized-domain',message:'unauthorized'}});
  bindShellControls(h);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,1);
  assert.equal(h.auth.redirectCalls,0);
  assert.match(h.elements.toast.textContent,/github\.io/);
  assert.equal(h.events.at(-1).type,'karha:auth-error');
});

test('popup blocked falls back to redirect', async () => {
  const h=harness({popupError:{code:'auth/popup-blocked',message:'blocked'}});
  bindShellControls(h);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,1);
  assert.equal(h.auth.redirectCalls,1);
});
