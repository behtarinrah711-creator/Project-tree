export const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyBbRk4MsdHtj-gWnjbJExvQgW0sY6Z4uK8',
  authDomain: 'tree-d92af.firebaseapp.com',
  projectId: 'tree-d92af',
  storageBucket: 'tree-d92af.firebasestorage.app',
  messagingSenderId: '401523332370',
  appId: '1:401523332370:web:3a524a2b86b967ca4d8fcb',
});

/** Initialize only the Firebase app/auth required by the independent shell. */
export function initializeShellAuth({ firebaseRef = window.firebase } = {}){
  if(!firebaseRef?.initializeApp || !firebaseRef?.auth) return null;
  if(!firebaseRef.apps?.length) firebaseRef.initializeApp(FIREBASE_CONFIG);
  return firebaseRef.auth();
}
