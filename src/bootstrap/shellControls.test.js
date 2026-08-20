import test from 'node:test';
import assert from 'node:assert/strict';
import { bindShellControls } from './shellControls.js';

function element(id){
  const listeners = {};
  const classes = new Set(id === 'drawerOverlay' ? ['hidden'] : []);
  return {
    id, dataset: {},
    classList: { add:value=>classes.add(value), remove:value=>classes.delete(value), contains:value=>classes.has(value) },
    addEventListener(type, handler){ (listeners[type] ||= []).push(handler); },
    click(target=this){ (listeners.click || []).forEach(handler=>handler({target})); },
    listenerCount(type){ return (listeners[type] || []).length; },
  };
}

function harness({user=null}={}){
  const elements = Object.fromEntries(['drawerOverlay','hamburgerBtn','avatarBtn','drawerSigninBtn'].map(id=>[id,element(id)]));
  const events=[];
  class CustomEvent { constructor(type){ this.type=type; } }
  const auth = {
    currentUser:user, popupCalls:0, redirectCalls:0, signoutCalls:0,
    signOut(){ this.signoutCalls++; return Promise.resolve(); },
    signInWithPopup(){ this.popupCalls++; return Promise.resolve(); },
    signInWithRedirect(){ this.redirectCalls++; return Promise.resolve(); },
  };
  const authFactory=()=>auth;
  authFactory.GoogleAuthProvider=class {};
  const windowRef={CustomEvent, dispatchEvent:event=>events.push(event.type), firebase:{auth:authFactory}};
  return {elements,auth,events,windowRef,documentRef:{getElementById:id=>elements[id]}};
}

test('empty-storage shell opens the drawer before project startup', () => {
  const h=harness();
  assert.equal(bindShellControls(h),true);
  h.elements.hamburgerBtn.click();
  assert.equal(h.elements.drawerOverlay.classList.contains('hidden'),false);
  assert.deepEqual(h.events,['karha:drawer-open']);
});

test('logged-out login starts Firebase popup and binding is idempotent', () => {
  const h=harness();
  bindShellControls(h);
  bindShellControls(h);
  assert.equal(h.elements.drawerSigninBtn.listenerCount('click'),1);
  h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,1);
});

test('logged-in account action signs out and closes the drawer', () => {
  const h=harness({user:{uid:'user-1'}});
  bindShellControls(h);
  h.elements.hamburgerBtn.click();
  h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.signoutCalls,1);
  assert.equal(h.elements.drawerOverlay.classList.contains('hidden'),true);
});
