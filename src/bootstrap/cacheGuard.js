(function(){
  const RESET_KEY='karha-emergency-cache-reset-v1';
  if(sessionStorage.getItem(RESET_KEY)) return;
  sessionStorage.setItem(RESET_KEY,'1');

  const clearWorkers = ('serviceWorker' in navigator)
    ? navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
        .catch(()=>{})
    : Promise.resolve();

  const clearCaches = ('caches' in window)
    ? caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).catch(()=>{})
    : Promise.resolve();

  Promise.all([clearWorkers, clearCaches]).then(()=>{
    try{
      const url=new URL(location.href);
      url.searchParams.set('_karha_reset','1');
      location.replace(url.toString());
    }catch(e){
      location.reload();
    }
  });
})();
