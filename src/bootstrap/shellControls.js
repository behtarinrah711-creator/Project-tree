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
    console.info('[karha:auth] login click');
    const firebaseRef = windowRef.firebase;
    if(!firebaseRef?.auth){
      console.warn('[karha:auth] login click: Firebase Auth SDK missing');
      return;
    }
    let auth;
    try{
      auth = firebaseRef.auth();
      console.info('[karha:auth] login click: auth ready, currentUser=', auth.currentUser && auth.currentUser.email);
    }catch(err){
      console.warn('[karha:auth] login click: auth() failed', err);
      return;
    }
    if(auth.currentUser){
      console.info('[karha:auth] signOut start');
      auth.signOut().catch(err => console.warn('[karha:auth] signOut failed', err));
      close();
      return;
    }
    const provider = new firebaseRef.auth.GoogleAuthProvider();
    // Prefer popup; fall back to redirect only when the popup is blocked or
    // the browser cannot open it. User-cancelled popup should not force redirect.
    console.info('[karha:auth] signInWithPopup start');
    auth.signInWithPopup(provider).then(function(result){
      console.info('[karha:auth] signInWithPopup ok', result && result.user && (result.user.email || result.user.uid));
    }).catch(err => {
      const code = err && err.code;
      console.warn('[karha:auth] signInWithPopup error', code || err);
      if(code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment'){
        console.info('[karha:auth] signInWithRedirect start (popup blocked)');
        return auth.signInWithRedirect(provider);
      }
      if(code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'){
        return;
      }
    });
  });
  return true;
}
