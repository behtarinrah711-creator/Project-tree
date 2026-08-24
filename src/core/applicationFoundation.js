// legacy script theme-contract-v1
(function(){
  const root=document.documentElement;
  if(!root.getAttribute('data-theme')) root.setAttribute('data-theme','light');

  window.AppTheme={
    get:function(){ return root.getAttribute('data-theme') || 'light'; },
    set:function(theme){
      const value=theme==='dark'?'dark':'light';
      root.setAttribute('data-theme',value);
    },
    toggle:function(){
      this.set(this.get()==='dark'?'light':'dark');
      return this.get();
    }
  };
})();

// legacy script anonymous
/* ============================================================================
   ARCHITECTURE RULES — GLOBAL INTERNAL PAGES & FORMS
   These rules are permanent and apply to every current and future internal page.
   1) Back always moves exactly ONE level up in the page hierarchy.
   2) Any create/add form opened from a + button is a FULL PAGE, never a popup.
   3) The global footer is hidden while an add/create/edit form is open.
   4) Every data-entry form has exactly three primary actions: ذخیره / پیش‌نویس / انصراف.
      - انصراف: discard all changes made in this form session; save nothing; return directly to the previous page.
      - پیش‌نویس: save the current incomplete state as a draft.
      - ذخیره: validate required fields and save/finalize the record.
   5) Back while a form is completely empty: exit immediately, save nothing.
   6) Back while the form has input AND at least one required field is incomplete: show ONLY a two-choice
      custom question: «بله» / «خیر». بله = save draft and return; خیر = discard and return.
   7) Back while the form is dirty but all required fields are complete: return directly; no draft prompt.
   8) Contact draft rule: saving a draft or offering the draft-exit choice requires firstName OR lastName.
   8) The same rules apply to every internal form under Reports, Accounting and Settings, current and future.
   9) This is a global architecture rule, not a per-page exception. New forms MUST reuse the same
      form-state/back-guard mechanism rather than implementing a separate one.
---------------------------------------------------------------------------- */
const APP_FORM_ARCHITECTURE = Object.freeze({
  fullPage: true,
  hideFooter: true,
  actions: ['ذخیره','پیش‌نویس','انصراف'],
  back: { empty:'exitWithoutSave', incompleteRequired:'confirmDraftYesNo', completeRequired:'exitWithoutSave' },
  emptyMeansNoDraftPrompt: true, // default selections such as nationality do not count as user input
  exitChoices: ['بله','خیر']
});

// legacy script anonymous
const STORAGE_KEY = 'gtasks-clone-v2';
// Data architecture v3: project metadata is kept in the project document;
// operational records (tasks, purchases, estimates, reports) have stable IDs
// and are designed to live independently from the project document.
const DATA_SCHEMA_VERSION = 8; // v199: project-activity contract linkage + richer test status timeline
// ARCHITECTURE RULE:
// - «مشخصات» and «مدیریت پروژه‌ها» are site-level/global menus.
// - Everything inside a selected project's footer/workspace belongs ONLY to that project.
// - Project contacts, activities, tasks and trash are stored under the project; never as global arrays.

const FIRESTORE_TASKS_SUBCOLLECTION = 'tasks';
const FIRESTORE_PURCHASES_SUBCOLLECTION = 'purchases';
const FIRESTORE_ESTIMATES_SUBCOLLECTION = 'estimates';
const FIRESTORE_TASK_REPORTS_SUBCOLLECTION = 'taskReports';
let data = null;

function uid(){ return 'i' + Math.random().toString(36).slice(2,10); }
function makeTask(text){ return {id:uid(), text, done:false, starred:false, cost:null, activities:[], subtasks:[], completedAt:null}; }
function makeSub(text){ return {id:uid(), text, done:false, starred:false, cost:null, activities:[], subtasks:[], completedAt:null}; }
function makeProject(name){ return {id:uid(), name, type:'project', tasks:[], contacts:[], activityTemplates:[], contractTemplates:[], contracts:[], contractStatusReports:[], completedOpen:false, archived:false, trashed:false, schemaVersion:DATA_SCHEMA_VERSION}; }


function rememberProjectTasks(p){ return cloudRuntime.cache.remember(p); }
function getRecoveredLocalTasks(p){ return cloudRuntime.cache.recover(p); }

function normalizeProjectScopedData(p){
  if(!p) return;
  // Some older project metadata documents contain no embedded `tasks` field;
  // their tasks live only in the normalized Firestore subcollection.  All UI
  // renderers nevertheless require an array while that collection hydrates.
  if(!Array.isArray(p.tasks)) p.tasks=[];
  if(!Array.isArray(p.contacts)) p.contacts=[];
  if(!Array.isArray(p.activityTemplates)) p.activityTemplates=[];
  if(!Array.isArray(p.contractTemplates)) p.contractTemplates=[];
  if(!Array.isArray(p.contracts)) p.contracts=[]; if(!Array.isArray(p.contractStatusReports)) p.contractStatusReports=[];
  p.contractTemplates.forEach(t=>{ if(t && t.trashed===undefined) t.trashed=false; });
  p.contracts.forEach(c=>{ if(c && c.trashed===undefined) c.trashed=false; if(c && !Array.isArray(c.progressTimeline)) c.progressTimeline=[]; if(c && c.progressPercent==null) c.progressPercent=0; });
  p.contacts.forEach(c=>{ if(c && c.trashed===undefined) c.trashed=false; });
  p.activityTemplates.forEach(a=>{ if(a && a.trashed===undefined) a.trashed=false; });
}
function migrateLegacyGlobalWorkspaceData(){
  const legacyContacts=Array.isArray(data.contacts)?data.contacts:[];
  const legacyActivities=Array.isArray(data.activityTemplates)?data.activityTemplates:[];
  const hasLegacy=legacyContacts.length || legacyActivities.length;
  if(!hasLegacy) return false;
  const target = (data.projects||[]).find(p=>p.id===getActiveTab() && !p.trashed && !p.archived)
    || (data.projects||[]).find(p=>!p.trashed && !p.archived);
  if(!target) return false;
  normalizeProjectScopedData(target);
  const projectById=new Map((data.projects||[]).map(p=>[String(p.id),p]));
  const addUnique=(arr,item)=>{ if(!item || !item.id) return; if(!arr.some(x=>String(x.id)===String(item.id))) arr.push(item); };
  legacyContacts.forEach(c=>{
    if(!c || !c.id) return;
    const scoped=(c.trashed && c.deletedProjectId && projectById.get(String(c.deletedProjectId))) || target;
    normalizeProjectScopedData(scoped); addUnique(scoped.contacts,c); delete c.deletedProjectId; markDirty(scoped.id);
  });
  legacyActivities.forEach(a=>{
    if(!a || !a.id) return;
    const scoped=(a.trashed && a.deletedProjectId && projectById.get(String(a.deletedProjectId))) || target;
    normalizeProjectScopedData(scoped); addUnique(scoped.activityTemplates,a); delete a.deletedProjectId; markDirty(scoped.id);
  });
  delete data.contacts;
  delete data.activityTemplates;
  return true;
}

function loadData(){
  // D1: canonical in-memory snapshot owned by KarhaAppData (same STORAGE_KEY/shape).
  // `data` is the store reference — not a second copy.
  const store = window.KarhaAppData;
  try{
    if(store && typeof store.loadFromStorage === 'function'){
      data = store.loadFromStorage();
    } else {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        data = JSON.parse(raw);
      } else {
        data = { schemaVersion:DATA_SCHEMA_VERSION, projects:[], viewMode:'simple', activeTab:null, starredOrder:[] };
      }
      if(store && typeof store.replaceSnapshot === 'function'){
        data = store.replaceSnapshot(data);
      }
    }
    if(!data || typeof data !== 'object'){
      data = { schemaVersion:DATA_SCHEMA_VERSION, projects:[], viewMode:'simple', activeTab:null, starredOrder:[] };
      if(store?.replaceSnapshot) data = store.replaceSnapshot(data);
    }
    if(!data.starredOrder) data.starredOrder = [];
    if(!Array.isArray(data.projects)) data.projects = [];
    (data.projects||[]).forEach(p=>{
      p.type = 'project';
      p.schemaVersion = DATA_SCHEMA_VERSION;
      if(p.archived===undefined) p.archived=false;
      if(p.trashed===undefined) p.trashed=false;
      normalizeProjectScopedData(p);
      (p.tasks||[]).forEach(t=>{ if(t.completedAt===undefined) t.completedAt = t.done ? 0 : null; });
      rememberProjectTasks(p);
    });
    migrateLegacyGlobalWorkspaceData();
    // Global Starred tab removed: never keep activeTab === 'starred'
    if(getActiveTab() === 'starred') setActiveTab(null);
    if(store && data === store.getSnapshot?.()){
      /* already shared reference */
    } else if(store?.replaceSnapshot){
      data = store.replaceSnapshot(data);
    }
    // If storage was empty, persist default once (same as prior behavior).
    if(store && !(localStorage.getItem(STORAGE_KEY))){
      persist();
    } else if(!store && !localStorage.getItem(STORAGE_KEY)){
      persist();
    }
    return;
  }catch(e){}
  data = { schemaVersion:DATA_SCHEMA_VERSION, projects:[], viewMode:'simple', activeTab:null, starredOrder:[] };
  if(window.KarhaAppData?.replaceSnapshot) data = window.KarhaAppData.replaceSnapshot(data);
  persist();
}

// D5: extracted sync receives the Store, never loose Set/context copies.
function markDirty(pid){ window.KarhaAppData.markProjectDirty(pid); }

const persistStoreSnapshot = window.KarhaApp.createPersistOrchestrator({
  appDataStore: window.KarhaAppData,
  rememberProjectTasks,
  isCloudEnabled: ()=>isCloudMode() && !!getCurrentUser(),
  findProject,
  syncProject: project=>cloudSyncProjectFull(project),
  onLocalError: ()=>showToast('ذخیره‌سازی با خطا مواجه شد'),
});
function persist(options){ return persistStoreSnapshot(options); }

/* D2: activeTab / viewMode sole owner is KarhaAppData */
function getActiveTab(){
  if(window.KarhaAppData && typeof window.KarhaAppData.getActiveTab === 'function')
    return window.KarhaAppData.getActiveTab();
  return data ? data.activeTab : null;
}
function setActiveTab(value){
  if(window.KarhaAppData && typeof window.KarhaAppData.setActiveTab === 'function')
    return window.KarhaAppData.setActiveTab(value);
  if(data) data.activeTab = value;
  return value;
}
function getViewMode(){
  if(window.KarhaAppData && typeof window.KarhaAppData.getViewMode === 'function')
    return window.KarhaAppData.getViewMode();
  return (data && data.viewMode) ? data.viewMode : 'simple';
}
function setViewMode(value){
  if(window.KarhaAppData && typeof window.KarhaAppData.setViewMode === 'function')
    return window.KarhaAppData.setViewMode(value);
  if(data) data.viewMode = value;
  return value;
}
function showToast(msg){
  if(window.KarhaUI?.showToast) return window.KarhaUI.showToast(msg);
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1600);
}

// Route parameters are strings, while older local datasets can contain numeric
// project ids.  Treat ids as opaque values with string identity so a reload or
// project switch cannot leave the UI stuck on the previously selected project.
function findProject(pid){
  if(pid===null || pid===undefined || pid==='') return null;
  return data.projects.find(p=>String(p.id??p.projectId)===String(pid)) || null;
}
function findTask(pid, tid){ return window.KarhaApp?.taskRuntime?.get(pid,tid) || null; }
function findNestedItem(items, id){
  for(const item of (items||[])){
    if(item && item.id===id) return item;
    const found=findNestedItem(item && item.subtasks, id);
    if(found) return found;
  }
  return null;
}
function findSub(pid, tid, sid){ return window.KarhaApp?.taskRuntime?.findSubtask(pid,tid,sid) || null; }
function itemChildren(item){
  if(!item) return [];
  if(!Array.isArray(item.subtasks)) item.subtasks=[];
  return item.subtasks;
}
function walkItems(items, fn, parent=null, depth=0){
  (items||[]).forEach(item=>{
    if(!item) return;
    fn(item,parent,depth);
    walkItems(item.subtasks, fn, item, depth+1);
  });
}
function findParentItem(pid, tid, childId){
  const root=findTask(pid,tid); if(!root) return null;
  let result=null;
  walkItems(root.subtasks,(item,parent)=>{ if(item.id===childId) result=parent; });
  return result;
}
function toPersianDigits(str){ return window.KarhaUI?.toPersianDigits ? window.KarhaUI.toPersianDigits(str) : String(str).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }
function toEnglishDigits(str){ return window.KarhaUI?.toEnglishDigits ? window.KarhaUI.toEnglishDigits(str) : String(str).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); }
function formatCost(n){
  if(n===null || n===undefined || n==='' || isNaN(Number(n))) return toPersianDigits('0');
  const s = String(Math.round(Number(n)));
  let out = '';
  for(let i=0;i<s.length;i++){
    if(i>0 && (s.length-i)%3===0) out += ',';
    out += s[i];
  }
  return toPersianDigits(out);
}
function groupWithCommas(digits){
  let out = '';
  for(let i=0;i<digits.length;i++){
    if(i>0 && (digits.length-i)%3===0) out += ',';
    out += digits[i];
  }
  return out;
}
function formatCostDisplay(n){
  if(n===null || n===undefined || n==='' || isNaN(Number(n))) return '';
  return toPersianDigits(groupWithCommas(String(Math.round(Math.abs(Number(n)))))) + ' تومان';
}
function taskCostSum(task){
  let total = Number(task.cost)||0;
  walkItems(task.subtasks,(item)=>{ if(!item.trashed) total += Number(item.cost)||0; });
  return total;
}
/** فقط موارد باز — همان‌هایی که بالای بخش تکمیل‌شده دیده می‌شوند */
function projectCostSum(project){
  let sum = 0;
  (project.tasks||[]).forEach(t=>{
    if(t.trashed || t.done) return;
    if(typeof isPendingDeleted === 'function' && isPendingDeleted('task', project.id, t.id)) return;
    sum += Number(t.cost)||0;
    walkItems(t.subtasks,(item)=>{
      if(item.trashed || item.done) return;
      if(typeof isPendingDeleted === 'function' && isPendingDeleted('sub', project.id, t.id, item.id)) return;
      sum += Number(item.cost)||0;
    });
  });
  return sum;
}

/* ---------- confirm whitelist (test users only) ---------- */
const FLOATING_CONFIRM_WHITELIST = ['azizian.moh3n@gmail.com', 'behtarinrah711@gmail.com'];
/** همیشه ایمیل را با حروف کوچک و بدون فاصله ذخیره/مقایسه می‌کنیم */
function normalizeEmail(email){
  return String(email || '').trim().toLowerCase();
}
function isFloatingConfirmUser(){
  return !!(getCurrentUser() && getCurrentUser().email && FLOATING_CONFIRM_WHITELIST.includes(normalizeEmail(getCurrentUser().email)));
}

function removeFromStarredOrder(pid, tid){
  if(!data.starredOrder || !data.starredOrder.length) return;
  const key = pid + ':' + tid;
  const idx = data.starredOrder.indexOf(key);
  if(idx !== -1) data.starredOrder.splice(idx, 1);
}

function setDescendantsDone(item, done){
  walkItems(item.subtasks,(child)=>{ child.done=done; child.completedAt=done?Date.now():null; });
}
function toggleTaskDone(pid, tid){
  const t = findTask(pid, tid); if(!t) return;
  window.KarhaApp?.taskRuntime?.toggleCompleted(pid,tid);
  removeFromStarredOrder(pid, tid);
  renderAll();
}
function toggleSubDone(pid, tid, sid){
  const s = findSub(pid, tid, sid); if(!s) return;
  const changed=window.KarhaApp?.taskRuntime?.toggleCompleted(pid,tid,sid);
  if(changed && !changed.done){ removeFromStarredOrder(pid, tid); } else {
    const p = findProject(pid); if(p) p.completedOpen = true;
  }
  renderAll();
}
function toggleTaskStar(pid, tid){ window.KarhaApp?.taskRuntime?.toggleStarred(pid,tid); renderAll(); }
function toggleSubStar(pid, tid, sid){ window.KarhaApp?.taskRuntime?.toggleStarred(pid,tid,sid); renderAll(); }

function deleteTask(pid, tid){
  closeSheet();
  softDelete('task', pid, tid, null, 'کار حذف شد');
}
function deleteSub(pid, tid, sid){
  softDelete('sub', pid, tid, sid, 'زیرمجموعه حذف شد');
}
function addTaskToProject(pid, text){
  if(window.KarhaApp?.taskRuntime?.create(pid,text)) renderAll();
}
function addSubToTask(pid, tid, text, parentId=null){
  const child=window.KarhaApp?.taskRuntime?.createSubtask(pid,tid,text,parentId);
  if(child) renderAll();
  return child;
}
function addProject(name){
  if(!name || !name.trim()) return;
  const created=window.KarhaApp?.projectApi?.create?.({name:name.trim()});
  if(!created?.ok) return;
  const p=findProject(created.project.id) || created.project;
  if(isCloudMode() && getCurrentUser()){
    cloudRuntime.createProject(p);
  }
  if(!findProject(p.id) && Array.isArray(data.projects)) data.projects.push(p);
  setActiveProject(p.id,{updateRoute:true,render:true,moduleId:'dashboard'});
}

function setWorkspaceRoute(projectId, moduleId='dashboard'){
  if(!projectId) return;
  return window.KarhaApp?.projectWorkspace?.selectProject?.(projectId,{moduleId});
}
function replaceWorkspaceRoute(projectId, moduleId='dashboard'){
  if(!projectId) return;
  return window.KarhaApp?.projectWorkspace?.selectProject?.(projectId,{moduleId,replace:true});
}
function getProjectIdFromRoute(){
  const m = String(location.hash || '').match(/^#\/?projects\/([^/?&#]+)/i) || String(location.hash || '').match(/^#\/?project\/([^/?&#]+)/i);
  if(!m || !m[1]) return null;
  try{return decodeURIComponent(m[1]);}catch(e){return m[1];}
}
function setActiveProject(projectId,{updateRoute=true,render=true,moduleId='dashboard',closeDrawerOnSelect=false}={}){
  const p=findProject(projectId);
  if(!p || p.trashed || p.archived) return false;
  if(!getCurrentUser() && p.ownerUid) return false;
  if(updateRoute){
    return !!window.KarhaApp?.projectWorkspace?.selectProject?.(p.id,{
      moduleId, closeDrawer:closeDrawerOnSelect,
    });
  }
  setActiveTab(p.id);
  taskUI?.setAddItemActive(false);
  // Project selection is navigation state, not a debounced content edit. Save
  // it synchronously so a quick reload/backgrounding on mobile cannot restore
  // the project that happened to be active before the tap.
  try{
      if(window.KarhaApp?.applyCloudSnapshot && Array.isArray(data?.projects)){
        data.projects.forEach(pr=>{ if(pr&&pr.id) window.KarhaApp.applyCloudSnapshot(pr); });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    }catch(e){}
  if(window.KarhaApp?.projectContext) window.KarhaApp.projectContext.setProjectId(p.id);
  if(closeDrawerOnSelect) closeDrawer();
  // Programmatic navigation renders through Router -> module.mount. Callers
  // that explicitly suppress routing still retain the legacy render option.
  if(render && !updateRoute) renderAll();
  renderDrawerProjectList();
  return true;
}
/** Guest must not see cloud-owned projects that remain in localStorage after logout.
 *  Owned projects reappear only after the matching Google account signs in. */
function projectsVisibleForAuth(list){
  const all = Array.isArray(list) ? list : [];
  if(!getCurrentUser()) return all.filter(p => p && !p.ownerUid);
  // Phase 5: cloud visibility is owner-only (no sharedWith collaborator view).
  return all.filter(p => p && (!p.ownerUid || p.ownerUid === getCurrentUser().uid));
}

function renderDrawerProjectList(){
  const list=document.getElementById('drawerProjectList');
  if(!list || !data) return;
  const source = projectsVisibleForAuth(window.KarhaApp?.projectWorkspace?.listProjects?.() || data.projects || []);
  const projects=source.filter(p=>p && !p.trashed && !p.archived && !isPendingDeleted('project',p.id));
  if(!projects.length){
    list.replaceChildren();
    const empty=document.createElement('div'); empty.className='drawer-empty-projects'; empty.textContent='هنوز پروژه فعالی وجود ندارد. از «پروژه جدید» شروع کنید.'; list.appendChild(empty); return;
  }
  window.KarhaApp?.reconcileDrawerProjectList?.(list,projects,{
    activeProjectId:getActiveTab(),
    createRow(){
      const row=document.createElement('button'); row.type='button';
      const name=document.createElement('span'); name.className='drawer-project-name'; row.appendChild(name);
      const count=document.createElement('span'); count.className='drawer-project-count'; row.appendChild(count);
      return row;
    },
    updateRow(row,p,active){
      row.className='drawer-project-row'+(active?' active':'');
      row.querySelector('.drawer-project-name').textContent=p.name||'پروژه بدون نام';
      const undone=(p.tasks||[]).filter(t=>!t.done&&!t.trashed&&!isPendingDeleted('task',p.id,t.id)).length;
      row.querySelector('.drawer-project-count').textContent=toPersianDigits(String(undone));
    },
    onSelect(projectId){
      window.KarhaApp?.projectWorkspace?.selectProject?.(projectId,{
        moduleId:'dashboard', closeDrawer:true,
      });
    }
  });
}
function openGlobalTrashFromDrawer(){
  closeDrawer();
  openProjectsPage();
  projectManagementView.setTab('deleted');
  renderManagementPage();
}
function deleteProject(pid){
  softDelete('project', pid, null, null, 'پروژه حذف شد');
}

/* ---------- cloud sync (Firebase): L5 modular ownership ---------- */
const firebaseRuntime=window.KarhaFirebaseRuntime;
const cloudRuntime=window.KarhaApp.createCloudRuntime({
  windowRef:window,documentRef:document,firebase:firebaseRuntime.firebase,auth:firebaseRuntime.auth,db:firebaseRuntime.db,
  app:window.KarhaApp,store:window.KarhaAppData,schemaVersion:DATA_SCHEMA_VERSION,findProject,
  getProjects:()=>data?.projects||[],normalizeEmail,
  persistLocalFromCloud(){
    try{(data?.projects||[]).forEach(project=>project?.id&&window.KarhaApp.applyCloudSnapshot(project));}catch(e){}
  },
  onTaskUiRefresh(projectId){
    if(String(getActiveTab())===String(projectId)&&['dashboard','tasks'].includes(window.KarhaRoute?.moduleId))renderAll();
    else refreshCurrentFooterPage();
  },
  onHydrated(projectId){
    if(String(getActiveTab())===String(projectId)&&['dashboard','tasks'].includes(window.KarhaRoute?.moduleId))renderAll();
    else refreshCurrentFooterPage();
  },
  onCloudError(error){console.error('owned listener',error);showToast('خطا در دریافت پروژه‌های خودتان');},
  onGuest(){
    loadData();const active=getActiveTab()?(data.projects||[]).find(project=>String(project.id)===String(getActiveTab())):null;
    if(active?.ownerUid){setActiveTab(null);try{window.KarhaApp?.projectContext?.setProjectId?.(null);}catch(e){}}
    renderDrawerProjectList();renderAll();
  },
  flushStatus:()=>flushProjectStatusQueue(),
  onWriteFailure(project){markDirty(project.id);persist();},
  syncContext(session,{db,cache,writeTasks}){return {cloudMode:session.cloudMode,currentUser:session.currentUser,db,
    appDataStore:window.KarhaAppData,normalizeEmail,DATA_SCHEMA_VERSION,normalizeProjectScopedData,
    mergePolicy:window.KarhaApp?.mergePolicy,projectRepositoryFind:id=>window.KarhaApp?.projectRepository?.find?.(id),
    getRecoveredLocalTasks:cache.recover,normalizeTaskRecord:cloudRuntime.normalizeTaskRecord,
    rememberProjectTasks:cache.remember,writeTaskRecordsNormalized:writeTasks,isRetryableCloudError,markDirty,persist};}
});
function getCurrentUser(){return cloudRuntime.getSession().currentUser;}
function isCloudMode(){return cloudRuntime.getSession().cloudMode;}
function cloudDeleteProject(p){return cloudRuntime.lifecycle.remove(p);}
function cloudRenameProject(p){return cloudRuntime.lifecycle.rename(p);}
function normalizeTaskRecord(task){return cloudRuntime.normalizeTaskRecord(task);}
function taskCollection(pid){return cloudRuntime.collections.tasks(pid);}
function purchaseCollection(pid){return cloudRuntime.collections.purchases(pid);}
function estimateCollection(pid){return cloudRuntime.collections.estimates(pid);}
function taskReportCollection(pid){return cloudRuntime.collections.taskReports(pid);}
function stopCloudTaskListener(pid){return cloudRuntime.taskListeners.stop(pid);}
function startCloudTaskListener(p){return cloudRuntime.taskListeners.start(p);}
function hydrateProjectTasksFromCloud(p,d){return cloudRuntime.hydrateProject(p,d);}
function writeTaskRecordsNormalized(pid,tasks){return cloudRuntime.writeTasks(pid,tasks);}
function cloudSyncTaskDomain(p){return cloudRuntime.cloudSyncTask(p).catch(error=>console.warn('task domain sync failed; UI remains available',p.id,error));}
function isPermissionError(err){const code=String(err?.code||'').toLowerCase();return code==='permission-denied'||code.includes('permission');}
function isRetryableCloudError(err){if(!err)return true;if(isPermissionError(err))return false;return ['unavailable','deadline-exceeded','aborted','failed-precondition','resource-exhausted','internal','unknown'].includes(String(err.code||'').toLowerCase())||!err.code;}
function cloudSyncCtx(){const session=cloudRuntime.getSession();return {cloudMode:session.cloudMode,currentUser:session.currentUser,db:firebaseRuntime.db,DATA_SCHEMA_VERSION,firebase:firebaseRuntime.firebase,findProject,isPermissionError,isRetryableCloudError};}
function flushProjectStatusQueue(){return window.KarhaApp?.flushProjectStatusQueue?.(cloudSyncCtx());}
function scheduleProjectStatusRetry(){return window.KarhaApp?.scheduleProjectStatusRetry?.(cloudSyncCtx());}
function cloudSyncProjectStatus(p){return window.KarhaApp?.cloudSyncProjectStatus?.(cloudSyncCtx(),p);}
function cloudSyncProjectFull(p){return cloudRuntime.cloudSyncProject(p);}
function docToProject(doc,localExisting){return window.KarhaApp.docToProjectFromCloud(doc,localExisting,{normalizeTaskRecord,getRecoveredLocalTasks,appDataStore:window.KarhaAppData,normalizeEmail,mergePolicy:window.KarhaApp.mergePolicy});}

/* ---------- dependency guard for contacts / activities ---------- */
/*
  قانون عمومی:
  اگر مخاطب یا فعالیت در هر بخش داده‌های پروژه استفاده شده باشد،
  حذف آن مجاز نیست. این بررسی عمداً مستقل از UI انجام می‌شود تا هیچ
  صفحه‌ای نتواند با دور زدن دکمه حذف، رکورد مرجع‌دار را حذف کند.
*/
function findProjectRecordReferences(type, id){
  const targetId = String(id ?? '');
  const refs = [];
  const addRef = (project, label) => {
    refs.push({projectId:project?.id || '', projectName:project?.name || '', label});
  };
  const liveContracts = (project) => (project.contracts || []).filter(c => c && !c.trashed);
  const liveTemplates = (project) => (project.contractTemplates || []).filter(t => t && !t.trashed);
  const liveReports = (project) => (project.contractStatusReports || []).filter(r => r && !r.trashed);
  const liveContacts = (project) => (project.contacts || []).filter(c => c && !c.trashed);
  const liveTasks = (project) => (project.tasks || []).filter(t => t && !t.trashed);

  (data.projects || []).forEach(project=>{
    if(!project || project.trashed) return;

    if(type === 'contact'){
      liveContracts(project).forEach(c=>{
        if(String(c.contractorId || '') === targetId ||
 String(c.employerId || '') === targetId ||
 String(c.contactId || '') === targetId ||
 String(c.employerContactId || '') === targetId){
addRef(project, 'قرارداد');
        }
      });
      liveReports(project).forEach(r=>{
        if(String(r.contactId || '') === targetId){
addRef(project, 'صورت وضعیت / گزارش قرارداد');
        }
      });
    }

    if(type === 'activity'){
      liveContacts(project).forEach(c=>{
        if(Array.isArray(c.activities) && c.activities.some(x=>String(x)===targetId)){
addRef(project, 'مخاطب');
        }
      });
      liveTasks(project).forEach(t=>{
        if(Array.isArray(t.activities) && t.activities.some(x=>String(x)===targetId)){
addRef(project, 'آیتم پروژه');
        }
        walkItems(t.subtasks,(item)=>{
if(item && !item.trashed && Array.isArray(item.activities) && item.activities.some(x=>String(x)===targetId)){
  addRef(project, 'زیرآیتم پروژه');
}
        });
      });
      liveTemplates(project).forEach(t=>{
        if(String(t.activityId || '') === targetId){
addRef(project, 'قالب قرارداد');
        }
      });
      liveContracts(project).forEach(c=>{
        if(String(c.activityId || '') === targetId ||
 (Array.isArray(c.activityIds) && c.activityIds.some(x=>String(x)===targetId))){
addRef(project, 'قرارداد');
        }
      });
      liveReports(project).forEach(r=>{
        if(String(r.activityId || '') === targetId){
addRef(project, 'صورت وضعیت / گزارش قرارداد');
        }
      });
    }

    if(type === 'task' || type === 'subtask' || type === 'sub'){
      const itemIds = new Set([targetId]);
      if(type === 'task'){
        liveTasks(project).forEach(t=>{
if(String(t.id) !== targetId) return;
walkItems(t.subtasks,(item)=>{
  if(item && item.id != null) itemIds.add(String(item.id));
});
        });
      }
      liveContracts(project).forEach(c=>{
        if(itemIds.has(String(c.projectItemId || ''))){
addRef(project, 'قرارداد');
        }
      });
    }
  });

  return refs;
}

function canDeleteProjectRecord(type, id){
  const refs = findProjectRecordReferences(type, id);
  if(!refs.length) return {ok:true, refs:[]};
  const unique = [];
  const seen = new Set();
  refs.forEach(r=>{
    const key=String(r.projectId)+'|'+r.label;
    if(!seen.has(key)){seen.add(key);unique.push(r);}
  });
  return {ok:false, refs:unique};
}

function showRecordDeleteBlocked(type, refs){
  const noun = type === 'contact' ? 'مخاطب'
    : (type === 'activity' ? 'فعالیت'
    : (type === 'task' ? 'آیتم پروژه'
    : (type === 'sub' || type === 'subtask' ? 'زیرآیتم پروژه' : 'مورد')));
  const places = (refs || []).map(r=>r.label).filter(Boolean);
  const uniquePlaces = [...new Set(places)];
  const where = uniquePlaces.length ? ' (استفاده در: '+uniquePlaces.join('، ')+')' : '';
  showToast('این '+noun+' قابل حذف نیست؛ هنوز در سیستم استفاده شده است'+where);
  return false;
}

/* ---------- soft delete / undo (owned by src/core/softDelete.js) ---------- */
function isPendingDeleted(type, pid, tid, sid){
  if(window.KarhaSoftDelete?.isPendingDeleted) return window.KarhaSoftDelete.isPendingDeleted(type, pid, tid, sid);
  return false;
}
function softDelete(type, pid, tid, sid, label){
  if(window.KarhaSoftDelete?.softDelete) return window.KarhaSoftDelete.softDelete(type, pid, tid, sid, label);
  return false;
}
function softDeleteProjectRecord(type, id, label){
  if(window.KarhaSoftDelete?.softDeleteProjectRecord) return window.KarhaSoftDelete.softDeleteProjectRecord(type, id, label);
  return false;
}
function finalizePendingDelete(){
  if(window.KarhaSoftDelete?.finalizePendingDelete) return window.KarhaSoftDelete.finalizePendingDelete();
}
function undoPendingDelete(){
  if(window.KarhaSoftDelete?.undoPendingDelete) return window.KarhaSoftDelete.undoPendingDelete();
}
function showUndoToast(label){
  if(window.KarhaSoftDelete?.showUndoToast) return window.KarhaSoftDelete.showUndoToast(label);
}
function hideUndoToast(){
  if(window.KarhaSoftDelete?.hideUndoToast) return window.KarhaSoftDelete.hideUndoToast();
}
/** Called from KarhaSoftDelete after project trash — owns getActiveTab(). */
function onProjectSoftDeletedFinalize(pid){
  if(getActiveTab() === pid){
    const nextVisible = (data.projects||[]).find(pr => pr.id !== pid && !pr.trashed && !pr.archived);
    setActiveTab(nextVisible ? nextVisible.id : null);
  }
}
function getCurrentProjectScopeId(){
  const id = data && getActiveTab() && getActiveTab()!=='starred' ? getActiveTab() : null;
  return id && findProject(id) ? id : null;
}

/* ---------- svg icons ---------- */
function svgCheck(){ return '<svg width="13" height="10" viewBox="0 0 13 10" fill="none"><path d="M1 5l3.5 3.5L12 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function svgStar(filled){ return '<svg width="18" height="18" viewBox="0 0 20 20" fill="'+(filled?'currentColor':'none')+'"><path d="M10 1.8l2.5 5.2 5.6.6-4.2 3.8 1.1 5.6L10 14.2l-5 2.8 1.1-5.6-4.2-3.8 5.6-.6L10 1.8z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>'; }
function svgChevron(){ return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function svgTrash(){ return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V2.6c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7V4M6.6 7v5M9.4 7v5M3.7 4l.6 9.2c0 .6.5 1 1.1 1h5.2c.6 0 1.1-.4 1.1-1L12.3 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function svgPlus(){ return '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1v13M1 7.5h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'; }

/* ---------- collect starred ---------- */

