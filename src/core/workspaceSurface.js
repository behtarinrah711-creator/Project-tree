/** Workspace page visibility helpers — sole owner of show/hide internal page shells. */
const WORKSPACE_PAGE_IDS = Object.freeze([
  'projectsPage','profilePage','calendarPage','createPage','reportsPage','accountingPage',
  'settingsPage','projectActivitiesPage','contactsPage','projectTrashPage','contractsPage',
  'contractFormPage','contractTemplateFormPage','contractTemplatesPage','activityFormPage',
]);

export function installWorkspaceSurface({ windowRef = globalThis, documentRef = null } = {}){
  if(windowRef.KarhaWorkspaceSurface) return windowRef.KarhaWorkspaceSurface;
  documentRef = documentRef || windowRef.document || null;

  function call(name, ...args){
    if(typeof windowRef[name] === 'function') return windowRef[name](...args);
    if(typeof windowRef.KarhaLegacy?.[name] === 'function') return windowRef.KarhaLegacy[name](...args);
  }

  function showOnlyWorkspacePage(pageId){
    if(!documentRef) return;
    const content = documentRef.getElementById('content');
    if(content) content.replaceChildren();
    WORKSPACE_PAGE_IDS.forEach(id=>{
      const el = documentRef.getElementById(id);
      if(el) el.classList.add('hidden');
    });
    if(pageId){
      const target = documentRef.getElementById(pageId);
      if(target) target.classList.remove('hidden');
    }
  }

  function closeBottomPages(){
    try{ windowRef.workspaceSubpage = null; }catch(e){}
    call('clearWorkspaceSubpage');
    if(!documentRef) return;
    WORKSPACE_PAGE_IDS.forEach(id=>{
      const el = documentRef.getElementById(id);
      if(el) el.classList.add('hidden');
    });
  }

  function enterWorkspaceSurface(){
    call('setProjectsSurfaceActive', false);
    try{
      const content = documentRef?.getElementById?.('content');
      if(content) content.replaceChildren();
    }catch(e){}
  }

  function enterProjectsSurface(){
    call('setProjectsSurfaceActive', true);
    closeBottomPages();
    call('renderAll');
  }

  function goHomeProjects(){
    closeBottomPages();
    call('ensureHomeSelection');
    call('clearMenuRootMode');
    call('setBottomNavActive', 'Projects');
    enterProjectsSurface();
  }

  const api = Object.freeze({
    showOnlyWorkspacePage,
    closeBottomPages,
    enterWorkspaceSurface,
    enterProjectsSurface,
    goHomeProjects,
    WORKSPACE_PAGE_IDS,
  });
  windowRef.KarhaWorkspaceSurface = api;
  return api;
}

export default { installWorkspaceSurface };
