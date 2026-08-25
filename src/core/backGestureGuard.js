let installed = false;
let suppressUntil = 0;
let clearTimer = null;

function clock(windowRef){
  return Number(windowRef?.performance?.now?.() ?? Date.now());
}

function childOverlayOpen(documentRef){
  const visible = id => {
    const el = documentRef?.getElementById?.(id);
    return !!(el && !el.classList.contains('hidden'));
  };
  return visible('searchTemplatePage') || visible('numpadOverlay') || visible('jalaliPop');
}

export function installBackGestureGuard({windowRef = window, documentRef = window.document} = {}){
  if(installed && windowRef.KarhaBackGestureGuard) return windowRef.KarhaBackGestureGuard;
  installed = true;

  const api = {
    suppress(ms = 180){
      suppressUntil = Math.max(suppressUntil, clock(windowRef) + Number(ms || 0));
      try{ windowRef.__karhaSuppressWorkspaceBackOnce = true; }catch{}
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        if(clock(windowRef) < suppressUntil) return;
        try{ windowRef.__karhaSuppressWorkspaceBackOnce = false; }catch{}
      }, Math.max(0, Number(ms || 0) + 20));
    },
    isSuppressed(){
      return clock(windowRef) < suppressUntil || childOverlayOpen(documentRef);
    },
  };

  windowRef.KarhaBackGestureGuard = api;

  return api;
}

export default { installBackGestureGuard };
