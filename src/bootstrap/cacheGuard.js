(function(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations()
    .then(registrations => Promise.all(registrations.map(registration => registration.update())))
    .catch(()=>{});
})();
