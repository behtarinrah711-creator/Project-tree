export function refreshServiceWorkerRegistrations({navigatorRef = navigator} = {}){
  if(!('serviceWorker' in navigatorRef)) return Promise.resolve([]);
  return navigatorRef.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations.map(registration => registration.update())))
    .catch(()=>{});
}

if(typeof navigator !== 'undefined') refreshServiceWorkerRegistrations();
