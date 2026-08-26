/** Keep guest/local startup available when the optional Firebase CDN is unavailable. */
export function installGuestFirebaseFallback(windowRef = window){
  if(windowRef.firebase) return windowRef.firebase;
  const resolved = value => Promise.resolve(value);
  const rejected = error => Promise.reject(error);
  const unavailableQuery = () => ({
    where(){ return unavailableQuery(); }, orderBy(){ return unavailableQuery(); }, limit(){ return unavailableQuery(); },
    onSnapshot(_next,error){ if(typeof error === 'function') queueMicrotask(() => error(new Error('Firebase SDK unavailable'))); return () => {}; },
    get(){ return resolved({empty:true,docs:[],forEach(){}}); },
  });
  const unavailableDoc = () => ({
    get(){ return resolved({exists:false,data(){ return undefined; }}); }, set(){ return resolved(); }, update(){ return resolved(); }, delete(){ return resolved(); },
    collection(){ return unavailableQuery(); }, onSnapshot(_next,error){ if(typeof error === 'function') queueMicrotask(() => error(new Error('Firebase SDK unavailable'))); return () => {}; },
  });
  const authInstance = {
    currentUser:null, onAuthStateChanged(callback){ queueMicrotask(() => callback(null)); return () => {}; },
    signInWithPopup(){ return rejected(new Error('Firebase SDK unavailable')); }, signInWithRedirect(){ return rejected(new Error('Firebase SDK unavailable')); }, signOut(){ return resolved(); },
  };
  const auth = () => authInstance;
  auth.GoogleAuthProvider = class GoogleAuthProvider {};
  const firestore = () => ({
    enablePersistence(){ return resolved(); },
    collection(){ const query=unavailableQuery(); query.doc=unavailableDoc; return query; },
    runTransaction(){ return rejected(new Error('Firebase SDK unavailable')); },
  });
  firestore.FieldValue = {
    delete(){ return null; }, serverTimestamp(){ return new Date(); },
    arrayRemove(...values){ return {__op:'arrayRemove',values}; }, arrayUnion(...values){ return {__op:'arrayUnion',values}; },
  };
  windowRef.firebase = {__karhaGuestFallback:true,apps:[],initializeApp(){ this.apps.push({name:'[DEFAULT]'}); return this.apps[0]; },auth,firestore};
  console.warn('Karha: Firebase SDK unavailable; continuing in local guest mode.');
  return windowRef.firebase;
}
