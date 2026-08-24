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

const firebaseConfig = {
  apiKey: "AIzaSyBbRk4MsdHtj-gWnjbJExvQgW0sY6Z4uK8",
  authDomain: "tree-d92af.firebaseapp.com",
  projectId: "tree-d92af",
  storageBucket: "tree-d92af.firebasestorage.app",
  messagingSenderId: "401523332370",
  appId: "1:401523332370:web:3a524a2b86b967ca4d8fcb"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
db.enablePersistence({ synchronizeTabs: true }).catch((err)=>{
  console.warn('Offline persistence not enabled:', err.code);
});

// legacy script anonymous
const STORAGE_KEY = 'gtasks-clone-v2';
const TASK_RECOVERY_KEY = 'gtasks-task-recovery-v1';
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


// آخرین نسخهٔ سالم دستورکارهای هر پروژه را محلی نگه می‌داریم تا یک Snapshot
// ناقص/خالی Firestore نتواند سابقهٔ دستورکارها را برای همیشه از بین ببرد.
function readTaskRecoveryCache(){
  try{ return JSON.parse(localStorage.getItem(TASK_RECOVERY_KEY) || '{}'); }catch(e){ return {}; }
}
function writeTaskRecoveryCache(cache){
  try{ localStorage.setItem(TASK_RECOVERY_KEY, JSON.stringify(cache)); }catch(e){}
}
function rememberProjectTasks(p){
  if(!p || !p.id || !Array.isArray(p.tasks) || !p.tasks.length) return;
  const cache=readTaskRecoveryCache();
  cache[p.id]={name:p.name||'', tasks:p.tasks.map(normalizeTaskRecord), savedAt:Date.now()};
  // محدود نگه داشتن کش: حداکثر 100 پروژه.
  const keys=Object.keys(cache).sort((a,b)=>(cache[b].savedAt||0)-(cache[a].savedAt||0));
  keys.slice(100).forEach(k=>delete cache[k]);
  writeTaskRecoveryCache(cache);
}
function getRecoveredLocalTasks(p){
  if(!p || !p.id) return [];
  const cache=readTaskRecoveryCache();
  const rec=cache[p.id];
  if(!rec || !Array.isArray(rec.tasks)) return [];
  return rec.tasks.map(normalizeTaskRecord);
}

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
  isCloudEnabled: ()=>cloudMode && !!currentUser,
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
  return !!(currentUser && currentUser.email && FLOATING_CONFIRM_WHITELIST.includes(normalizeEmail(currentUser.email)));
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
  if(cloudMode && currentUser){
    const ref = db.collection('projects').doc(p.id);
    p.ownerUid = currentUser.uid;
    p.ownerEmail = normalizeEmail(currentUser.email);
    p.sharedWith = [];
    window.KarhaAppData.markCloudWritePending(p.id);
    ref.set({ name:p.name, type:'project', completedOpen:false, ownerUid:currentUser.uid, ownerEmail:p.ownerEmail, sharedWith:[], contacts:p.contacts||[], activityTemplates:p.activityTemplates||[], contractTemplates:p.contractTemplates||[], contracts:p.contracts||[], contractStatusReports:p.contractStatusReports||[], schemaVersion:DATA_SCHEMA_VERSION })
      .then(()=>writeTaskRecordsNormalized(p.id, p.tasks))
      .then(()=>window.KarhaAppData.clearCloudWritePending(p.id))
      .catch(err=>{
        window.KarhaAppData.clearCloudWritePending(p.id);
        console.warn('project creation sync failed', p.id, err);
        // پروژه در UI/local باقی می‌ماند؛ persist بعدی آن را دوباره sync می‌کند.
        markDirty(p.id);
        persist();
      });
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
  if(!currentUser && p.ownerUid) return false;
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
  if(!currentUser) return all.filter(p => p && !p.ownerUid);
  // Phase 5: cloud visibility is owner-only (no sharedWith collaborator view).
  return all.filter(p => p && (!p.ownerUid || p.ownerUid === currentUser.uid));
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

/* ---------- cloud sync (Firebase) ---------- */
let cloudMode = false;
let currentUser = null;
let cloudUnsubOwned = null;
let migratedGuestData = false;

function cloudDeleteProject(p){
  if(!cloudMode || !p || !p.ownerUid) return;
  db.collection('projects').doc(p.id).delete().catch(()=>{});
}

function cloudRenameProject(p){
  if(!cloudMode || !p || !p.ownerUid) return;
  db.collection('projects').doc(p.id).update({ name: p.name }).catch(()=>{});
}

function normalizeTaskRecord(task){
  const normalizeChild=(child)=>({
    ...child,
    completedAt: child.completedAt===undefined ? (child.done ? 0 : null) : child.completedAt,
    activities: Array.isArray(child.activities) ? [...new Set(child.activities.filter(Boolean))] : [],
    subtasks: Array.isArray(child.subtasks) ? child.subtasks.map(normalizeChild) : []
  });
  return {
    ...task,
    completedAt: task.completedAt===undefined ? (task.done ? 0 : null) : task.completedAt,
    activities: Array.isArray(task.activities) ? [...new Set(task.activities.filter(Boolean))] : [],
    subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(normalizeChild) : []
  };
}

function docToProject(doc, localExisting){
  const fn = window.KarhaApp?.docToProjectFromCloud;
  if(typeof fn === 'function'){
    return fn(doc, localExisting, {
      normalizeTaskRecord,
      getRecoveredLocalTasks,
      appDataStore: window.KarhaAppData,
      normalizeEmail,
      mergePolicy: window.KarhaApp?.mergePolicy,
    });
  }
  // fallback should not run once KarhaApp is ready
  return { id: doc.id, name: (doc.data()||{}).name, type:'project', tasks:[], contacts:[], activityTemplates:[], contractTemplates:[], contracts:[], expanded:true };
}

/**
 * Normalized data layer. The visible UI intentionally remains unchanged.
 * Tasks are independent Firestore documents, while subtasks remain embedded
 * in their task document for backward compatibility with the existing UI.
 */
function taskCollection(pid){ return db.collection('projects').doc(pid).collection(FIRESTORE_TASKS_SUBCOLLECTION); }
function purchaseCollection(pid){ return db.collection('projects').doc(pid).collection(FIRESTORE_PURCHASES_SUBCOLLECTION); }
function estimateCollection(pid){ return db.collection('projects').doc(pid).collection(FIRESTORE_ESTIMATES_SUBCOLLECTION); }
function taskReportCollection(pid){ return db.collection('projects').doc(pid).collection(FIRESTORE_TASK_REPORTS_SUBCOLLECTION); }

const cloudTaskUnsubs = {};
function stopCloudTaskListener(pid){
  if(cloudTaskUnsubs[pid]){ try{ cloudTaskUnsubs[pid](); }catch(e){} delete cloudTaskUnsubs[pid]; }
}
function startCloudTaskListener(p){
  if(!cloudMode || !p || !p.ownerUid || cloudTaskUnsubs[p.id]) return;
  const attach = window.KarhaApp?.attachCloudTaskListener;
  const ctx = {
    cloudMode, db, findProject, normalizeTaskRecord, getRecoveredLocalTasks,
    rememberProjectTasks, appDataStore: window.KarhaAppData,
    DATA_SCHEMA_VERSION, taskCollection,
    persistLocalFromCloud(){
      try{
        if(window.KarhaApp?.applyCloudSnapshot && Array.isArray(data?.projects)){
          data.projects.forEach(pr=>{ if(pr&&pr.id) window.KarhaApp.applyCloudSnapshot(pr); });
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
      }catch(e){}
    },
    onTaskUiRefresh(projectId){
      if(String(getActiveTab()) === String(projectId) && ['dashboard','tasks'].includes(window.KarhaRoute?.moduleId)) renderAll();
      else refreshCurrentFooterPage();
    },
  };
  if(typeof attach === 'function'){
    const unsub = attach(ctx, p);
    if(unsub) cloudTaskUnsubs[p.id] = unsub;
    return;
  }
}

async function recoverLegacyTasksForProject(p, projectDocData){
  const recovered = [];
  const seen = new Set();
  const add = (task, source) => {
    if(!task) return;
    const t = normalizeTaskRecord(task);
    const id = String(t.id || '');
    if(!id || seen.has(id)) return;
    seen.add(id);
    recovered.push(t);
  };

  // 1) The current project document's old embedded tasks.
  if(projectDocData && Array.isArray(projectDocData.tasks)){
    projectDocData.tasks.forEach(t => add(t, 'current-legacy'));
  }

  // 2) Older project records can exist under another document id after a
  // migration/fork. If the project name is the same, recover their embedded
  // tasks and their normalized task subcollections. We never delete those
  // records here; they remain untouched as a safety net.
  try{
    if(p.name && currentUser && currentUser.uid){
      const sameNameSnap = await db.collection('projects')
        .where('ownerUid','==',currentUser.uid)
        .where('name','==',p.name)
        .get();
      for(const doc of sameNameSnap.docs){
        const d = doc.data() || {};
        if(Array.isArray(d.tasks)) d.tasks.forEach(t => add(t, 'same-name-legacy'));
        try{
          const ts = await db.collection('projects').doc(doc.id)
            .collection(FIRESTORE_TASKS_SUBCOLLECTION).get();
          ts.docs.forEach(td => add({id:td.id, ...td.data()}, 'same-name-subcollection'));
        }catch(e){
          console.warn('legacy task subcollection recovery skipped', doc.id, e);
        }
      }
    }
  }catch(e){
    console.warn('same-name legacy task recovery skipped', p.id, e);
  }

  // 3) Also recover normalized records whose projectId points to this project.
  // This is useful if the task document was moved/forked while retaining its
  // original projectId metadata.
  try{
    const cg = await db.collectionGroup(FIRESTORE_TASKS_SUBCOLLECTION)
      .where('projectId','==',p.id).get();
    cg.docs.forEach(td => add({id:td.id, ...td.data()}, 'collection-group'));
  }catch(e){
    // collectionGroup may be unavailable under older Firestore rules/indexes;
    // this recovery path is optional and must never break normal loading.
    console.warn('collectionGroup task recovery skipped', p.id, e);
  }

  return recovered;
}

async function hydrateProjectTasksFromCloud(p, projectDocData){
  if(!cloudMode || !p || !p.ownerUid) return false;
  const projectId=p.id;
  // Subscribe first. Recovery performs several optional network reads and must
  // not delay the normal task collection from reaching the visible project.
  startCloudTaskListener(p);
  try{
    const snap = await taskCollection(projectId).get();
    const normalizedTasks = snap.docs.map(d => normalizeTaskRecord({id:d.id, ...d.data()}));
    const legacyTasks = Array.isArray(projectDocData && projectDocData.tasks)
      ? projectDocData.tasks.map(normalizeTaskRecord) : [];

    // مهم: وجود حتی یک رکورد در مجموعه جدید به معنی کامل بودن مهاجرت نیست.
    // علاوه بر سند فعلی و کش، رکوردهای قدیمی پروژه‌های هم‌نام و taskهای دارای
    // projectId را هم بازیابی می‌کنیم. هیچ رکوردی صرفاً به دلیل وجود رکورد جدید
    // حذف یا جایگزین نمی‌شود.
    const recoveredTasks = await recoverLegacyTasksForProject(p, projectDocData);
    // Either of the awaited reads above may overlap a metadata snapshot. Merge
    // into the current object, not the now-detached `p` passed by the caller.
    const current=findProject(projectId) || p;
    const cachedTasks = Array.isArray(current.tasks)
      ? current.tasks.map(normalizeTaskRecord) : [];
    const recoveryTasks = getRecoveredLocalTasks(current);
    const byId = new Map();
    normalizedTasks.forEach(t => byId.set(String(t.id), t));
    legacyTasks.forEach(t => { const id=String(t.id); if(!byId.has(id)) byId.set(id,t); });
    recoveredTasks.forEach(t => { const id=String(t.id); if(!byId.has(id)) byId.set(id,t); });
    recoveryTasks.forEach(t => { const id=String(t.id); if(!byId.has(id)) byId.set(id,t); });
    cachedTasks.forEach(t => { const id=String(t.id); if(!byId.has(id)) byId.set(id,t); });

    const mergedTasks = Array.from(byId.values());
    const needsRepair = mergedTasks.length > normalizedTasks.length ||
      legacyTasks.some(t => !normalizedTasks.some(n => String(n.id)===String(t.id))) ||
      recoveredTasks.some(t => !normalizedTasks.some(n => String(n.id)===String(t.id))) ||
      recoveryTasks.some(t => !normalizedTasks.some(n => String(n.id)===String(t.id))) ||
      cachedTasks.some(t => !normalizedTasks.some(n => String(n.id)===String(t.id)) &&
                            !legacyTasks.some(l => String(l.id)===String(t.id)));

    if(mergedTasks.length){
      current.tasks = mergedTasks;
      rememberProjectTasks(current);
      current.schemaVersion = DATA_SCHEMA_VERSION;
      try{
      if(window.KarhaApp?.applyCloudSnapshot && Array.isArray(data?.projects)){
        data.projects.forEach(pr=>{ if(pr&&pr.id) window.KarhaApp.applyCloudSnapshot(pr); });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    }catch(e){}

      if(needsRepair || Number(projectDocData && projectDocData.schemaVersion || 1) < DATA_SCHEMA_VERSION){
        window.KarhaAppData.markCloudWritePending(projectId);
        try{
          // رکوردهای موجود حفظ می‌شوند و رکوردهای گمشده دوباره در مجموعه مستقل نوشته می‌شوند.
          await writeTaskRecordsNormalized(projectId, mergedTasks);
          const verify = await taskCollection(projectId).get();
          const verifiedIds = new Set(verify.docs.map(d => d.id));
          if(mergedTasks.some(t => !verifiedIds.has(String(t.id)))){
            throw new Error('task repair verification failed');
          }
          // کپی قدیمی داخل سند پروژه عمداً حذف نمی‌شود. این کپی تا زمانی که
          // پایداری داده‌ها در نسخه‌های بعدی ثابت شود، به‌عنوان recovery backup
          // باقی می‌ماند و هرگز نباید به خاطر یک Snapshot ناقص از بین برود.
          if(Number(projectDocData && projectDocData.schemaVersion || 1) < DATA_SCHEMA_VERSION){
            await db.collection('projects').doc(projectId).update({schemaVersion:DATA_SCHEMA_VERSION});
          }
        } finally {
          window.KarhaAppData.clearCloudWritePending(projectId);
        }
      }
      startCloudTaskListener(current);
      return true;
    }

    // پروژه واقعاً بدون دستورکار است.
    if(Number(projectDocData && projectDocData.schemaVersion || 1) < DATA_SCHEMA_VERSION){
      window.KarhaAppData.markCloudWritePending(projectId);
      try{
        await db.collection('projects').doc(projectId).update({
          tasks: firebase.firestore.FieldValue.delete(),
          schemaVersion: DATA_SCHEMA_VERSION
        });
      } finally { window.KarhaAppData.clearCloudWritePending(projectId); }
    }
    current.tasks = [];
    current.schemaVersion = DATA_SCHEMA_VERSION;
    startCloudTaskListener(current);
    return true;
  }catch(err){
    // در هیچ خطایی آرایه دستورکارهای موجود را با [] جایگزین نکن.
    console.warn('task hydration/repair failed; keeping cached tasks:', projectId, err);
    const current=findProject(projectId) || p;
    if(!Array.isArray(current.tasks)) current.tasks = [];
    return false;
  }
}

async function writeTaskRecordsNormalized(pid, tasks){
  const fn = window.KarhaApp?.writeTaskRecordsNormalized;
  if(typeof fn === 'function'){
    return fn({
      cloudMode, currentUser, db, taskCollection, normalizeTaskRecord, DATA_SCHEMA_VERSION,
    }, pid, tasks);
  }
}

function cloudSyncTaskDomain(p){
  if(!cloudMode || !currentUser || !p || !p.ownerUid) return;
  writeTaskRecordsNormalized(p.id, p.tasks).catch(err=>{
    console.warn('task domain sync failed; UI remains available', p.id, err);
    if(isRetryableCloudError(err)){
      markDirty(p.id);
      scheduleProjectStatusRetry();
      persist();
    }
  });
}


// ---------- project status sync owned by src/sync/projectStatusSync.js ----------
function readProjectStatusQueue(){
  return window.KarhaApp?.readProjectStatusQueue?.() || {};
}
function writeProjectStatusQueue(q){
  return window.KarhaApp?.writeProjectStatusQueue?.(q);
}
function queueProjectStatus(p){
  return window.KarhaApp?.queueProjectStatus?.(p);
}
function dequeueProjectStatus(pid){
  return window.KarhaApp?.dequeueProjectStatus?.(pid);
}
function isPermissionError(err){
  const code = String(err && err.code || '').toLowerCase();
  return code === 'permission-denied' || code.indexOf('permission') !== -1;
}
function isRetryableCloudError(err){
  if(!err) return true;
  if(isPermissionError(err)) return false;
  const code = String(err.code || '').toLowerCase();
  return [
    'unavailable','deadline-exceeded','aborted','failed-precondition',
    'resource-exhausted','internal','unknown'
  ].includes(code) || !code;
}

async function writeProjectStatusVerified(p){
  const fn = window.KarhaApp?.writeProjectStatusVerified;
  if(typeof fn === 'function'){
    return fn(cloudSyncCtx(), p);
  }
  return {ok:false, skipped:true};
}
async function flushProjectStatusQueue(){
  const fn = window.KarhaApp?.flushProjectStatusQueue;
  if(typeof fn === 'function') return fn(cloudSyncCtx());
}
function scheduleProjectStatusRetry(){
  const fn = window.KarhaApp?.scheduleProjectStatusRetry;
  if(typeof fn === 'function') return fn(cloudSyncCtx());
}
async function cloudSyncProjectStatus(p){
  const fn = window.KarhaApp?.cloudSyncProjectStatus;
  if(typeof fn === 'function') return fn(cloudSyncCtx(), p);
  return false;
}
function cloudSyncCtx(){
  return {
    cloudMode, currentUser, db, DATA_SCHEMA_VERSION, firebase,
    findProject, isPermissionError, isRetryableCloudError,
  };
}

function cloudSyncProjectFull(p){
  const fn = window.KarhaApp?.cloudSyncProjectFull;
  if(typeof fn === 'function'){
    return fn({
      cloudMode, currentUser, db, appDataStore: window.KarhaAppData, normalizeEmail, DATA_SCHEMA_VERSION,
      normalizeProjectScopedData, mergePolicy: window.KarhaApp?.mergePolicy,
      projectRepositoryFind: (id)=> window.KarhaApp?.projectRepository?.find?.(id),
      getRecoveredLocalTasks, normalizeTaskRecord, rememberProjectTasks,
      writeTaskRecordsNormalized, isRetryableCloudError, markDirty, persist,
    }, p);
  }
}

/* D5: metadata orchestration is extracted; this is a thin runtime dependency bridge. */
function mergeCloudSnapshots(ownedDocs, sharedDocs){
  const apply = window.KarhaApp?.applyOwnedCloudProjects;
  if(typeof apply !== 'function') return;
  return apply({
    appDataStore: window.KarhaAppData,
    ownedDocs: ownedDocs || [],
    currentUser,
    docToProject,
  });
}

async function hydrateAllCloudProjects(ownedDocs, sharedDocs){
  const docs = [...(ownedDocs||[]), ...(sharedDocs||[])];
  const seen = new Set();
  const hydrations=[];
  for(const doc of docs){
    if(seen.has(doc.id)) continue;
    seen.add(doc.id);
    const p = findProject(doc.id);
    if(!p) continue;
    const before = p.tasks.length;
    hydrations.push(hydrateProjectTasksFromCloud(p, doc.data()).then(hydrated=>{
      const current=findProject(doc.id);
      if(hydrated && current && (current.tasks.length !== before || current.schemaVersion !== DATA_SCHEMA_VERSION)){
        try{
      if(window.KarhaApp?.applyCloudSnapshot && Array.isArray(data?.projects)){
        data.projects.forEach(pr=>{ if(pr&&pr.id) window.KarhaApp.applyCloudSnapshot(pr); });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    }catch(e){}
        if(String(getActiveTab()) === String(doc.id) && ['dashboard','tasks'].includes(window.KarhaRoute?.moduleId)) renderAll();
        else refreshCurrentFooterPage();
      }
    }));
  }
  await Promise.allSettled(hydrations);
}

function startCloudListeners(){
  stopCloudListeners();
  const createHandler = window.KarhaApp?.createOwnedSnapshotHandler;
  const onSnap = typeof createHandler === 'function'
    ? createHandler({
        appDataStore: window.KarhaAppData,
        getCurrentUser: ()=>currentUser,
        docToProject,
        hydrateProjects: docs=>hydrateAllCloudProjects(docs, []),
        persistLocal: ()=>window.KarhaAppData.persistLocal(),
      })
    : docs=>{ mergeCloudSnapshots(docs, []); hydrateAllCloudProjects(docs, []); };
  const onErr = err => { console.error('owned listener', err); showToast('خطا در دریافت پروژه‌های خودتان'); };
  // Phase 6.4: ownership in src/sync/cloudListeners — behavior unchanged (owned-only).
  if(window.KarhaApp?.startOwnedCloudListeners){
    window.KarhaApp.startOwnedCloudListeners({
      db,
      uid: currentUser.uid,
      onOwnedSnapshot: onSnap,
      onError: onErr,
    });
    cloudUnsubOwned = null;
    return;
  }
  cloudUnsubOwned = db.collection('projects').where('ownerUid','==',currentUser.uid)
    .onSnapshot(snap => onSnap(snap.docs, []), onErr);
}

function stopCloudListeners(){
  if(window.KarhaApp?.stopOwnedCloudListeners){
    window.KarhaApp.stopOwnedCloudListeners();
  }
  if(cloudUnsubOwned) cloudUnsubOwned();
  cloudUnsubOwned = null;
  Object.keys(cloudTaskUnsubs).forEach(stopCloudTaskListener);
}

async function migrateGuestDataToCloud(){
  if(migratedGuestData) return;
  migratedGuestData = true;
  const guestProjects = (data && data.projects) ? data.projects.filter(p=>!p.ownerUid && !p.trashed) : [];
  for(const p of guestProjects){
    // همان شناسهٔ محلی را نگه می‌داریم تا پروژهٔ مهمان بعد از ورود دوباره ساخته/دوبرابر نشود.
    p.type = 'project';
    p.ownerUid = currentUser.uid;
    p.ownerEmail = normalizeEmail(currentUser.email);
    p.sharedWith = [];
    const ref = db.collection('projects').doc(p.id);
    // تا وقتی Snapshot سرور وجود پروژه را تأیید نکرده، آن را pending نگه می‌داریم
    // تا Snapshot خالیِ اولیه باعث ناپدید شدن پروژه از «مدیریت پروژه‌ها» نشود.
    window.KarhaAppData.markCloudWritePending(p.id);
    try{
      await ref.set({
        name: p.name, type:'project', completedOpen: !!p.completedOpen,
        ownerUid: currentUser.uid, ownerEmail: normalizeEmail(currentUser.email), sharedWith: [],
        contacts: p.contacts||[], activityTemplates: p.activityTemplates||[],
        trashed: !!p.trashed, archived: !!p.archived, schemaVersion:DATA_SCHEMA_VERSION
      }, {merge:true});
      await writeTaskRecordsNormalized(p.id, p.tasks);
    }catch(err){
      console.warn('guest project migration failed; local copy retained:', p.id, err);
      // pending را نگه می‌داریم تا Snapshot بعدی پروژه محلی را حذف نکند.
      // در ورود/اتصال بعدی migrateGuestDataToCloud دوباره تلاش خواهد کرد.
      continue;
    }
    window.KarhaAppData.clearCloudWritePending(p.id);
  }
  try{
      if(window.KarhaApp?.applyCloudSnapshot && Array.isArray(data?.projects)){
        data.projects.forEach(pr=>{ if(pr&&pr.id) window.KarhaApp.applyCloudSnapshot(pr); });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    }catch(e){}
}

function updateAccountUI(){
  const nameEl = document.getElementById('drawerAccountName');
  const subEl = document.getElementById('drawerAccountSub');
  const signBtn = document.getElementById('drawerSigninBtn');
  const headerImg = document.getElementById('avatarImg');
  const headerIcon = document.getElementById('avatarDefaultIcon');
  const drawerImg = document.getElementById('drawerAvatarImg');
  const drawerIcon = document.getElementById('drawerAvatarDefaultIcon');

  if(currentUser){
    nameEl.textContent = currentUser.displayName || 'کاربر گوگل';
    subEl.textContent = currentUser.email || '';
    signBtn.textContent = 'خروج از حساب';
    if(currentUser.photoURL){
      headerImg.src = currentUser.photoURL; headerImg.style.display='block'; headerIcon.style.display='none';
      drawerImg.src = currentUser.photoURL; drawerImg.style.display='block'; drawerIcon.style.display='none';
    }
  } else {
    nameEl.textContent = 'مهمان';
    subEl.textContent = 'وارد نشده‌اید';
    signBtn.textContent = 'ورود با گوگل';
    headerImg.style.display='none'; headerIcon.style.display='flex';
    drawerImg.style.display='none'; drawerIcon.style.display='flex';
  }
}

auth.onAuthStateChanged(async (user)=>{
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
    const active = data && getActiveTab() && getActiveTab() !== 'starred' /* legacy guard */
      ? (data.projects||[]).find(p => String(p.id)===String(getActiveTab()))
      : null;
    if(active && active.ownerUid){
      setActiveTab(null);
      try{ window.KarhaApp?.projectContext?.setProjectId?.(null); }catch(e){}
    }
    renderDrawerProjectList();
    renderAll();
  }
});

window.addEventListener('online', ()=>{
  if(cloudMode) flushProjectStatusQueue();
});


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

let lastCenteredTab = null;
let workspaceSubpage = null;

/* ---------- root menu pages history ----------
   صفحات منوی اصلی (ثبت مشخصات، مدیریت پروژه‌ها، حذف‌شده‌ها، آرشیوها)
   یک سطح مستقل روی هوم پروژه‌ها هستند. با Back گوشی/مرورگر همیشه به
   همان پروژه‌ای که قبل از ورود انتخاب شده بود برمی‌گردیم. */
let menuRootHistoryPushed = false;
let menuRootPage = null;
// صفحه‌های منوی کناری «صفحه مستقل» هستند و هرگز نباید با سطح هوم پروژه‌ها یکی تلقی شوند.
let menuRootMode = null;

function pushMenuRootHistory(kind){
  menuRootPage = kind;
  menuRootMode = kind;
  if(menuRootHistoryPushed) return;
  try{
    history.pushState({karhaMenuPage:kind}, '', location.href);
    menuRootHistoryPushed = true;
  }catch(e){}
}

function closeMenuRootPage(fromPopState=false){
  menuRootPage = null;
  menuRootMode = null;
  if(!fromPopState && menuRootHistoryPushed){
    menuRootHistoryPushed = false;
    try{ history.back(); }catch(e){}
  }else{
    menuRootHistoryPushed = false;
  }
  goHomeProjects();
}

/* ---------- project tab rendering ---------- */
function renderTabs(){
  const bar = document.getElementById('tabbar');
  if(!bar) return;
  bar.innerHTML = '';
  bar.setAttribute('aria-hidden','true');
  updateWorkspaceContextBar();
  renderDrawerProjectList();
}

/* ---------- project tab search ---------- */
(function setupProjectSearch(){
  const inp = document.getElementById('projectSearch');
  if(inp) inp.setAttribute('aria-hidden','true');
})();


function svgGrip(){
  return '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.2"/><circle cx="7.5" cy="2.5" r="1.2"/><circle cx="2.5" cy="7" r="1.2"/><circle cx="7.5" cy="7" r="1.2"/><circle cx="2.5" cy="11.5" r="1.2"/><circle cx="7.5" cy="11.5" r="1.2"/></svg>';
}

/* ---------- generic mini prompt dialog (replaces window.prompt) ---------- */
let miniPromptCallback = null;
let miniPromptMode = 'generic';

function updateCreateProjectPageUI(){
  const title = document.getElementById('createPageTitle');
  const label = document.getElementById('createNameLabel');
  const input = document.getElementById('createPageInput');
  const confirmBtn = document.getElementById('createPageConfirmBtn');
  if(title) title.textContent = 'ساخت پروژه جدید';
  if(label) label.textContent = 'نام پروژه جدید';
  if(input) input.placeholder = 'مثلاً «پروژه زیتون»';
  if(confirmBtn){
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
  }
}

/* Global form helpers. New forms should call these instead of inventing local behavior. */
function isFormEmptyValue(value){
  if(value==null) return true;
  if(typeof value==='string') return value.trim()==='';
  if(Array.isArray(value)) return value.length===0;
  return false;
}
function formHasAnyUserInput(root){
  if(!root) return false;
  const fields=root.querySelectorAll('input, textarea, select');
  for(const el of fields){
    if(el.type==='button' || el.type==='submit' || el.type==='hidden') continue;
    // Checked radio/checkbox controls that are merely the form's initial/default
    // selection must NOT make a brand-new untouched form look dirty. They count
    // only after the user has actually changed/touched them.
    if(el.type==='checkbox' || el.type==='radio'){
      if(el.checked && el.dataset.userTouched==='true') return true;
      continue;
    }
    if(!isFormEmptyValue(el.value)) return true;
  }
  // File/image pickers and dynamically selected chips count as input too.
  if(root.querySelector('.contact-selected-activity:not(:empty), .contact-image-card')) return true;
  return false;
}

// Mark choice controls only when the user actually interacts with them.
// This is global so every current and future form gets the same behavior.
document.addEventListener('change', e=>{
  const el=e.target;
  if(!el || (el.type!=='checkbox' && el.type!=='radio')) return;
  el.dataset.userTouched='true';
}, true);
function setInternalFormMode(active){
  document.body.classList.toggle('global-form-mode',!!active);
  const footer=document.querySelector('.bottom-nav');
  if(footer) footer.classList.toggle('global-form-footer-hidden',!!active);
}

/* Global exit guard for incomplete forms. Only two choices are shown. */
function showIncompleteFormExitChoice(opts={}){
  if(window.KarhaUI?.showIncompleteFormExitChoice) return window.KarhaUI.showIncompleteFormExitChoice(opts);
  // classic helper() may resolve window[name] first
  const {onYes,onNo,onStay}=opts;
  const existing=document.querySelector('.global-incomplete-exit-choice');
  if(existing) return;
  const ov=document.createElement('div');
  ov.className='contact-exit-choice global-incomplete-exit-choice';
  ov.innerHTML='<div class="contact-exit-card"><div class="contact-exit-title">اطلاعات کامل نشده است</div><div class="contact-exit-text">آیا اطلاعات فعلی به‌صورت پیش‌نویس ذخیره شود؟</div><div class="contact-exit-actions"><button type="button" class="mini-btn primary" data-exit="yes">بله</button><button type="button" class="mini-btn ghost" data-exit="no">خیر</button></div></div>';
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.querySelector('[data-exit="yes"]').onclick=()=>{close();if(onYes) onYes();};
  ov.querySelector('[data-exit="no"]').onclick=()=>{close();if(onNo) onNo();};
  ov.addEventListener('pointerdown',e=>{if(e.target===ov && onStay){close();onStay();}});
}
try{ window.showIncompleteFormExitChoice = showIncompleteFormExitChoice; }catch(e){}


function formRequiredComplete(root){
  if(!root) return false;
  const required=root.querySelectorAll('[data-required="true"]');
  for(const el of required){
    if(el.type==='checkbox' || el.type==='radio'){ if(el.checked) continue; return false; }
    if(!String(el.value||'').trim()) return false;
  }
  return true;
}

let createPageHistoryPushed = false;

function openCreatePage(){
  const input = document.getElementById('createPageInput');
  if(input) input.value = '';
  updateCreateProjectPageUI();
  document.getElementById('createPage').classList.remove('hidden');
  // ثبت یک وضعیت در History تا دکمه Back گوشی ابتدا از صفحه ساخت به هوم برگردد.
  if(!createPageHistoryPushed){
    try{ history.pushState({ createPage:true }, '', location.href); createPageHistoryPushed = true; }catch(e){}
  }
  setTimeout(()=>{ if(input) input.focus(); }, 80);
}

function closeCreatePage(fromPopState=false){
  document.getElementById('createPage').classList.add('hidden');
  if(createPageHistoryPushed){
    createPageHistoryPushed = false;
    if(!fromPopState){
      try{ history.back(); }catch(e){}
    }
  }
}

window.addEventListener('popstate', ()=>{
  if(createPageHistoryPushed){
    closeCreatePage(true);
  }
});

document.getElementById('closeCreatePage').onclick = closeCreatePage;
document.getElementById('createPageCancelBtn').onclick = closeCreatePage;
document.getElementById('createPageConfirmBtn').onclick = ()=>{
  const input = document.getElementById('createPageInput');
  const name = input ? input.value.trim() : '';
  if(!name){
    if(input) input.focus();
    return;
  }
  closeCreatePage();
  addProject(name);
};

document.getElementById('createPageInput').onkeydown = (e)=>{
  if(e.key==='Enter'){ e.preventDefault(); document.getElementById('createPageConfirmBtn').click(); }
};

/* ---------- generic mini prompt dialog (rename and other small prompts) ---------- */
function openMiniPrompt(title, placeholder, onConfirm, mode='generic', initialValue=''){
  miniPromptCallback = onConfirm;
  miniPromptMode = mode;
  document.getElementById('promptTitle').textContent = title;
  const input = document.getElementById('promptInput');
  input.value = initialValue || '';
  input.placeholder = placeholder || '';
  const confirmBtn=document.getElementById('promptConfirmBtn');
  const nextBtn=document.getElementById('promptConfirmNextBtn');
  if(confirmBtn){
    const isActivityNew = mode==='activity-new';
    confirmBtn.classList.toggle('hidden', isActivityNew);
    confirmBtn.setAttribute('aria-hidden', isActivityNew ? 'true' : 'false');
    confirmBtn.disabled = isActivityNew;
  }
  if(nextBtn){
    const isActivityNew = mode==='activity-new';
    nextBtn.classList.toggle('hidden', !isActivityNew);
    nextBtn.setAttribute('aria-hidden', isActivityNew ? 'false' : 'true');
  }
  document.getElementById('promptOverlay').classList.remove('hidden');
  setTimeout(()=> input.focus(), 0);
}
function closeMiniPrompt(){ document.getElementById('promptOverlay').classList.add('hidden'); }
document.getElementById('promptCancelBtn').onclick = closeMiniPrompt;
function submitMiniPrompt(keepOpen=false){
  const val = document.getElementById('promptInput').value;
  if(!String(val||'').trim()){ document.getElementById('promptInput').focus(); return; }
  if(miniPromptCallback) miniPromptCallback(val, keepOpen);
}
document.getElementById('promptConfirmBtn').onclick = ()=>{
  const keepOpen=miniPromptMode==='activity-new' ? false : false;
  const val=document.getElementById('promptInput').value;
  closeMiniPrompt();
  if(miniPromptCallback) miniPromptCallback(val, false);
};
document.getElementById('promptConfirmNextBtn').onclick = ()=>{
  const val=document.getElementById('promptInput').value;
  if(!String(val||'').trim()){ document.getElementById('promptInput').focus(); return; }
  if(miniPromptCallback) miniPromptCallback(val, true);
};
document.getElementById('promptInput').onkeydown = (e)=>{
  if(e.key==='Enter'){
    e.preventDefault();
    if(miniPromptMode==='activity-new') document.getElementById('promptConfirmNextBtn').click();
    else document.getElementById('promptConfirmBtn').click();
  }
};
document.getElementById('promptOverlay').onclick = (e)=>{
  if(e.target.id==='promptOverlay') closeMiniPrompt();
};

/* ---------- custom numpad (Phase 8.2: owned by src/ui/numpad.js via KarhaUI) ---------- */
function openNumpadGeneric(initial, onDone, opts){
  if(window.KarhaUI?.openNumpadGeneric) return window.KarhaUI.openNumpadGeneric(initial, onDone, opts);
}
function closeNumpad(fromPopState=false){
  if(window.KarhaUI?.closeNumpad) return window.KarhaUI.closeNumpad(fromPopState);
}
/* DOM binds + popstate installed by installUiPrimitives */

/* ---------- content ---------- */


/* ---------- main surface ownership ----------
   کارهای پروژه فقط متعلق به سطح «پروژه‌ها» هستند.
   در صفحات حسابداری/گزارش/تنظیمات/همکاران و زیرصفحه‌های آن‌ها
   اصلاً در DOM رندر نمی‌شوند؛ بنابراین هیچ نشت محتوایی از صفحه کارها
   به صفحات دیگر امکان‌پذیر نیست. */
function enterWorkspaceSurface(){
  return window.KarhaWorkspaceChrome?.enterWorkspaceSurface?.();
}

function enterProjectsSurface(){
  menuRootMode = null;
  menuRootPage = null;
  return window.KarhaWorkspaceChrome?.enterProjectsSurface?.();
}

function renderAll(){
  setBottomNavActive('Projects');
  renderTabs();
  setBottomNavActive(document.querySelector('.bottom-nav-item.active')?.id?.replace(/^bottom/,'').replace(/Btn$/,'') || 'Projects');
  renderModeToggle();
  const content = document.getElementById('content');
  content.innerHTML = '';
  if(getActiveTab() === 'starred'){
    // Global Starred removed: normalize to project home / empty workspace
    setActiveTab(null);
  }
  const p = findProject(getActiveTab());
  if(!p || p.archived || p.trashed){
    content.innerHTML = '<div class="workspace-no-project">برای ورود به Workspace، از منوی سه‌خطی بالای صفحه یک پروژه را انتخاب کنید. تب «پروژه‌ها» فقط محتوای کاری پروژه فعال را نمایش می‌دهد.</div>';
    return;
  }
  if(window.KarhaApp?.router?.navigate){
    replaceWorkspaceRoute(p.id,'dashboard');
    return;
  }
  replaceWorkspaceRoute(p.id,'dashboard');
  renderProjectView(content, p);
}

function refreshStarredPartial(){
  // Global Starred removed — no-op (workspace star still uses renderAll)
}

function renderModeToggle(){
  const btn = document.getElementById('modeToggle');
  const label = document.getElementById('modeToggleLabel');
  if(getViewMode() === 'cost'){ btn.classList.add('active'); label.textContent = 'نمایش ساده'; }
  else { btn.classList.remove('active'); label.textContent = 'نمایش هزینه'; }
}
document.getElementById('modeToggle').onclick = ()=>{
  setViewMode(getViewMode() === 'cost' ? 'simple' : 'cost');
  persist(); renderAll();
};


function syncWorkspacePageTop(){ return window.KarhaWorkspaceChrome?.syncWorkspacePageTop?.(); }
function updateWorkspaceContextBar(){ return window.KarhaWorkspaceChrome?.updateWorkspaceContextBar?.(); }
function setBottomNavActive(key){ return window.KarhaWorkspaceChrome?.setBottomNavActive?.(key); }
function showOnlyWorkspacePage(pageId){ return window.KarhaWorkspaceChrome?.showOnlyWorkspacePage?.(pageId); }
function closeBottomPages(){
  workspaceSubpage=null;
  return window.KarhaWorkspaceChrome?.closeBottomPages?.();
}

function handleWorkspaceContextBack(){
  if(workspaceSubpage === 'statusForm'){ closeStatusForm(); return; }
  if(workspaceSubpage === 'statusList'){ closeStatusList(); return; }
  if(workspaceSubpage === 'contractTemplates'){ closeContractTemplatesPage(); return; }
  if(workspaceSubpage === 'statusTest'){ closeStatusTestPage(); return; }
  if(workspaceSubpage === 'contractTemplateForm'){ requestCloseContractTemplateForm(); return; }
  if(typeof shouldSuppressWorkspaceBack==='function' && shouldSuppressWorkspaceBack()) return;
  if(workspaceSubpage === 'contractForm'){ requestCloseContractForm(); return; }
  if(workspaceSubpage === 'contracts'){ closeContractsPage(); return; }
  if(workspaceSubpage === 'archive'){ goHomeProjects(); return; }
  goHomeProjects();
}

function handleWorkspaceContextAction(){
  if(workspaceSubpage === 'statusList'){ openStatusForm(null); return; }
  if(workspaceSubpage === 'contracts'){ openContractForm(null); return; }
  if(workspaceSubpage === 'collab') showToast('اشتراک‌گذاری حذف شده است');
}

function ensureHomeSelection(){
  const active = findProject(getActiveTab());
  if(!getActiveTab() || getActiveTab() === 'starred' || !active || active.trashed || active.archived){
    setActiveTab(null);
  }
}

function leaveMenuRootForFooter(){
  // با کلیک مستقیم روی فوتر از صفحه منوی کناری خارج می‌شویم؛
  // رکورد history همان لحظه به یک وضعیت عادی تبدیل می‌شود تا Back دوباره به منوی قبلی برنگردد.
  if(menuRootMode || menuRootHistoryPushed){
    menuRootMode = null;
    menuRootPage = null;
    menuRootHistoryPushed = false;
    try{ history.replaceState({karhaFooter:true}, '', location.href); }catch(e){}
  }
}

function goHomeProjects(){
  closeBottomPages();
  ensureHomeSelection();
  menuRootMode = null;
  menuRootPage = null;
  setBottomNavActive('Projects');
  enterProjectsSurface();
}

function renderReportsWorkspace(){
  const module = window.KarhaApp?.modules?.get('reports');
  if(module?.render) module.render();
}

/* VERSION 232 — صورت‌وضعیت‌ها از منوی حسابداری حذف شدند.
   منطق و داده‌های داخلی فعلاً دست‌نخورده می‌مانند تا در صورت نیاز
   بعداً محل و مسیر جدیدشان را جداگانه طراحی کنیم. */
function renderAccountingWorkspace(){
  ensureHomeSelection();
  const body=document.getElementById('accountingPageBody');
  if(!body) return;
  body.innerHTML='';
}

// D6 compatibility view adapter. Route/module/surface selection is owned by
// AppRouter + projectRouteSurface; legacy only refreshes UI that has not yet
// been extracted from this file.
function applyRoutedSurface({moduleId='dashboard',surface=null}={}){
  menuRootMode = null;
  menuRootPage = null;
  workspaceSubpage = surface?.subpage || null;
  if(moduleId==='people') renderSettingsWorkspace();
  renderTabs();
  updateWorkspaceContextBar();
}


function createWorkspaceSearch(placeholder,onInput){
  const wrap=document.createElement('div'); wrap.className='workspace-search';
  const input=document.createElement('input'); input.type='search'; input.placeholder=placeholder||'جستجو…'; input.autocomplete='off'; input.setAttribute('aria-label',placeholder||'جستجو');
  input.addEventListener('input',()=>onInput(String(input.value||'').trim().toLocaleLowerCase('fa')));
  wrap.appendChild(input); return {wrap,input};
}
function workspaceTextMatch(text,q){ return !q || String(text||'').toLocaleLowerCase('fa').includes(q); }

function renderSettingsWorkspace(){
  const body=document.getElementById('settingsPageBody');
  if(!body) return;
  ensureHomeSelection();
  const p=findProject(getActiveTab());
  body.innerHTML='';
  if(!p){ body.innerHTML='<div class="mgmt-empty">برای نمایش تنظیمات، یک پروژه را انتخاب کنید.</div>'; return; }
  const wrap=document.createElement('div'); wrap.className='workspace-option-list';
  const contactRow=document.createElement('button'); contactRow.type='button'; contactRow.className='workspace-option';
  contactRow.innerHTML='<span class="workspace-option-main"><span class="workspace-option-title">مخاطبین</span></span><span class="workspace-option-arrow">›</span>';
  contactRow.onclick=()=>openContactsPage(); wrap.appendChild(contactRow);

  const activityRow=document.createElement('button'); activityRow.type='button'; activityRow.className='workspace-option';
  activityRow.innerHTML='<span class="workspace-option-main"><span class="workspace-option-title">فعالیت‌ها</span></span><span class="workspace-option-arrow">›</span>';
  activityRow.onclick=()=>openProjectActivitiesPage(); wrap.appendChild(activityRow);

  const contractRow=document.createElement('button'); contractRow.type='button'; contractRow.className='workspace-option';
  contractRow.innerHTML='<span class="workspace-option-main"><span class="workspace-option-title">قراردادها</span></span><span class="workspace-option-arrow">›</span>';
  contractRow.onclick=()=>openContractTemplatesPage(); wrap.appendChild(contractRow);

  const trashRow=document.createElement('button');
  trashRow.type='button'; trashRow.className='workspace-option';
  trashRow.innerHTML='<span class=\"workspace-option-main\"><span class=\"workspace-option-title\">حذف شده ها</span></span><span class=\"workspace-option-arrow\">›</span>';
  trashRow.onclick=()=>openProjectTrashPage();
  wrap.appendChild(trashRow);

  body.appendChild(wrap);
}



/* ---------- قراردادها: قالب قرارداد + قرارداد واقعی + صورت وضعیت تستی ---------- */
function getContractTemplates(project){
  return window.KarhaContractTemplates?.getContractTemplates(project) || [];
}
function getProjectContracts(project=getCurrentProject()){
  return project?.id
    ? (window.KarhaRealContracts?.getProjectContracts?.(project.id) || [])
    : [];
}
function findContractTemplate(id,p){
  return window.KarhaContractTemplates?.findContractTemplate(id,p) || null;
}
function findProjectContract(id, project=getCurrentProject()){
  return window.KarhaRealContracts?.findProjectContract?.(id,project) || null;
}
function makeContractItem(text=''){
  return window.KarhaContractTemplates?.makeContractItem(text) || {id:'ct_'+Date.now(),text:String(text||''),children:[]};
}
function getDefaultContractTemplateItems(){
  return window.KarhaContractTemplates?.getDefaultContractTemplateItems?.() || [];
}
function normalizeContractTemplate(t){
  return window.KarhaContractTemplates?.normalizeContractTemplate(t) || t;
}
function renumberContractItems(items){
  return window.KarhaContractTemplates?.renumberContractItems(items) || items;
}
function contractTemplateHasContent(t){
  return !!(t && Array.isArray(t.items) && t.items.some(x=>String(x.text||'').trim()));
}
let contractTemplateFormState=null, contractTemplateFormDirty=false, contractTemplateFormHistoryPushed=false, contractTemplateEditingId=null;
let contractDragHandlesVisible=true;
let contractTemplateInlineAddState=null;
let contractDragState=null;

function openContractTemplatesPage(){
  if(window.KarhaContractShell?.openContractTemplatesPage)
    return window.KarhaContractShell.openContractTemplatesPage();
  closeBottomPages(); enterWorkspaceSurface(); workspaceSubpage='contractTemplates';
  setBottomNavActive('Settings'); renderTabs(); showOnlyWorkspacePage('contractTemplatesPage'); updateWorkspaceContextBar();
  pushWorkspaceHistory('contractTemplates'); renderContractTemplatesPage();
}
function closeContractTemplatesPage(){
  if(window.KarhaContractShell?.closeContractTemplatesPage)
    return window.KarhaContractShell.closeContractTemplatesPage();
  workspaceSubpage=null; setBottomNavActive('Settings'); renderTabs(); showOnlyWorkspacePage('settingsPage'); updateWorkspaceContextBar(); renderSettingsWorkspace();
}

function makeContractTemplateDraft(existing=null){
  if(existing){
    const copy=JSON.parse(JSON.stringify(existing)); normalizeContractTemplate(copy); return copy;
  }
  return {id:uid(),activityId:'',title:'',items:getDefaultContractTemplateItems(),paymentItems:[],createdAt:Date.now(),updatedAt:Date.now(),trashed:false};
}
function contractItemDepthFromPath(path){ return path.length-1; }
function moveContractItem(items,fromIndex,toIndex){ if(fromIndex===toIndex) return; const [x]=items.splice(fromIndex,1); items.splice(toIndex,0,x); }
function startContractPointerDrag(e, arr, index, wrapperEl, render){
  if(window.KarhaContractItemDrag?.startContractPointerDrag)
    return window.KarhaContractItemDrag.startContractPointerDrag(e, arr, index, wrapperEl, render);
}
function attachContractDrag(handle, arr, index, render){
  if(window.KarhaContractItemDrag?.attachContractDrag)
    return window.KarhaContractItemDrag.attachContractDrag(handle, arr, index, render);
}

function makeContractTemplateDraftClean(existing){
  return window.KarhaContractTemplates?.makeContractTemplateDraftClean(existing) || existing;
}
function getContractTemplateDraftKey(){
  return window.KarhaContractTemplates?.getContractTemplateDraftKey?.() || 'contract-template-draft-none';
}
function openContractTemplateForm(id=null){
  const p=getCurrentProject(); if(!p)return;
  closeDrawer(); contractTemplateEditingId=id||null;
  workspaceSubpage='contractTemplateForm'; setInternalFormMode(true);
  showOnlyWorkspacePage('contractTemplateFormPage'); setBottomNavActive('Settings');
  renderTabs(); updateWorkspaceContextBar();
  if(!contractTemplateFormHistoryPushed){
    pushWorkspaceHistory('contractTemplateForm'); contractTemplateFormHistoryPushed=true;
  }
  const title=document.getElementById('contractTemplateFormTitle');
  if(title) title.textContent=id?'ویرایش قالب قرارداد':'قالب قرارداد جدید';
  window.KarhaContractTemplateForm?.open?.(id,p.id);
}
function closeContractTemplateForm(fromPopState=false){
  // خروج داخلی باید history مربوط به ورود به فرم را نیز مصرف کند.
  // اگر popstate قبلاً رخ داده باشد، history.back دوم نباید اجرا شود.
  const shouldGoBack = !fromPopState && contractTemplateFormHistoryPushed;

  setInternalFormMode(false);
  document.getElementById('contractTemplateFormPage')?.classList.add('hidden');

  contractTemplateFormHistoryPushed=false;
  contractTemplateFormState=null;
  contractTemplateEditingId=null;
  contractTemplateFormDirty=false;
  contractTemplateInlineAddState=null;

  workspaceSubpage='contractTemplates';
  showOnlyWorkspacePage('contractTemplatesPage');
  setBottomNavActive('Settings');
  renderTabs();
  updateWorkspaceContextBar();
  renderContractTemplatesPage();

  if(shouldGoBack){
    try{ history.back(); }catch(e){}
  }
}
function requestCloseContractTemplateForm(fromPopState=false){
  // فقط در صورت وجود تغییر ذخیره‌نشده، پیام خروج نمایش داده می‌شود.
  if(!contractTemplateFormDirty){
    closeContractTemplateForm(fromPopState);
    return;
  }
  showIncompleteFormExitChoice({
    onYes:()=>saveContractTemplateClean(true),
    onNo:()=>closeContractTemplateForm(fromPopState)
  });
}








function renderContractTemplateFormClean(...args){ return window.KarhaContractTemplateForm?.render?.(...args); }

function renderContractTemplateForm(){ return renderContractTemplateFormClean(); }
function saveContractTemplateClean(silent=false){
  const p=getCurrentProject();
  if(!p)return false;
  return window.KarhaContractTemplateForm?.save?.(p.id,silent) || false;
}
function openContractsPage(projectId=getCurrentProjectScopeId(),{updateRoute=true,pushHistory=true}={}){
  if(window.KarhaContractShell?.openContractsPage)
    return window.KarhaContractShell.openContractsPage(projectId,{updateRoute,pushHistory});
  return false;
}

function closeContractsPage(){
  if(window.KarhaContractShell?.closeContractsPage)
    return window.KarhaContractShell.closeContractsPage();
  const p=getCurrentProject(); workspaceSubpage=null; if(p)replaceWorkspaceRoute(p.id,'reports'); setBottomNavActive('Reports'); renderTabs(); showOnlyWorkspacePage('reportsPage'); updateWorkspaceContextBar(); renderReportsWorkspace();
}
function renderContractsPage(){
  const module=window.KarhaApp?.modules?.get('contracts');
  if(module?.render) module.render(getCurrentProject()?.id);
}

// Compatibility shell only: form state, rendering and persistence live in the
// modular real-contract form module.
/* Phase 8.6: contract form business logic lives in src/modules/contracts/*; legacy owns page shell visibility only. */
function openRealContractFormShell(projectId){
  if(window.KarhaContractShell?.openRealContractFormShell)
    return window.KarhaContractShell.openRealContractFormShell(projectId);
  return false;
}
function closeRealContractFormShell(){
  if(window.KarhaContractShell?.closeRealContractFormShell)
    return window.KarhaContractShell.closeRealContractFormShell();
}
function openContractForm(id=null){
  const p=getCurrentProject(); if(!p)return false;
  return window.KarhaRealContractForm?.open?.(id,p.id) || false;
}
function closeContractForm(fromPopState=false){
  return window.KarhaRealContractForm?.close?.(fromPopState) || false;
}
function requestCloseContractForm(fromPopState=false){
  return window.KarhaRealContractForm?.requestClose?.(fromPopState) || false;
}

let searchTemplateState = null;
let searchTemplateHistoryPushed = false;
/** لایهٔ جدا برای حالت جستجوی داخل تمپلیت (کیبورد/فوکس) */
let searchTemplateSearchModePushed = false;
/** وقتی فقط تمپلیت جستجو / نامبرپد / تقویم بسته می‌شود، بک فرم قرارداد / ورک‌اسپیس یک‌بار نادیده گرفته شود.
 *  One-shot: valid only for the current popstate dispatch (cleared end-of-task).
 *  Must NOT be time-window based — that blocked empty-form Back after Stay/exit. */
let suppressWorkspaceBackOnce = false;
function markSuppressWorkspaceBack(){
  suppressWorkspaceBackOnce = true;
  try{ window.__karhaSuppressWorkspaceBackOnce = true; }catch(e){}
}
function shouldSuppressWorkspaceBack(){
  if(typeof window!=='undefined' && window.__karhaSuppressWorkspaceBackOnce){
    window.__karhaSuppressWorkspaceBackOnce=false;
    suppressWorkspaceBackOnce=true;
  }
  if(typeof isSearchTemplateOpen==='function' && isSearchTemplateOpen()) return true;
  if(typeof window!=='undefined' && window.KarhaSearchTemplate?.isOpen?.()) return true;
  const numpad=document.getElementById('numpadOverlay');
  if(numpad && !numpad.classList.contains('hidden')) return true;
  const jalali=document.getElementById('jalaliPop');
  if(jalali && !jalali.classList.contains('hidden')) return true;
  if(suppressWorkspaceBackOnce){
    // Clear after this turn so a later user Back is never swallowed.
    suppressWorkspaceBackOnce=false;
    try{ window.__karhaSuppressWorkspaceBackOnce=false; }catch(e){}
    return true;
  }
  return false;
}

window.KarhaSearchTemplateHooks = Object.assign({}, window.KarhaSearchTemplateHooks || {}, {
  suppressBack(){ markSuppressWorkspaceBack(); }
});

function stplGetInitials(name){
  const t=String(name||'').trim();
  if(!t) return '؟';
  const parts=t.split(/\s+/).filter(Boolean);
  if(parts.length>=2) return (parts[0][0]+parts[1][0]).slice(0,2);
  return t.slice(0,2);
}
function stplAvatarClass(name){
  let h=0; const s=String(name||'');
  for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0;
  return 'c'+(h%6);
}
function stplFirstLetter(name){
  const t=String(name||'').trim();
  if(!t) return '#';
  return t[0];
}
function stplStarSvg(on){
  if(on) return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.3l-6.2 3.7 1.7-7.1L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7.1z"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 17.3l-6.2 3.7 1.7-7.1L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7.1z"/></svg>';
}

/** ستاره وابسته به زمینه (پیمانکار / کارفرما / …) — نه سراسری روی مخاطب */
function getSearchTemplateStarMap(contextKey){
  const p=getCurrentProject();
  if(!p) return {};
  if(!p.searchTemplateStars || typeof p.searchTemplateStars!=='object') p.searchTemplateStars={};
  if(!p.searchTemplateStars[contextKey] || typeof p.searchTemplateStars[contextKey]!=='object'){
    p.searchTemplateStars[contextKey]={};
  }
  return p.searchTemplateStars[contextKey];
}
function isSearchTemplateStarred(contextKey, id){
  const map=getSearchTemplateStarMap(contextKey);
  return !!map[String(id)];
}
function setSearchTemplateStarred(contextKey, id, on){
  const p=getCurrentProject();
  if(!p) return;
  const map=getSearchTemplateStarMap(contextKey);
  const k=String(id);
  if(on) map[k]=true; else delete map[k];
  markDirty(p.id); persist();
}

function isSearchTemplateOpen(){
  const page=document.getElementById('searchTemplatePage');
  return !!(page && !page.classList.contains('hidden'));
}
function isSearchTemplateSearchMode(){
  const top=document.getElementById('searchTemplateTopbar');
  return !!(top && top.classList.contains('search-mode'));
}
function exitSearchTemplateSearchMode(){
  const top=document.getElementById('searchTemplateTopbar');
  const inp=document.getElementById('searchTemplateInput');
  if(top) top.classList.remove('search-mode');
  if(inp){
    inp.value='';
    try{ inp.blur(); }catch(e){}
  }
  if(searchTemplateState){
    searchTemplateState.query='';
    renderSearchTemplateBody();
  }
}
function enterSearchTemplateSearchMode(){
  const top=document.getElementById('searchTemplateTopbar');
  const inp=document.getElementById('searchTemplateInput');
  if(!top) return;
  top.classList.add('search-mode');
  // لایه history جدا تا بک اول فقط از حالت جستجو خارج شود و از اپ خارج نشود
  if(!searchTemplateSearchModePushed){
    try{
      history.pushState({karhaSearchTemplateSearch:true}, '', location.href);
      searchTemplateSearchModePushed=true;
    }catch(e){}
  }
  setTimeout(()=>{ try{ if(inp){ inp.focus(); } }catch(e){} }, 30);
}
function closeSearchTemplate(fromPop){
  const page=document.getElementById('searchTemplatePage');
  if(page){ page.classList.add('hidden'); page.setAttribute('aria-hidden','true'); }
  searchTemplateState=null;
  const top=document.getElementById('searchTemplateTopbar');
  if(top) top.classList.remove('search-mode');
  const inp=document.getElementById('searchTemplateInput');
  if(inp){ inp.value=''; try{ inp.blur(); }catch(e){} }
  // اگر حالت جستجو history دارد و خودمان می‌بندیم، آن را هم جمع کن
  const needBack = !fromPop && (searchTemplateHistoryPushed || searchTemplateSearchModePushed);
  const steps = (!fromPop ? ((searchTemplateHistoryPushed?1:0)+(searchTemplateSearchModePushed?1:0)) : 0);
  searchTemplateHistoryPushed=false;
  searchTemplateSearchModePushed=false;
  if(steps>0){
    markSuppressWorkspaceBack();
    try{
      if(steps===1) history.back();
      else history.go(-steps);
    }catch(e){ suppressWorkspaceBackOnce=false; }
  }
}
/** قانون تمپلیت جستجو:
 * بک اول (اگر جستجو فعال است) = فقط خروج از حالت جستجو
 * بک بعدی = بستن تمپلیت و ماندن روی فرم زیرین
 */
function handleSearchTemplateBack(){
  if(!isSearchTemplateOpen()) return false;
  if(isSearchTemplateSearchMode()){
    exitSearchTemplateSearchMode();
    if(searchTemplateSearchModePushed){
      searchTemplateSearchModePushed=false;
      markSuppressWorkspaceBack();
      try{ history.back(); }catch(e){ suppressWorkspaceBackOnce=false; }
    }
    return true;
  }
  closeSearchTemplate(false);
  return true;
}

/**
 * opts: {
 *   title, listTitle, selectedTitle?,
 *   contextKey: 'contractor'|'employer'|...,
 *   items:[{id,name}],
 *   onSelect, onAdd, showStar, showAdd
 * }
 */
function openSearchTemplate(opts){
  const page=document.getElementById('searchTemplatePage');
  if(!page) return;
  const contextKey=String(opts.contextKey||opts.listTitle||'default');
  const starMap=getSearchTemplateStarMap(contextKey);
  const items=(Array.isArray(opts.items)?opts.items:[]).map(it=>({
    id:it.id,
    name:it.name,
    starred:!!starMap[String(it.id)],
    _raw:it
  }));
  searchTemplateState={
    title: opts.title||'انتخاب',
    listTitle: opts.listTitle||'موارد',
    selectedTitle: opts.selectedTitle || ((opts.listTitle||'موارد')+' منتخب'),
    contextKey,
    items,
    onSelect: typeof opts.onSelect==='function'?opts.onSelect:null,
    onAdd: typeof opts.onAdd==='function'?opts.onAdd:null,
    showStar: opts.showStar!==false,
    showAdd: opts.showAdd!==false && typeof opts.onAdd==='function',
    query:''
  };
  const titleEl=document.getElementById('searchTemplateTitle');
  if(titleEl) titleEl.textContent=searchTemplateState.title;
  const fab=document.getElementById('searchTemplateFab');
  if(fab) fab.style.display=searchTemplateState.showAdd?'flex':'none';
  const top=document.getElementById('searchTemplateTopbar');
  if(top) top.classList.remove('search-mode');
  const inp=document.getElementById('searchTemplateInput');
  if(inp) inp.value='';
  page.classList.remove('hidden');
  page.setAttribute('aria-hidden','false');
  renderSearchTemplateBody();
  // تاریخچه برای بک گوشی/مرورگر
  searchTemplateSearchModePushed=false;
  if(!searchTemplateHistoryPushed){
    try{
      history.pushState({karhaSearchTemplate:true}, '', location.href);
      searchTemplateHistoryPushed=true;
    }catch(e){}
  }
}

function renderSearchTemplateBody(){
  const body=document.getElementById('searchTemplateBody');
  if(!body||!searchTemplateState) return;
  body.innerHTML='';
  const q=String(searchTemplateState.query||'').trim().toLocaleLowerCase('fa');
  let items=searchTemplateState.items.filter(it=>{
    if(!q) return true;
    return String(it.name||'').toLocaleLowerCase('fa').includes(q);
  });

  if(!items.length){
    body.innerHTML='<div class="stpl-empty">موردی یافت نشد.</div>';
    return;
  }

  const starred=items.filter(it=>!!it.starred);
  const rest=items.filter(it=>!it.starred);

  const appendSection=(label, list, isSelected)=>{
    if(!list.length) return;
    const lab=document.createElement('div');
    lab.className='stpl-section-label'+(isSelected?' stpl-selected-label':'');
    lab.textContent=label;
    body.appendChild(lab);
    if(isSelected){
      list.forEach(it=>body.appendChild(makeSearchTemplateRow(it)));
      return;
    }
    const groups={};
    list.forEach(it=>{
      const L=stplFirstLetter(it.name);
      if(!groups[L]) groups[L]=[];
      groups[L].push(it);
    });
    Object.keys(groups).sort((a,b)=>a.localeCompare(b,'fa')).forEach(L=>{
      const letter=document.createElement('div');
      letter.className='stpl-letter';
      letter.textContent=L;
      body.appendChild(letter);
      groups[L].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fa'));
      groups[L].forEach(it=>body.appendChild(makeSearchTemplateRow(it)));
    });
  };

  if(starred.length) appendSection(searchTemplateState.selectedTitle, starred, true);
  appendSection(searchTemplateState.listTitle, rest, false);
}

function makeSearchTemplateRow(item){
  const row=document.createElement('div');
  row.className='stpl-row';
  row.dataset.id=String(item.id||'');

  const av=document.createElement('div');
  av.className='stpl-avatar '+stplAvatarClass(item.name);
  av.textContent=stplGetInitials(item.name);

  const name=document.createElement('div');
  name.className='stpl-name';
  name.textContent=item.name||'—';
  row.append(av, name);

  if(searchTemplateState.showStar){
    const star=document.createElement('button');
    star.type='button';
    star.className='stpl-star'+(item.starred?' on':'');
    star.innerHTML=stplStarSvg(!!item.starred);
    star.onclick=(e)=>{
      e.preventDefault(); e.stopPropagation();
      item.starred=!item.starred;
      const ref=searchTemplateState.items.find(x=>String(x.id)===String(item.id));
      if(ref) ref.starred=item.starred;
      setSearchTemplateStarred(searchTemplateState.contextKey, item.id, item.starred);
      renderSearchTemplateBody();
    };
    row.appendChild(star);
  }

  row.onclick=()=>{
    const handler=searchTemplateState && searchTemplateState.onSelect;
    // اول تمپلیت را ببند (با سرکوب بک فرم)، بعد انتخاب را اعمال کن تا روی فرم بمانیم
    closeSearchTemplate(false);
    if(handler){
      try{ handler(item); }catch(err){}
    }
  };
  return row;
}

function initSearchTemplateUI(){
  const back=document.getElementById('searchTemplateBack');
  const searchBtn=document.getElementById('searchTemplateSearchBtn');
  const inp=document.getElementById('searchTemplateInput');
  const fab=document.getElementById('searchTemplateFab');
  const top=document.getElementById('searchTemplateTopbar');
  if(back) back.onclick=()=>{ handleSearchTemplateBack(); };
  if(searchBtn) searchBtn.onclick=()=>{ enterSearchTemplateSearchMode(); };
  if(inp){
    inp.oninput=()=>{
      if(!searchTemplateState) return;
      searchTemplateState.query=inp.value||'';
      renderSearchTemplateBody();
    };
  }
  if(fab) fab.onclick=()=>{
    if(searchTemplateState && searchTemplateState.onAdd){
      try{ searchTemplateState.onAdd(); }catch(e){}
    }
  };
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initSearchTemplateUI);
else setTimeout(initSearchTemplateUI,0);

// قانون دائمی تمپلیت جستجو — بک گوشی/مرورگر:
// ۱) حالت جستجو فعال → فقط خروج از جستجو؛ در تمپلیت بمان
// ۲) وگرنه → فقط تمپلیت بسته شود و به فرم زیرین برگرد (فرم قرارداد بسته نشود)
window.addEventListener('popstate', function(ev){
  // فقط وقتی تمپلیت واقعاً باز است
  if(!isSearchTemplateOpen()) return;

  // لایه ۱: حالت جستجو (اگر با push جدا باز شده)
  if(isSearchTemplateSearchMode() || searchTemplateSearchModePushed){
    exitSearchTemplateSearchMode();
    searchTemplateSearchModePushed=false;
    // Browser consumed search-mode entry; template stays open. No suppress token.
    return;
  }

  // لایه ۲: خود تمپلیت — browser consumed template entry. No suppress (workspace
  // already skipped while template was visible).
  searchTemplateHistoryPushed=false;
  searchTemplateSearchModePushed=false;
  closeSearchTemplate(true);
});

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
function activityName(id){ const a=findActivityTemplate(id); return a ? (a.trashed ? 'فعالیت حذف‌شده' : a.name) : 'فعالیت حذف‌شده'; }
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

function renderItemActivities(item,pid,body){
  const field=document.createElement('div'); field.className='detail-field';
  field.innerHTML='<div class="detail-label">فعالیت‌ها (اختیاری)</div>';
  const list=document.createElement('div'); list.className='detail-activities-list';
  const render=()=>{
    list.innerHTML='';
    const ids=Array.isArray(item.activities)?item.activities:[];
    ids.forEach(id=>{
      const chip=document.createElement('div'); chip.className='detail-activity-chip';
      const span=document.createElement('span'); span.textContent=activityName(id);
      const rm=document.createElement('button'); rm.type='button'; rm.textContent='حذف';
      rm.onclick=()=>{ item.activities=(item.activities||[]).filter(x=>x!==id); markDirty(pid); persist(); render(); };
      chip.append(span,rm); list.appendChild(chip);
    });
    if(!ids.length){ const empty=document.createElement('div'); empty.style.cssText='font-size:12px;color:var(--text-dim);'; empty.textContent='برای این آیتم فعالیتی انتخاب نشده است.'; list.appendChild(empty); }
  };
  render(); field.appendChild(list);

  const picker=document.createElement('div'); picker.className='activity-picker';
  const input=document.createElement('input'); input.type='search'; input.className='activity-search-input'; input.placeholder='جستجوی فعالیت...'; input.autocomplete='off';
  const results=document.createElement('div'); results.className='activity-search-results';
  picker.append(input,results); field.appendChild(picker);

  const getAvailable=()=>getActivityTemplates().filter(a=>!(item.activities||[]).includes(a.id));
  const choose=(a)=>{
    item.activities=Array.isArray(item.activities)?item.activities:[];
    if(!item.activities.includes(a.id)){
      item.activities.push(a.id);
      markDirty(pid);
      persist();
      render();
      input.value='';
      renderResults(true);
      setTimeout(()=>input.focus(),0);
    }
  };
  const renderResults=(open=true)=>{
    const q=input.value.trim().toLocaleLowerCase('fa');
    const available=getAvailable().filter(a=>String(a.name||'').toLocaleLowerCase('fa').includes(q));
    results.innerHTML='';
    if(!available.length){ const e=document.createElement('div'); e.className='activity-search-empty'; e.textContent=q?'فعالیتی پیدا نشد.':'فعالیت جدیدی برای انتخاب وجود ندارد.'; results.appendChild(e); }
    else available.forEach(a=>{ const b=document.createElement('button'); b.type='button'; b.className='activity-search-option'; b.textContent=a.name; b.onclick=()=>{ choose(a); results.classList.remove('open'); input.value=''; }; results.appendChild(b); });
    results.classList.toggle('open',open);
  };
  input.addEventListener('focus',()=>renderResults(true));
  input.addEventListener('input',()=>renderResults(true));
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ results.classList.remove('open'); input.blur(); }
    if(e.key==='Enter'){ const first=results.querySelector('.activity-search-option'); if(first){ e.preventDefault(); first.click(); } }
  });
  document.addEventListener('click',function activityPickerOutside(e){
    if(!picker.contains(e.target)) results.classList.remove('open');
  },{once:false});
  body.appendChild(field);
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
  openConfirm, showToast, renderAll, refreshStarredPartial, softDelete, renderItemActivities,
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

  // Remove the project and all project-scoped normalized records from Firebase.
  // Firestore does NOT delete subcollections when their parent document is deleted,
  // so the child records must be removed explicitly.
  if(cloudMode && currentUser && p.ownerUid){
    try{
      const refs=[];
      const collections=[
        taskCollection(p.id),
        purchaseCollection(p.id),
        estimateCollection(p.id),
        taskReportCollection(p.id)
      ];
      for(const col of collections){
        const snap=await col.get();
        snap.docs.forEach(d=>refs.push(d.ref));
      }

      // Firestore batches are limited to 500 operations.
      for(let i=0;i<refs.length;i+=450){
        const batch=db.batch();
        refs.slice(i,i+450).forEach(ref=>batch.delete(ref));
        await batch.commit();
      }
      await db.collection('projects').doc(p.id).delete();
    }catch(e){
      console.warn('permanent project delete failed',e);
      showToast('حذف همیشگی پروژه روی سرور انجام نشد');
      return false;
    }
  }

  stopCloudTaskListener(p.id);
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
document.getElementById('closeContactsPage').onclick = ()=>{ document.getElementById('contactsPage')?.classList.remove('contact-form-mode'); const h=document.querySelector('#contactsPage .inner-section-bar h2'); if(h) h.textContent='مخاطبین'; const b=document.getElementById('contactAddBtn'); if(b) b.hidden=false; returnToSettingsWorkspace(); };
document.getElementById('contactAddBtn').onclick = ()=>window.KarhaApp?.modules?.get('people')?.openContactForm();
document.getElementById('activityAddBtn').onclick = openActivityForm;

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

/* ---------- init ---------- */
// Install the complete, deliberate module/legacy boundary before the first
// render. Dashboard and routed module mounts may call it during startup.
installLegacyCompatibilityBoundary();
loadData();
window.KarhaApp?.taskRuntime?.configure({
  uid,
  afterMutation(projectId){
    const project=findProject(projectId);
    const stored=window.KarhaApp?.projectRepository?.find(projectId);
    if(project && stored) project.tasks=Array.isArray(stored.tasks)?stored.tasks:[];
    if(project) markDirty(projectId);
    persist({ local:false });
  }
});
const routedProjectId = getProjectIdFromRoute();
if(routedProjectId && findProject(routedProjectId)){
  // Router.start() restores this exact project/module after Legacy loads.
}else if(getActiveTab() && getActiveTab() !== 'starred' && findProject(getActiveTab())){
  window.KarhaApp?.projectWorkspace?.selectProject?.(getActiveTab(),{moduleId:'dashboard',replace:true});
}else{
  setActiveTab(null);
}

// قراردادها: صفحه قالب‌ها و فرم مستقل قالب قرارداد
(function(){
  const add=document.getElementById('contractTemplateAddBtn'); if(add) add.onclick=()=>openContractTemplateForm(null);
  const back=document.getElementById('closeContractTemplateFormPage'); if(back) back.onclick=()=>requestCloseContractTemplateForm(false);
})();

// Modular architecture bridge: keeps the remaining legacy runtime project-scoped
// while individual modules are migrated out of this file.

function installLegacyCompatibilityBoundary(){
var __formRTs = window.KarhaApp?.registerFormRuntimes?.({
  uid: uid,
  getCurrentProjectId: getCurrentProjectScopeId,
  showToast: showToast,
  enterActivityForm: function(){ setInternalFormMode(true); workspaceSubpage='activityForm'; showOnlyWorkspacePage('activityFormPage'); setBottomNavActive('Settings'); renderTabs(); updateWorkspaceContextBar(); },
  leaveActivityForm: function(){ setInternalFormMode(false); document.getElementById('activityFormPage')?.classList.add('hidden'); workspaceSubpage='activities'; showOnlyWorkspacePage('projectActivitiesPage'); renderProjectActivitiesPage(); updateWorkspaceContextBar(); },
  pushWorkspaceHistory: pushWorkspaceHistory,
  findProject: findProject,
  markDirty: markDirty,
  persist: persist,
  getCurrentProject: getCurrentProject,
  getActivityTemplates: getActivityTemplates,
  openNumpadGeneric: openNumpadGeneric,
  setInternalFormMode: setInternalFormMode,
  showIncompleteFormExitChoice: showIncompleteFormExitChoice,
  closeContactsToSettings: function(){ workspaceSubpage=null; renderSettingsWorkspace(); showOnlyWorkspacePage('settingsPage'); },
}) || {};
window.KarhaLegacy = Object.freeze({

  getViewMode(){ return getViewMode(); },
  renderAll,
  elFromHtml(html){
    const template=document.createElement('template');
    template.innerHTML=String(html||'').trim();
    return template.content.firstElementChild;
  },
  formatCost,
  projectCostSum,
  isPendingDeleted,
  markDirty,
  persist,
  openConfirm,
  showToast,
  svgChevron,
  renderInlineAddRow,
  renderTaskBlock,
  setActiveProject(projectId){
    return setActiveProject(projectId,{updateRoute:false,render:false});
  },
  selectProject(projectId, { moduleId = 'dashboard' } = {}){
    return window.KarhaApp?.projectWorkspace?.selectProject?.(projectId,{moduleId}) || false;
  },
  applyRoutedSurface,
  getWorkspaceChromeState(){
    const project=getCurrentProject();
    return { menuRootMode, workspaceSubpage, project: project ? { id:project.id, name:project.name } : null };
  },
  navigateFooter,
  renderDrawerProjectList,
  clearWorkspaceSubpage(){ workspaceSubpage=null; },
  clearMenuRoot(){ menuRootMode=null; menuRootPage=null; },
  handleWorkspaceContextBack,
  handleWorkspaceContextAction,
  getProjectsList(){
    return projectsVisibleForAuth(Array.isArray(data?.projects) ? data.projects : []);
  },
  getProject(projectId){
    return typeof findProject === 'function' ? findProject(projectId) : null;
  },
  getActiveProjectId(){
    return typeof getCurrentProjectScopeId === 'function' ? getCurrentProjectScopeId() : null;
  },
  getActiveProject(){
    return typeof getCurrentProject === 'function' ? getCurrentProject() : null;
  },
  projectItemRuntime: Object.freeze({
    persistItems(projectId){
      const project=findProject(projectId);
      const stored=window.KarhaApp?.projectRepository?.find(projectId);
      if(project && stored) project.tasks=Array.isArray(stored.tasks)?stored.tasks:[];
      if(project) markDirty(project.id);
      persist({ local:false });
    }
  }),
  openContractsPage,
  closeContractsPage,
  openContractForm,
  openRealContractFormShell,
  closeRealContractFormShell,
  closeSearchTemplate,
  escapeHtml(str){
    if(window.KarhaHtmlEscape && typeof window.KarhaHtmlEscape.escapeHtml === 'function')
      return window.KarhaHtmlEscape.escapeHtml(str);
    return String(str ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  },
  findActivityTemplate,
  formatJalaliDisplay(str){
    if(window.KarhaUI && typeof window.KarhaUI.formatJalaliDisplay === 'function')
      return window.KarhaUI.formatJalaliDisplay(str);
    if(!str) return '';
    return String(str);
  },
  getContacts,
  openNumpadGeneric,
  suppressWorkspaceBack(){ markSuppressWorkspaceBack(); },
  canDeleteProjectRecord,
  showRecordDeleteBlocked,
  findProjectRecordReferences,
  showIncompleteFormExitChoice,
  pushWorkspaceHistory,
  requestAnimationFrame(callback){ return window.requestAnimationFrame(callback); },
  svgGrip,
  svgPlus,
  toEnglishDigits,
  toPersianDigits,
  todayJalaliStr(){
    if(window.KarhaUI && typeof window.KarhaUI.todayJalaliStr === 'function')
      return window.KarhaUI.todayJalaliStr();
    return '';
  },
  renumberContractItems,
  goHomeProjects,
  renderAccountingWorkspace,
  openActivityForm,
  openActivityEditForm,
  requestCloseActivityForm,
  activityFormRuntime: __formRTs.activityFormRuntime || null,
  contactFormRuntime: __formRTs.contactFormRuntime || null
});
}
