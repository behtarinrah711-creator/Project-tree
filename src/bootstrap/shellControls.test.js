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

function harness({user=null,popupErrors=[],fallbackPopupErrors=[],withFirebase=true}={}){
  const elements = Object.fromEntries(['drawerOverlay','hamburgerBtn','avatarBtn','drawerSigninBtn','toast'].map(id=>[id,element(id)]));
  const events=[];
  class CustomEvent { constructor(type,options={}){ this.type=type; this.detail=options.detail; } }
  const errors=[...popupErrors];
  const fallbackErrors=[...fallbackPopupErrors];
  const auth = {
    currentUser:user, popupCalls:0, redirectCalls:0, signoutCalls:0, updateCurrentUserCalls:0,
    async signOut(){ this.signoutCalls++; },
    async signInWithPopup(){ this.popupCalls++; const error=errors.shift(); if(error) throw error; return {user:{uid:'primary-user'}}; },
    async signInWithRedirect(){ this.redirectCalls++; },
    async updateCurrentUser(nextUser){ this.updateCurrentUserCalls++; this.currentUser=nextUser; },
  };
  const fallbackAuth = {
    popupCalls:0, signoutCalls:0,
    async signInWithPopup(){
      this.popupCalls++;
      const error=fallbackErrors.shift();
      if(error) throw error;
      return {user:{uid:'fallback-user'},credential:{providerId:'google.com'}};
    },
    async signOut(){ this.signoutCalls++; },
  };
  const defaultApp={options:{apiKey:'test',projectId:'tree-d92af',authDomain:'tree-d92af.firebaseapp.com'},auth:()=>auth};
  let fallbackApp=null;
  const authFactory=()=>auth;
  authFactory.GoogleAuthProvider=class {};
  authFactory.GoogleAuthProvider.credentialFromResult=result=>result?.credential || null;
  const firebaseRef={
    auth:authFactory,
    app(name){
      if(!name) return defaultApp;
      if(name==='karha-auth-webapp-fallback' && fallbackApp) return fallbackApp;
      throw new Error('app does not exist');
    },
    initializeApp(options,name){
      assert.equal(name,'karha-auth-webapp-fallback');
      assert.equal(options.authDomain,'tree-d92af.web.app');
      fallbackApp={options,auth:()=>fallbackAuth};
      return fallbackApp;
    },
  };
  const windowRef={
    CustomEvent,
    dispatchEvent:event=>events.push(event),
    setTimeout:fn=>{ fn(); return 1; },
    location:{hostname:'behtarinrah711-creator.github.io'},
  };
  if(withFirebase) windowRef.firebase=firebaseRef;
  return {elements,auth,fallbackAuth,events,windowRef,documentRef:{getElementById:id=>elements[id]}};
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
  const h=harness({popupErrors:[{code:'auth/unauthorized-domain',message:'unauthorized'}]});
  bindShellControls(h);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,1);
  assert.equal(h.auth.redirectCalls,0);
  assert.match(h.elements.toast.textContent,/github\.io/);
  assert.equal(h.events.at(-1).type,'karha:auth-error');
});

test('popup blocked falls back to redirect', async () => {
  const h=harness({popupErrors:[{code:'auth/popup-blocked',message:'blocked'}]});
  bindShellControls(h);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,1);
  assert.equal(h.auth.redirectCalls,1);
});

test('network failure retries primary popup once and succeeds when retry works', async () => {
  const h=harness({popupErrors:[{code:'auth/network-request-failed',message:'network'}]});
  bindShellControls(h);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,2);
  assert.equal(h.fallbackAuth.popupCalls,0);
});

test('two primary network failures use web.app auth fallback and hand off the user', async () => {
  const h=harness({popupErrors:[
    {code:'auth/network-request-failed',message:'network-1'},
    {code:'auth/network-request-failed',message:'network-2'},
  ]});
  bindShellControls(h);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,2);
  assert.equal(h.auth.redirectCalls,0);
  assert.equal(h.fallbackAuth.popupCalls,1);
  assert.equal(h.auth.updateCurrentUserCalls,1);
  assert.equal(h.auth.currentUser.uid,'fallback-user');
  assert.equal(h.fallbackAuth.signoutCalls,1);
});

test('alternate domain failure is surfaced without pretending login succeeded', async () => {
  const h=harness({
    popupErrors:[
      {code:'auth/network-request-failed',message:'network-1'},
      {code:'auth/network-request-failed',message:'network-2'},
    ],
    fallbackPopupErrors:[{code:'auth/network-request-failed',message:'fallback-network'}],
  });
  bindShellControls(h);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.fallbackAuth.popupCalls,1);
  assert.equal(h.auth.updateCurrentUserCalls,0);
  assert.match(h.elements.toast.textContent,/هر دو دامنه Firebase/);
});
