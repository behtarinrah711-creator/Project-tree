const byId = (documentRef, id) => documentRef.getElementById(id);

const AUTH_READY_TIMEOUT_MS = 5000;
const AUTH_READY_POLL_MS = 50;

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
  if(code.includes('network-request-failed')) return 'ارتباط با سرویس ورود برقرار نشد؛ اینترنت را بررسی کنید';
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
    (windowRef.setTimeout || setTimeout)(()=>toast.classList.remove('show'), 5000);
  } else if(typeof windowRef.alert === 'function'){
    windowRef.alert(message);
  }
  try{
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:auth-error', {detail:{code:error?.code || '', message}}));
  }catch{}
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
      try{
        await auth.signInWithPopup(provider);
      }catch(error){
        const code = String(error?.code || '');
        // Redirect is only a useful fallback when the browser prevented a popup.
        // Configuration/network errors must be surfaced instead of being hidden.
        if(code.includes('popup-blocked') || code.includes('operation-not-supported-in-this-environment')){
          try{
            await auth.signInWithRedirect(provider);
          }catch(redirectError){
            reportAuthError(redirectError, {windowRef, documentRef});
          }
        }else{
          reportAuthError(error, {windowRef, documentRef});
        }
      }
    } finally {
      delete signin.dataset.authBusy;
    }
  });
  return true;
}
