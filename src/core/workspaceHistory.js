/** Phase 8.4 — workspace history depth + pushState helper (popstate routing stays wired in legacy until full nav extract). */
export function createWorkspaceHistory({ historyRef, locationRef } = {}){
  let depth = 0;
  return {
    push(kind){
      try{
        const h = historyRef || (typeof history !== 'undefined' ? history : null);
        const loc = locationRef || (typeof location !== 'undefined' ? location : null);
        if(!h || !loc) return;
        h.pushState({ karhaWorkspace: kind }, '', loc.href);
        depth++;
      }catch(e){}
    },
    getDepth(){ return depth; },
    setDepth(n){ depth = Math.max(0, Number(n)||0); },
    decDepth(){ depth = Math.max(0, depth - 1); return depth; },
  };
}

export function installWorkspaceHistory({ windowRef = globalThis } = {}){
  const api = createWorkspaceHistory({
    historyRef: windowRef.history,
    locationRef: windowRef.location,
  });
  windowRef.KarhaWorkspaceHistory = api;
  return api;
}
