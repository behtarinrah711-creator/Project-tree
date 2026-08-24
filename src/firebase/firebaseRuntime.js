export const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyBbRk4MsdHtj-gWnjbJExvQgW0sY6Z4uK8',
  authDomain: 'tree-d92af.firebaseapp.com',
  projectId: 'tree-d92af',
  storageBucket: 'tree-d92af.firebasestorage.app',
  messagingSenderId: '401523332370',
  appId: '1:401523332370:web:3a524a2b86b967ca4d8fcb',
});

export function installFirebaseRuntime({windowRef=window, consoleRef=console}={}){
  const firebaseRef=windowRef.firebase;
  if(!firebaseRef?.initializeApp || !firebaseRef?.auth || !firebaseRef?.firestore) return null;
  if(!firebaseRef.apps?.length) firebaseRef.initializeApp(FIREBASE_CONFIG);
  const runtime={firebase:firebaseRef,auth:firebaseRef.auth(),db:firebaseRef.firestore()};
  runtime.db.enablePersistence?.({synchronizeTabs:true}).catch(error=>{
    consoleRef.warn('Offline persistence not enabled:',error.code);
  });
  windowRef.KarhaFirebaseRuntime=Object.freeze(runtime);
  return runtime;
}
