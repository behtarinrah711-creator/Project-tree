(function(){
  const BUILD='281';
  const KEY='karha_app_cache_guard_build';
  try{
    const already=sessionStorage.getItem(KEY);
    const hasBuild=new URLSearchParams(location.search).has('appv');
    if(already!==BUILD && !hasBuild){
      sessionStorage.setItem(KEY,BUILD);
      const go=()=>{
        const u=new URL(location.href);
        u.searchParams.set('appv',BUILD);
        location.replace(u.href);
      };
      if('serviceWorker' in navigator){
        navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))).catch(()=>{}).finally(go);
      }else go();
    }
  }catch(e){}
})();
