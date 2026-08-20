const byId = (documentRef, id) => documentRef.getElementById(id);

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
  signin.addEventListener('click', () => {
    const firebaseRef = windowRef.firebase;
    if(!firebaseRef?.auth){
      console.warn('Karha shell: Firebase Auth SDK is not available yet');
      return;
    }
    let auth;
    try{
      auth = firebaseRef.auth();
    }catch(err){
      console.warn('Karha shell: Firebase Auth not initialized', err);
      return;
    }
    if(auth.currentUser){
      auth.signOut().catch(err => console.warn('Karha shell: signOut failed', err));
      close();
      return;
    }
    const provider = new firebaseRef.auth.GoogleAuthProvider();
    const userAgent = String(windowRef.navigator?.userAgent || '');
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
    if(isMobile){
      auth.signInWithRedirect(provider).catch(err => {
        console.warn('Karha shell: signInWithRedirect failed', err?.code || err);
      });
      return;
    }
    // Prefer popup on desktop; fall back to redirect only when the popup is blocked or
    // the browser cannot open it. User-cancelled popup should not force redirect.
    auth.signInWithPopup(provider).catch(err => {
      const code = err && err.code;
      if(code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment'){
        return auth.signInWithRedirect(provider);
      }
      if(code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'){
        return;
      }
      console.warn('Karha shell: signInWithPopup failed', code || err);
    });
  });
  return true;
}
