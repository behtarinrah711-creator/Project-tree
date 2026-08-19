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
    if(!firebaseRef?.auth) return;
    const auth = firebaseRef.auth();
    if(auth.currentUser){
      auth.signOut();
      close();
      return;
    }
    const provider = new firebaseRef.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(() => auth.signInWithRedirect(provider));
  });
  return true;
}
