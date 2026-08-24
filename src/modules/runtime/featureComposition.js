function openContractStatusPage(){
  // Phase 5: status path removed — stay on project dashboard.
  try{ const pid=getCurrentProjectScopeId(); if(pid&&window.KarhaApp?.router) window.KarhaApp.router.navigate(pid,'dashboard',{replace:true}); }catch(e){}
}
function openContractStatusPageLegacyDisabled(){
  closeDrawer(); enterWorkspaceSurface(); workspaceSubpage='contractStatus'; setBottomNavActive('Accounting'); renderTabs(); showOnlyWorkspacePage(); updateWorkspaceContextBar(); pushWorkspaceHistory('contractStatus'); renderContractStatusPage();
}
function closeContractStatusPage(){ workspaceSubpage=null; setBottomNavActive('Accounting'); renderTabs(); showOnlyWorkspacePage('accountingPage'); updateWorkspaceContextBar(); renderAccountingWorkspace(); }
function renderContractStatusPage(){
  return window.KarhaContractStatus?.render?.(document.getElementById('contractStatusBody'),getCurrentProject()?.id);
}

function openContractApprovalPage(){
  // Phase 5 removed path
  try{ const pid=getCurrentProjectScopeId(); if(pid&&window.KarhaApp?.router) window.KarhaApp.router.navigate(pid,'dashboard',{replace:true}); }catch(e){} return;

  closeDrawer(); enterWorkspaceSurface(); workspaceSubpage='contractApproval'; setBottomNavActive('Accounting'); renderTabs(); showOnlyWorkspacePage(); updateWorkspaceContextBar(); pushWorkspaceHistory('contractApproval'); renderContractApprovalPage();
}
function closeContractApprovalPage(){ workspaceSubpage=null; setBottomNavActive('Accounting'); renderTabs(); showOnlyWorkspacePage('accountingPage'); updateWorkspaceContextBar(); renderAccountingWorkspace(); }
function renderContractApprovalPage(){
  return window.KarhaContractApproval?.render?.(document.getElementById('contractApprovalBody'),getCurrentProject()?.id);
}

function openStatusTestPage(){
  try{ const pid=getCurrentProjectScopeId(); if(pid&&window.KarhaApp?.router) window.KarhaApp.router.navigate(pid,'dashboard',{replace:true}); }catch(e){}
}
function closeStatusTestPage(){ workspaceSubpage=null; setBottomNavActive('Accounting'); renderTabs(); showOnlyWorkspacePage('accountingPage'); updateWorkspaceContextBar(); renderAccountingWorkspace(); }
function renderStatusTestPage(){ /* Status test UI removed */ }

function getCurrentProject(){ const id=getCurrentProjectScopeId(); return id ? findProject(id) : null; }
function getContacts(project=getCurrentProject()){
  if(!project) return [];
  normalizeProjectScopedData(project);
  return project.contacts;
}
function findContact(id, project=getCurrentProject()){ return getContacts(project).find(c=>c.id===id)||null; }
function openContactsPage(){ closeBottomPages(); enterWorkspaceSurface(); workspaceSubpage='contacts'; showOnlyWorkspacePage('contactsPage'); renderContactsPage(); try{history.pushState({workspaceSubpage:'contacts'},'',location.href);}catch(e){} }
function renderContactsPage(){
  const module=window.KarhaApp?.modules?.get('people');
  if(module?.render) module.render(getCurrentProject()?.id);
}


function getActivityTemplates(project=getCurrentProject()){
  if(!project) return [];
  normalizeProjectScopedData(project);
  return project.activityTemplates;
}
function findActivityTemplate(id, project=getCurrentProject()){ return getActivityTemplates(project).find(a=>a.id===id) || null; }
function openProjectActivitiesPage(){
  closeBottomPages();
  enterWorkspaceSurface();
  workspaceSubpage='activities';
  showOnlyWorkspacePage('projectActivitiesPage');
  renderProjectActivitiesPage();
  try{ history.pushState({workspaceSubpage:'activities'},'',location.href); }catch(e){}
}
function renderProjectActivitiesPage(){
  const module=window.KarhaApp?.modules?.get('activities');
  if(module?.render) module.render(getCurrentProject()?.id);
}

function openActivityEditForm(activity){
  return window.KarhaApp?.modules?.get('activities')?.openActivityEditForm(activity);
}

function openActivityForm(){
  return window.KarhaApp?.modules?.get('activities')?.openActivityForm();
}
function requestCloseActivityForm(fromPopState=false){
  return window.KarhaApp?.modules?.get('activities')?.requestCloseActivityForm(fromPopState);
}

function permanentlyDeleteGlobalRecord(entry){
  if(!entry || !entry.record) return false;
  if(entry.type==='contact' || entry.type==='activity'){
    const check=canDeleteProjectRecord(entry.type,entry.id);
    if(!check.ok){ showRecordDeleteBlocked(entry.type,check.refs); return false; }
  }
  if(entry.type==='project') return permanentlyDeleteProject(entry.record);
  if(entry.type==='contact'){
    const p=findProject(entry.projectId); if(!p) return false; p.contacts=getContacts(p).filter(x=>x.id!==entry.id); markDirty(p.id); return true;
  }
  if(entry.type==='activity'){
    const p=findProject(entry.projectId); if(!p) return false; p.activityTemplates=getActivityTemplates(p).filter(x=>x.id!==entry.id); markDirty(p.id); return true;
  }
  if(entry.type==='task'){
    return !!window.KarhaApp?.taskRuntime?.permanentDelete(entry.projectId,entry.id);
  }
  if(entry.type==='subtask'){
    return !!window.KarhaApp?.taskRuntime?.permanentDelete(entry.projectId,entry.rootTaskId||entry.parentId,entry.id);
  }
  return false;
}

function restoreGlobalRecord(entry){
  if(!entry || !entry.record) return false;
  if(entry.type==='project'){
    const p=findProject(entry.id); if(!p) return false;
    p.trashed=false; delete p.deletedAt; delete p.deletedType; cloudSyncProjectStatus(p); setActiveTab(p.id); return true;
  }
  if(entry.type==='contact'){
    const p=findProject(entry.projectId); const c=findContact(entry.id,p); if(!c) return false;
    c.trashed=false; delete c.deletedAt; delete c.deletedType; markDirty(p.id); return true;
  }
  if(entry.type==='activity'){
    const p=findProject(entry.projectId); const a=findActivityTemplate(entry.id,p); if(!a) return false;
    a.trashed=false; delete a.deletedAt; delete a.deletedType; markDirty(p.id); return true;
  }
  if(entry.type==='task'){
    return !!window.KarhaApp?.taskRuntime?.restore(entry.projectId,entry.id);
  }
  if(entry.type==='subtask'){
    return !!window.KarhaApp?.taskRuntime?.restore(entry.projectId,entry.rootTaskId||entry.parentId,entry.id);
  }
  return false;
}

let projectTrashView=null;
function addTrashSourceBadge(container,type){ return projectTrashView?.addSourceBadge(container,type); }
function appendTrashActions(actions,entry){ return projectTrashView?.appendActions(actions,entry); }
function collectProjectTrashedRecords(projectId){ return projectTrashView?.collect(projectId)||[]; }
function renderProjectTrashPage(){ return projectTrashView?.render(); }

function openProjectTrashPage(){
  closeBottomPages(); enterWorkspaceSurface(); ensureHomeSelection(); workspaceSubpage='projectTrash';
  setBottomNavActive('Settings'); showOnlyWorkspacePage('projectTrashPage'); renderProjectTrashPage(); updateWorkspaceContextBar();
}

function refreshCurrentFooterPage(){
  const active=document.querySelector('.bottom-nav-item.active');
  if(!active || active.id==='bottomProjectsBtn'){
    if(!document.querySelector('.page-overlay:not(.hidden)')) renderAll();
    return;
  }
  renderTabs();
  if(active.id==='bottomReportsBtn'){
    workspaceSubpage=null;
    showOnlyWorkspacePage('reportsPage');
    renderReportsWorkspace();
    updateWorkspaceContextBar();
    return;
  }
  if(active.id==='bottomAccountingBtn'){
    workspaceSubpage=null;
    showOnlyWorkspacePage('accountingPage');
    renderAccountingWorkspace();
    updateWorkspaceContextBar();
    return;
  }
  if(active.id==='bottomSettingsBtn'){
    if(workspaceSubpage==='projectTrash'){
      showOnlyWorkspacePage('projectTrashPage');
      renderProjectTrashPage();
    } else {
      workspaceSubpage=null;
      showOnlyWorkspacePage('settingsPage');
      renderSettingsWorkspace();
    }
    updateWorkspaceContextBar();
    return;
  }
  renderAll();
}

function commitActiveContactDraft(){ try{ if(typeof window.__commitContactDraft==='function') window.__commitContactDraft(); }catch(e){} }

function navigateFooter(moduleId){
  commitActiveContactDraft();
  leaveMenuRootForFooter();
  ensureHomeSelection();
  const projectId=getCurrentProjectScopeId();
  if(projectId) window.KarhaApp?.projectWorkspace?.selectProject?.(projectId,{moduleId});
}

document.getElementById('closeProjectTrashPage').onclick=()=>{
  workspaceSubpage=null;
  showOnlyWorkspacePage('settingsPage');
  setBottomNavActive('Settings');
  renderTabs();
  renderSettingsWorkspace();
  updateWorkspaceContextBar();
};

const taskUI = window.KarhaApp.taskRuntime.createUI({
  getData:()=>data, document, requestAnimationFrame, setTimeout, isPendingDeleted, elFromHtml,
  formatCost, formatCostDisplay, projectCostSum, taskCostSum, svgPlus, svgGrip, svgChevron, svgTrash,
  svgCheck, svgStar, itemChildren, findNestedItem, findProject, findTask, findSub, walkItems,
  toggleTaskDone, toggleSubDone, toggleTaskStar, toggleSubStar, removeFromStarredOrder,
  openConfirm, showToast, renderAll, refreshStarredPartial, softDelete,
  isFloatingConfirmUser, persist, markDirty, openNumpadGeneric, addTrashSourceBadge, appendTrashActions
});
const {renderProjectView,refreshProjectPartial,renderInlineAddRow,renderTaskBlock,renderStarredView,
  buildStarredGroup,openTaskDetail,openSubDetail,closeSheet,renderSheet}=taskUI;
projectTrashView=window.KarhaApp.createProjectTrashView({
  document,setTimeout,getActiveProjectId:()=>{ const id=getActiveTab(); return id&&id!=='starred'?id:null; },
  findProject,walkItems,getContacts,getActivityTemplates,findActivityTemplate,taskView:taskUI,
  restoreRecord:restoreGlobalRecord,permanentlyDeleteRecord:permanentlyDeleteGlobalRecord,
  persist,refreshWorkspace:renderAll,refreshContacts:renderContactsPage,
  refreshActivities:renderProjectActivitiesPage,showToast,openConfirm,
  createWorkspaceSearch,workspaceTextMatch
});

/* ---------- side drawer (menu) ---------- */
function openDrawer(){ return window.KarhaWorkspaceChrome?.openDrawer?.(); }
function closeDrawer(){ return window.KarhaWorkspaceChrome?.closeDrawer?.(); }

/* ---------- confirm dialog (Phase 8.2: owned by src/ui/confirm.js via KarhaUI) ---------- */
let confirmCallback = null;
function openConfirm(text, onOk, okLabel){
  if(window.KarhaUI?.openConfirm) return window.KarhaUI.openConfirm(text, onOk, okLabel);
  const textEl=document.getElementById('confirmText');
  const okBtn=document.getElementById('confirmOkBtn');
  const overlay=document.getElementById('confirmOverlay');
  if(textEl) textEl.textContent = text;
  if(okBtn) okBtn.textContent = okLabel || 'تایید';
  confirmCallback = onOk;
  if(overlay) overlay.classList.remove('hidden');
}
function closeConfirm(){
  if(window.KarhaUI?.closeConfirm) return window.KarhaUI.closeConfirm();
  const overlay=document.getElementById('confirmOverlay');
  if(overlay) overlay.classList.add('hidden');
  confirmCallback = null;
}
/* DOM binds installed by installUiPrimitives — no new ownership here */

/* ---------- project management page ---------- */

/* ---------- user profile (UI owned by src/modules/profile/profileView.js) ---------- */
const PROFILE_KEY = 'karha_user_profile_v1';
function loadProfile(){
  if(window.KarhaProfile?.loadProfile) return window.KarhaProfile.loadProfile();
  try{ return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {}; }catch(e){ return {}; }
}
function saveProfile(p){
  if(window.KarhaProfile?.saveProfile) return window.KarhaProfile.saveProfile(p);
  try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }catch(e){ showToast('ذخیره مشخصات ممکن نشد'); }
}
function compressSignatureFile(file){
  if(window.KarhaProfile?.compressSignatureFile) return window.KarhaProfile.compressSignatureFile(file);
  return Promise.reject(new Error('profile store unavailable'));
}
function openProfilePage(){
  if(window.KarhaProfileView?.openProfilePage) return window.KarhaProfileView.openProfilePage();
}
function closeProfilePage(fromPopState=false){
  if(window.KarhaProfileView?.closeProfilePage) return window.KarhaProfileView.closeProfilePage(fromPopState);
}
function renderProfilePage(){
  if(window.KarhaProfileView?.renderProfilePage) return window.KarhaProfileView.renderProfilePage();
}

document.getElementById('drawerProjectsBtn').onclick = ()=>{ closeDrawer(); openProjectsPage(); };
document.getElementById('drawerAddProjectBtn').onclick = ()=>{ closeDrawer(); openCreatePage(); };
document.getElementById('drawerGlobalTrashBtn').onclick = openGlobalTrashFromDrawer;
document.getElementById('closeProjectsPage').onclick = ()=>{ closeMenuRootPage(false); };

async function permanentlyDeleteProject(p){
  if(!p) return false;

  // If the project is currently pending soft-delete, cancel that pending timer first.
  if(pendingDelete && pendingDelete.type==='project' && pendingDelete.pid===p.id){
    clearTimeout(pendingDelete.timeoutId);
    pendingDelete=null;
    hideUndoToast();
  }

  try{await cloudRuntime.lifecycle.permanentlyDelete(p);}catch(e){
      console.warn('permanent project delete failed',e);
      showToast('حذف همیشگی پروژه روی سرور انجام نشد');
      return false;
  }
  data.projects=data.projects.filter(x=>x.id!==p.id);
  if(getActiveTab()===p.id){
    const next=data.projects.find(x=>!x.trashed&&!x.archived) || data.projects.find(x=>!x.trashed) || data.projects.find(x=>!x.archived);
    setActiveTab(next ? next.id : 'starred');
  }
  persist();
  return true;
}

const projectManagementView=window.KarhaApp.createProjectManagementView({
  document,getData:()=>data,projectsVisibleForAuth,isPendingDeleted,svgGrip,svgTrash,
  openMiniPrompt,renameProject:(id,name)=>window.KarhaApp?.projectApi?.rename?.(id,name),
  cloudRenameProject,findProject,archiveProject:(id,value)=>window.KarhaApp?.projectApi?.archive?.(id,value),
  setActiveTab,getActiveTab,cloudSyncProjectStatus,refreshWorkspace:renderAll,showToast,
  openExportPage,openConfirm,softDelete,undoPendingDelete,persist,permanentlyDeleteProject
});
function renderManagementPage(){ return projectManagementView.render(); }
function openProjectsPage(){
  menuRootMode='projects';
  projectManagementView.reset();
  closeBottomPages(); enterWorkspaceSurface(); ensureHomeSelection(); setBottomNavActive('Projects');
  pushMenuRootHistory('projects'); showOnlyWorkspacePage('projectsPage'); updateWorkspaceContextBar();
  renderManagementPage();
}


/* ---------- PDF export page (UI owned by src/modules/export/exportView.js) ---------- */
const EXPORT_NOTES_KEY = 'karha_export_notes_v1';
function loadExportNotes(){
  if(window.KarhaExportNotes?.loadExportNotes) return window.KarhaExportNotes.loadExportNotes();
  try{ return JSON.parse(localStorage.getItem(EXPORT_NOTES_KEY) || '{}') || {}; }catch(e){ return {}; }
}
function saveExportNote(pid, text){
  if(window.KarhaExportNotes?.saveExportNote) return window.KarhaExportNotes.saveExportNote(pid, text);
  const all = loadExportNotes();
  if(text && text.trim()) all[pid] = text; else delete all[pid];
  try{ localStorage.setItem(EXPORT_NOTES_KEY, JSON.stringify(all)); }catch(e){}
}
function getExportNote(pid){
  if(window.KarhaExportNotes?.getExportNote) return window.KarhaExportNotes.getExportNote(pid);
  return loadExportNotes()[pid] || '';
}
function openExportPage(pid){
  if(window.KarhaExportView?.openExportPage) return window.KarhaExportView.openExportPage(pid);
}
function renderExportPage(){
  if(window.KarhaExportView?.renderExportPage) return window.KarhaExportView.renderExportPage();
}
function generateProjectPdf(){
  if(window.KarhaExportView?.generateProjectPdf) return window.KarhaExportView.generateProjectPdf();
}
async function generateProjectJpeg(){
  if(window.KarhaExportView?.generateProjectJpeg) return window.KarhaExportView.generateProjectJpeg();
}

/* ---------- PWA service worker registration ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
      try{ reg.update(); }catch(e){}
      if(reg.waiting){ reg.waiting.postMessage({type:'SKIP_WAITING'}); }
    }).catch(()=>{});
  });
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(!window.__swReloaded155){
      window.__swReloaded155=true;
      location.reload();
    }
  });
}

/* ==================== Status/Letter removed (Phase Final Sweep) ==================== */
/* Active product path deleted. Firestore historical data is NOT wiped. */
function openStatusForm(){ try{ showToast('صورت‌وضعیت در این نسخه حذف شده است'); }catch(e){} return false; }
function closeStatusForm(){ return; }
function requestCloseStatusForm(){ return; }
function openStatusList(){ try{ showToast('صورت‌وضعیت در این نسخه حذف شده است'); }catch(e){} }
function closeStatusList(){ return; }
function renderStatusList(){ return; }
function renderStatusForm(){ return; }
function openStatusExport(){ return; }
function closeStatusExport(){ return; }
function formatLetterNo(){ return ''; }
function formatLetterNoDisplay(){ return ''; }
async function generateNextLetterNo(){ return ''; }

/* ---------- root menu history handling ---------- */
window.addEventListener('popstate', ()=>{
  if(!menuRootHistoryPushed) return;

  const rootPages = ['profilePage','projectsPage'];
  const visible = rootPages.find(id => {
    const el=document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
  if(!visible) return;

  // این popstate همان Back گوشی/مرورگر است؛ نباید history.back() دیگری بزنیم.
  menuRootHistoryPushed = false;
  menuRootPage = null;
  goHomeProjects();
});

function returnToSettingsWorkspace(){
  workspaceSubpage=null;
  setBottomNavActive('Settings');
  renderTabs();
  showOnlyWorkspacePage('settingsPage');
  renderSettingsWorkspace();
  updateWorkspaceContextBar();
}
document.getElementById('closeProjectActivitiesPage').onclick = returnToSettingsWorkspace;
document.getElementById('closeContactsPage').onclick = ()=>{ window.KarhaApp?.modules?.get('people')?.resetContactFormShell?.(); returnToSettingsWorkspace(); };
document.getElementById('contactAddBtn').onclick = ()=>window.KarhaApp?.modules?.get('people')?.openContactForm();
document.getElementById('activityAddBtn').onclick = openActivityForm;

