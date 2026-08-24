/* ---------- lightweight workspace history (Phase 8.4: push owned by src/core/workspaceHistory.js) ---------- */
let workspaceHistoryDepth = 0;
function pushWorkspaceHistory(kind){
  if(window.KarhaWorkspaceHistory?.push){
    window.KarhaWorkspaceHistory.push(kind);
    workspaceHistoryDepth = window.KarhaWorkspaceHistory.getDepth?.() ?? (workspaceHistoryDepth+1);
    return;
  }
  try{
    history.pushState({karhaWorkspace:kind}, '', location.href);
    workspaceHistoryDepth++;
  }catch(e){}
}
window.addEventListener('popstate', ()=>{
  // Phase 8.4: popstate router remains here until full nav module owns all page closers.
  const formPageEl = document.getElementById('contractFormPage');
  const formOpen = !!(formPageEl && !formPageEl.classList.contains('hidden'));
  const childOverlayOpen = ()=>{
    if(typeof isSearchTemplateOpen==='function' && isSearchTemplateOpen()) return true;
    if(typeof window!=='undefined' && window.KarhaSearchTemplate?.isOpen?.()) return true;
    const numpad=document.getElementById('numpadOverlay');
    if(numpad && !numpad.classList.contains('hidden')) return true;
    const jalali=document.getElementById('jalaliPop');
    if(jalali && !jalali.classList.contains('hidden')) return true;
    return false;
  };

  // Contract form owns Back when it is visible and no child overlay is open.
  // One-shot suppress still applies (picker select / numpad done → history.back).
  if(formOpen){
    if(childOverlayOpen()) return;
    if(typeof shouldSuppressWorkspaceBack==='function' && shouldSuppressWorkspaceBack()) return;
    requestCloseContractForm(true);
    return;
  }

  if(typeof shouldSuppressWorkspaceBack==='function' && shouldSuppressWorkspaceBack()) return;

  // صفحات حذف‌شدهٔ فاز ۵+ (status/collab/share) عمداً دیگر در DOM نیستند.
  if(document.getElementById('contractsPage') && !document.getElementById('contractsPage').classList.contains('hidden')){ closeContractsPage(); return; }

  // Back از حسابداری -> هوم پروژه.
  if(document.getElementById('accountingPage') && !document.getElementById('accountingPage').classList.contains('hidden')){
    workspaceHistoryDepth=Math.max(0,workspaceHistoryDepth-1);
    goHomeProjects();
    return;
  }

  if(document.getElementById('contractTemplatesPage') && !document.getElementById('contractTemplatesPage').classList.contains('hidden')){ closeContractTemplatesPage(); return; }

  // Back از فرم/لیست مخاطبین: هر سطح فقط یک پله به عقب برمی‌گردد.
  // فرم مخاطب -> لیست مخاطبین -> تنظیمات پروژه.
  const contactsPage=document.getElementById('contactsPage');
  if(contactsPage && !contactsPage.classList.contains('hidden')){
    if(contactsPage.classList.contains('contact-form-mode')){
      if(typeof window.__contactBackGuard==='function'){ window.__contactBackGuard(); return; }
      return;
    }
    // از لیست مخاطبین -> تنظیمات همان پروژه
    workspaceSubpage=null;
    renderSettingsWorkspace();
    showOnlyWorkspacePage('settingsPage');
    return;
  }

  if(document.getElementById('activityFormPage') && !document.getElementById('activityFormPage').classList.contains('hidden')){ requestCloseActivityForm(true); return; }
  // Back از زیرصفحه «فعالیت‌ها» -> تنظیمات همان پروژه.
  if(typeof shouldSuppressWorkspaceBack==='function' && shouldSuppressWorkspaceBack()) return;
  if(document.getElementById('projectActivitiesPage') && !document.getElementById('projectActivitiesPage').classList.contains('hidden')){
    workspaceSubpage=null;
    showOnlyWorkspacePage('settingsPage');
    renderSettingsWorkspace();
    return;
  }

  // Back از زیرصفحه «حذف شده ها» -> تنظیمات همان پروژه.
  if(document.getElementById('projectTrashPage') && !document.getElementById('projectTrashPage').classList.contains('hidden')){
    workspaceSubpage=null;
    showOnlyWorkspacePage('settingsPage');
    setBottomNavActive('Settings');
    renderTabs();
    renderSettingsWorkspace();
    updateWorkspaceContextBar();
    return;
  }

  // Back از گزارش پروژه -> هوم پروژه.
  if(document.getElementById('reportsPage') && !document.getElementById('reportsPage').classList.contains('hidden')){
    goHomeProjects();
    return;
  }

  // Back از صفحه اصلی تنظیمات پروژه -> هوم پروژه.
  if(document.getElementById('settingsPage') && !document.getElementById('settingsPage').classList.contains('hidden')){
    workspaceSubpage=null;
    goHomeProjects();
    return;
  }
});

