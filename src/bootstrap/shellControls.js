const byId = (documentRef, id) => documentRef.getElementById(id);

const AUTH_READY_TIMEOUT_MS = 5000;
const AUTH_READY_POLL_MS = 50;
const AUTH_POPUP_RETRY_MS = 250;
const FALLBACK_AUTH_APP_NAME = 'karha-auth-webapp-fallback';
const FALLBACK_AUTH_DOMAIN = 'tree-d92af.web.app';

function sleep(windowRef, ms){
  return new Promise(resolve => (windowRef.setTimeout || setTimeout)(resolve, ms));
}

async function waitForFirebaseAuth(windowRef, timeoutMs = AUTH_READY_TIMEOUT_MS){
  const started = Date.now();
  while(Date.now() - started < timeoutMs){
    const firebaseRef = windowRef.firebase;
    if(firebaseRef?.auth && firebaseRef.auth.GoogleAuthProvider) return firebaseRef;
    await sleep(windowRef, AUTH_READY_POLL_MS);
  }
  return null;
}

function authErrorMessage(error, windowRef){
  const code = String(error?.code || '');
  if(code.includes('unauthorized-domain')){
    const domain = windowRef.location?.hostname || 'این دامنه';
    return `ورود گوگل برای ${domain} در Firebase مجاز نشده است`;
  }
  if(code.includes('popup-blocked')) return 'مرورگر پنجره ورود گوگل را مسدود کرده است';
  if(code.includes('network-request-failed')) return 'ارتباط با سرویس ورود برقرار نشد؛ هر دو دامنه Firebase امتحان شدند';
  if(code.includes('popup-closed-by-user')) return '';
  return error?.message ? `ورود انجام نشد: ${error.message}` : 'ورود با گوگل انجام نشد';
}

function reportAuthError(error, {windowRef, documentRef}){
  const message = authErrorMessage(error, windowRef);
  if(!message) return;
  const toast = byId(documentRef, 'toast');
  if(toast){
    toast.textContent = message;
    toast.classList.add('show');
    (windowRef.setTimeout || setTimeout)(()=>toast.classList.remove('show'), 7000);
  } else if(typeof windowRef.alert === 'function'){
    windowRef.alert(message);
  }
  try{
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:auth-error', {detail:{code:error?.code || '', message}}));
  }catch{}
}

function getFallbackAuth(firebaseRef){
  let fallbackApp=null;
  try{
    fallbackApp=firebaseRef.app(FALLBACK_AUTH_APP_NAME);
  }catch{}
  if(!fallbackApp){
    const defaultOptions=firebaseRef.app().options || {};
    fallbackApp=firebaseRef.initializeApp({...defaultOptions,authDomain:FALLBACK_AUTH_DOMAIN},FALLBACK_AUTH_APP_NAME);
  }
  return fallbackApp.auth();
}

async function handoffFallbackUser(firebaseRef, primaryAuth, result){
  if(result?.user && typeof primaryAuth.updateCurrentUser === 'function'){
    await primaryAuth.updateCurrentUser(result.user);
    return true;
  }
  const credential=result?.credential || firebaseRef.auth.GoogleAuthProvider.credentialFromResult?.(result);
  if(credential && typeof primaryAuth.signInWithCredential === 'function'){
    await primaryAuth.signInWithCredential(credential);
    return true;
  }
  const error=new Error('Google credential was not returned by fallback auth');
  error.code='auth/fallback-credential-missing';
  throw error;
}

async function alternateDomainSignIn(firebaseRef, primaryAuth, provider, context){
  try{
    const fallbackAuth=getFallbackAuth(firebaseRef);
    const result=await fallbackAuth.signInWithPopup(provider);
    await handoffFallbackUser(firebaseRef, primaryAuth, result);
    try{ await fallbackAuth.signOut?.(); }catch{}
    return true;
  }catch(error){
    reportAuthError(error, context);
    return false;
  }
}

async function redirectSignIn(auth, provider, context){
  try{
    await auth.signInWithRedirect(provider);
    return true;
  }catch(error){
    reportAuthError(error, context);
    return false;
  }
}

async function startGoogleSignIn(firebaseRef, auth, provider, context){
  try{
    await auth.signInWithPopup(provider);
    return true;
  }catch(firstError){
    const firstCode = String(firstError?.code || '');

    if(firstCode.includes('network-request-failed')){
      await sleep(context.windowRef, AUTH_POPUP_RETRY_MS);
      try{
        await auth.signInWithPopup(provider);
        return true;
      }catch(retryError){
        const retryCode = String(retryError?.code || '');
        // A fresh-login failure on some Android networks is specific to the
        // default *.firebaseapp.com OAuth helper. The same Firebase project also
        // exposes the official helper on *.web.app; try that host before giving up.
        if(retryCode.includes('network-request-failed')){
          return alternateDomainSignIn(firebaseRef, auth, provider, context);
        }
        if(retryCode.includes('popup-blocked') || retryCode.includes('operation-not-supported-in-this-environment')){
          return redirectSignIn(auth, provider, context);
        }
        reportAuthError(retryError, context);
        return false;
      }
    }

    if(firstCode.includes('popup-blocked') || firstCode.includes('operation-not-supported-in-this-environment')){
      return redirectSignIn(auth, provider, context);
    }

    reportAuthError(firstError, context);
    return false;
  }
}

/**
 * Bind the account drawer before the project/task runtime starts.
 *
 * These controls are deliberately project-agnostic: a missing active project,
 * empty localStorage, or a later renderer exception must not make authentication
 * unreachable.
 */
export function bindShellControls({ windowRef = window, documentRef = document } = {}){
  const drawer = byId(documentRef, 'drawerOverlay');
  const hamburger = byId(documentRef, 'hamburgerBtn');
  const avatar = byId(documentRef, 'avatarBtn');
  const signin = byId(documentRef, 'drawerSigninBtn');
  if(!drawer || !hamburger || !avatar || !signin) return false;
  if(drawer.dataset.shellControlsBound === 'true') return true;
  drawer.dataset.shellControlsBound = 'true';

  const open = () => {
    drawer.classList.remove('hidden');
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:drawer-open'));
  };
  const close = () => drawer.classList.add('hidden');

  hamburger.addEventListener('click', open);
  avatar.addEventListener('click', open);
  drawer.addEventListener('click', event => {
    if(event.target === drawer) close();
  });
  signin.addEventListener('click', async () => {
    if(signin.dataset.authBusy === 'true') return;
    signin.dataset.authBusy = 'true';
    try{
      const firebaseRef = await waitForFirebaseAuth(windowRef);
      if(!firebaseRef){
        reportAuthError({code:'auth/sdk-not-ready', message:'Firebase Auth آماده نشد'}, {windowRef, documentRef});
        return;
      }

      const auth = firebaseRef.auth();
      if(auth.currentUser){
        await auth.signOut();
        close();
        return;
      }

      const provider = new firebaseRef.auth.GoogleAuthProvider();
      await startGoogleSignIn(firebaseRef, auth, provider, {windowRef, documentRef});
    } finally {
      delete signin.dataset.authBusy;
    }
  });
  return true;
}
