from pathlib import Path

legacy = Path('src/legacy/legacyApp.js')
s = legacy.read_text()
reps = []

reps.append(("""function renderDrawerProjectList(){
  const list=document.getElementById('drawerProjectList');
  if(!list || !data) return;
  const source = window.KarhaApp?.projectWorkspace?.listProjects?.() || data.projects || [];
""","""/** Guest must not see cloud-owned projects that remain in localStorage after logout.
 *  Owned projects reappear only after the matching Google account signs in. */
function projectsVisibleForAuth(list){
  const all = Array.isArray(list) ? list : [];
  if(currentUser) return all;
  return all.filter(p => p && !p.ownerUid);
}

function renderDrawerProjectList(){
  const list=document.getElementById('drawerProjectList');
  if(!list || !data) return;
  const source = projectsVisibleForAuth(window.KarhaApp?.projectWorkspace?.listProjects?.() || data.projects || []);
"""))

reps.append(("""auth.onAuthStateChanged(async (user)=>{
  currentUser = user;
  cloudMode = !!user;
  updateAccountUI();
  if(user){
    await migrateGuestDataToCloud();
    startCloudListeners();
  } else {
    stopCloudListeners();
    loadData();
    renderAll();
  }
});
""","""auth.onAuthStateChanged(async (user)=>{
  currentUser = user;
  cloudMode = !!user;
  updateAccountUI();
  if(user){
    await migrateGuestDataToCloud();
    startCloudListeners();
  } else {
    stopCloudListeners();
    loadData();
    // Guest must not keep a cloud-owned project selected/visible.
    const active = data && data.activeTab && data.activeTab !== 'starred'
      ? (data.projects||[]).find(p => String(p.id)===String(data.activeTab))
      : null;
    if(active && active.ownerUid){
      data.activeTab = null;
      try{ window.KarhaApp?.projectContext?.setProjectId?.(null); }catch(e){}
    }
    renderDrawerProjectList();
    renderAll();
  }
});
"""))

reps.append(("""window.addEventListener('popstate',()=>{
  const overlay=document.getElementById('numpadOverlay');
  if(!numpadHistoryPushed || !overlay || overlay.classList.contains('hidden')) return;
  numpadHistoryPushed=false;
  suppressWorkspaceBackOnce=true;
  closeNumpad(true);
});
""","""window.addEventListener('popstate',()=>{
  const overlay=document.getElementById('numpadOverlay');
  // If the numpad is visible, this back belongs to it — close only the overlay
  // and suppress parent form/list handlers (do not rely solely on the flag).
  if(!overlay || overlay.classList.contains('hidden')) return;
  numpadHistoryPushed=false;
  suppressWorkspaceBackOnce=true;
  try{ window.__karhaSuppressWorkspaceBackOnce=true; }catch(e){}
  closeNumpad(true);
});
"""))

reps.append(("""/** وقتی فقط تمپلیت جستجو بسته می‌شود، بک فرم قرارداد / ورک‌اسپیس یک‌بار نادیده گرفته شود */
let suppressWorkspaceBackOnce = false;
function shouldSuppressWorkspaceBack(){
  // تمپلیت جستجو (یا حالت جستجوی آن) باز است → بک مال همان است
  if(typeof isSearchTemplateOpen==='function' && isSearchTemplateOpen()) return true;
  if(suppressWorkspaceBackOnce){
    // All legacy popstate listeners see the same suppression. Clearing this
    // synchronously let a later listener close the parent form.
    setTimeout(()=>{ suppressWorkspaceBackOnce=false; },0);
    return true;
  }
  return false;
}
""","""/** وقتی فقط تمپلیت جستجو / نامبرپد / تقویم بسته می‌شود، بک فرم قرارداد / ورک‌اسپیس یک‌بار نادیده گرفته شود */
let suppressWorkspaceBackOnce = false;
function shouldSuppressWorkspaceBack(){
  // Cross-module flag set by modular Search Template when hooks are missing.
  if(typeof window!=='undefined' && window.__karhaSuppressWorkspaceBackOnce){
    window.__karhaSuppressWorkspaceBackOnce=false;
    suppressWorkspaceBackOnce=true;
  }
  // تمپلیت جستجو (ماژولار یا legacy) باز است → بک مال همان است
  if(typeof isSearchTemplateOpen==='function' && isSearchTemplateOpen()) return true;
  if(typeof window!=='undefined' && window.KarhaSearchTemplate?.isOpen?.()) return true;
  // نامبرپد یا تقویم جلالی روی فرم باز است → فقط همان لایه بسته شود
  const numpad=document.getElementById('numpadOverlay');
  if(numpad && !numpad.classList.contains('hidden')) return true;
  const jalali=document.getElementById('jalaliPop');
  if(jalali && !jalali.classList.contains('hidden')) return true;
  if(suppressWorkspaceBackOnce){
    // All legacy popstate listeners see the same suppression. Clearing this
    // synchronously let a later listener close the parent form.
    setTimeout(()=>{ suppressWorkspaceBackOnce=false; },0);
    return true;
  }
  return false;
}

// Wire modular Search Template → legacy workspace back suppression.
// Without this, select/back in KarhaSearchTemplate history.back() also closes the contract form.
window.KarhaSearchTemplateHooks = Object.assign({}, window.KarhaSearchTemplateHooks || {}, {
  suppressBack(){ suppressWorkspaceBackOnce = true; try{ window.__karhaSuppressWorkspaceBackOnce = true; }catch(e){} }
});
"""))

reps.append(("""  const active = data.projects.filter(p => !p.trashed && !p.archived && !isPendingDeleted('project',p.id));
  const archived = data.projects.filter(p => p.archived && !p.trashed && !isPendingDeleted('project',p.id));
  const deleted = data.projects.filter(p => p.trashed || isPendingDeleted('project',p.id));
""","""  const visible = projectsVisibleForAuth(data.projects || []);
  const active = visible.filter(p => !p.trashed && !p.archived && !isPendingDeleted('project',p.id));
  const archived = visible.filter(p => p.archived && !p.trashed && !isPendingDeleted('project',p.id));
  const deleted = visible.filter(p => p.trashed || isPendingDeleted('project',p.id));
"""))

reps.append(("""window.addEventListener('popstate',()=>{
  const pop=document.getElementById('jalaliPop');
  if(!jalaliPickerHistoryPushed || !pop || pop.classList.contains('hidden')) return;
  jalaliPickerHistoryPushed=false;
  suppressWorkspaceBackOnce=true;
  closeJalaliPicker(true);
});
""","""window.addEventListener('popstate',()=>{
  const pop=document.getElementById('jalaliPop');
  // Visible picker owns this back step; keep the underlying contract form open.
  if(!pop || pop.classList.contains('hidden')) return;
  jalaliPickerHistoryPushed=false;
  suppressWorkspaceBackOnce=true;
  try{ window.__karhaSuppressWorkspaceBackOnce=true; }catch(e){}
  closeJalaliPicker(true);
});
"""))

reps.append(("""  getProjectsList(){
    return Array.isArray(data?.projects) ? data.projects : [];
  },
""","""  getProjectsList(){
    return projectsVisibleForAuth(Array.isArray(data?.projects) ? data.projects : []);
  },
"""))

for old, new in reps:
    if s.count(old) != 1:
        raise SystemExit(f'legacy anchor count={s.count(old)} expected 1: {old[:100]!r}')
    s = s.replace(old, new, 1)
legacy.write_text(s)

search = Path('src/core/searchTemplate.js')
t = search.read_text()
old = """  function enterSearch(){
    const top=document.getElementById('searchTemplateTopbar'),inp=document.getElementById('searchTemplateInput');
    if(!top)return;
    top.classList.add('search-mode');
    if(!searchModePushed){try{history.pushState({karhaSearchTemplateSearch:true},'',location.href);searchModePushed=true;}catch(e){}}
    setTimeout(()=>{try{inp?.focus();}catch(e){}},30);
  }
  function close(fromPop){
"""
new = """  function enterSearch(){
    const top=document.getElementById('searchTemplateTopbar'),inp=document.getElementById('searchTemplateInput');
    if(!top)return;
    top.classList.add('search-mode');
    if(!searchModePushed){try{history.pushState({karhaSearchTemplateSearch:true},'',location.href);searchModePushed=true;}catch(e){}}
    setTimeout(()=>{try{inp?.focus();}catch(e){}},30);
  }
  function suppressParentBack(){
    // Prefer explicit hook (legacy sets this to suppressWorkspaceBackOnce).
    // Fallback: set the same flag directly so parent form/list popstate handlers
    // never treat search-template history pops as "close the contract form".
    try{ hooks().suppressBack?.(); }catch(e){}
    try{ if(typeof window!=='undefined') window.__karhaSuppressWorkspaceBackOnce=true; }catch(e){}
  }
  function close(fromPop){
"""
if t.count(old) != 1:
    raise SystemExit('search helper anchor mismatch')
t = t.replace(old, new, 1)
t = t.replace("hooks().suppressBack?.();\n      try{if(steps===1)history.back();else history.go(-steps);}", "suppressParentBack();\n      try{if(steps===1)history.back();else history.go(-steps);}", 1)
t = t.replace("searchModePushed=false;hooks().suppressBack?.();try{history.back();}", "searchModePushed=false;suppressParentBack();try{history.back();}", 1)
old_pop = """  window.addEventListener('popstate',()=>{
    if(!isOpen())return;
    if(isSearchMode()||searchModePushed){exitSearch();searchModePushed=false;return;}
    hooks().suppressBack?.();historyPushed=false;searchModePushed=false;close(true);
  });
"""
new_pop = """  window.addEventListener('popstate',()=>{
    if(!isOpen())return;
    if(isSearchMode()||searchModePushed){
      exitSearch();
      searchModePushed=false;
      // Consumed only the search-focus history layer; parent form must stay.
      suppressParentBack();
      return;
    }
    // Closing the template itself via browser/hardware back: swallow so the
    // workspace listener does not also requestClose the contract form.
    suppressParentBack();
    historyPushed=false;
    searchModePushed=false;
    close(true);
  });
"""
if t.count(old_pop) != 1:
    raise SystemExit('search popstate anchor mismatch')
t = t.replace(old_pop, new_pop, 1)
search.write_text(t)
