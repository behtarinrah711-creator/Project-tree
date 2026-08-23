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
let saveTimer = null;

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
  const target = (data.projects||[]).find(p=>p.id===data.activeTab && !p.trashed && !p.archived)
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
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      data = JSON.parse(raw);
      if(!data.starredOrder) data.starredOrder = [];
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
      return;
    }
  }catch(e){}
  data = { schemaVersion:DATA_SCHEMA_VERSION, projects:[], viewMode:'simple', activeTab:'starred', starredOrder:[] };
  persist();
}

let dirtyProjectIds = new Set();
function markDirty(pid){ if(pid) dirtyProjectIds.add(pid); }
let pendingCloudWrites = new Set();

function persist(options){
  const writeLocal = !options || options.local !== false;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    if(writeLocal){
      (data.projects||[]).forEach(rememberProjectTasks);
      try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
      catch(e){ showToast('ذخیره‌سازی با خطا مواجه شد'); }
    }
    if(cloudMode && currentUser){
      dirtyProjectIds.forEach(pid => {
        const p = findProject(pid);
        if(p) cloudSyncProjectFull(p);
      });
    }
    dirtyProjectIds.clear();
  }, 120);
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
  if(data.activeTab === 'starred') refreshStarredPartial(); else renderAll();
}
function toggleSubDone(pid, tid, sid){
  const s = findSub(pid, tid, sid); if(!s) return;
  const changed=window.KarhaApp?.taskRuntime?.toggleCompleted(pid,tid,sid);
  if(changed && !changed.done){ removeFromStarredOrder(pid, tid); } else {
    const p = findProject(pid); if(p) p.completedOpen = true;
    if(data.activeTab === 'starred') starredCompletedOpen = true;
  }
  if(data.activeTab === 'starred') refreshStarredPartial(); else renderAll();
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
    pendingCloudWrites.add(p.id);
    ref.set({ name:p.name, type:'project', completedOpen:false, ownerUid:currentUser.uid, ownerEmail:p.ownerEmail, sharedWith:[], contacts:p.contacts||[], activityTemplates:p.activityTemplates||[], contractTemplates:p.contractTemplates||[], contracts:p.contracts||[], contractStatusReports:p.contractStatusReports||[], schemaVersion:DATA_SCHEMA_VERSION })
      .then(()=>writeTaskRecordsNormalized(p.id, p.tasks))
      .then(()=>pendingCloudWrites.delete(p.id))
      .catch(err=>{
        pendingCloudWrites.delete(p.id);
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
  if(window.KarhaApp?.router?.navigate){
    window.KarhaApp.router.navigate(projectId,moduleId);
    return;
  }
  const next = '#/projects/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(moduleId || 'dashboard');
  if(location.hash !== next){
    try{ history.pushState({projectId, moduleId}, '', next); }catch(e){ location.hash = next; }
  }
  if(window.KarhaApp?.projectContext) window.KarhaApp.projectContext.setProjectId(projectId);
}
function replaceWorkspaceRoute(projectId, moduleId='dashboard'){
  if(!projectId) return;
  if(window.KarhaApp?.router?.navigate){
    window.KarhaApp.router.navigate(projectId,moduleId,{replace:true});
    return;
  }
  const next = '#/projects/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(moduleId || 'dashboard');
  if(location.hash !== next){
    try{ history.replaceState({projectId, moduleId}, '', next); }catch(e){ location.hash = next; }
  }
  if(window.KarhaApp?.projectContext) window.KarhaApp.projectContext.setProjectId(projectId);
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
  data.activeTab=p.id;
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
  if(updateRoute) setWorkspaceRoute(p.id,moduleId);
  else if(window.KarhaApp?.projectContext) window.KarhaApp.projectContext.setProjectId(p.id);
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
    activeProjectId:data.activeTab,
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
      setActiveProject(projectId,{updateRoute:true,render:true,moduleId:'dashboard',closeDrawerOnSelect:true});
    }
  });
}
function openGlobalTrashFromDrawer(){
  closeDrawer();
  managementProjectTab='deleted';
  openProjectsPage();
  managementProjectTab='deleted';
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
      dirtyProjectIds,
      pendingCloudWrites,
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
    rememberProjectTasks, dirtyProjectIds, pendingCloudWrites,
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
      if(String(data.activeTab) === String(projectId) && mainSurface === 'projects') renderAll();
      else if(mainSurface === 'workspace') refreshCurrentFooterPage();
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
        pendingCloudWrites.add(projectId);
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
          pendingCloudWrites.delete(projectId);
        }
      }
      startCloudTaskListener(current);
      return true;
    }

    // پروژه واقعاً بدون دستورکار است.
    if(Number(projectDocData && projectDocData.schemaVersion || 1) < DATA_SCHEMA_VERSION){
      pendingCloudWrites.add(projectId);
      try{
        await db.collection('projects').doc(projectId).update({
          tasks: firebase.firestore.FieldValue.delete(),
          schemaVersion: DATA_SCHEMA_VERSION
        });
      } finally { pendingCloudWrites.delete(projectId); }
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


// ---------- پایگاه همگام‌سازی وضعیت پروژه ----------
// آرشیو/حذف/بازگردانی فقط باید یک write کوچک روی سند پروژه باشد.
// این عملیات نباید به خواندن یا نوشتن دستورکارها وابسته شود.
// در صورت قطع شبکه، write در صف محلی می‌ماند و بعداً دوباره ارسال می‌شود.
// در صورت permission-denied، retry بی‌نهایت انجام نمی‌دهیم چون مشکل قانون
// Firestore است، نه قطع موقت شبکه.
const PROJECT_STATUS_QUEUE_KEY = 'gtasks-project-status-queue-v1';
let projectStatusRetryTimer = null;

function readProjectStatusQueue(){
  try{
    const q = JSON.parse(localStorage.getItem(PROJECT_STATUS_QUEUE_KEY) || '{}');
    return q && typeof q === 'object' ? q : {};
  }catch(e){ return {}; }
}
function writeProjectStatusQueue(q){
  try{ localStorage.setItem(PROJECT_STATUS_QUEUE_KEY, JSON.stringify(q || {})); }catch(e){}
}
function queueProjectStatus(p){
  if(!p || !p.id) return;
  const q = readProjectStatusQueue();
  q[p.id] = {
    trashed: !!p.trashed,
    archived: !!p.archived,
    ownerUid: p.ownerUid || '',
    queuedAt: Date.now()
  };
  writeProjectStatusQueue(q);
}
function dequeueProjectStatus(pid){
  const q = readProjectStatusQueue();
  if(q[pid]){
    delete q[pid];
    writeProjectStatusQueue(q);
  }
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
  if(!cloudMode || !currentUser || !p || !p.ownerUid) return {ok:false, skipped:true};
  if(p.ownerUid !== currentUser.uid) return {ok:false, skipped:true};

  const ref = db.collection('projects').doc(p.id);
  const payload = {
    trashed: !!p.trashed,
    archived: !!p.archived,
    schemaVersion: DATA_SCHEMA_VERSION,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  await ref.set(payload, {merge:true});

  // فقط برای اطمینان از اینکه write واقعاً روی همان سند اعمال شده است.
  // در حالت آفلاین/کش، get ممکن است با داده محلی برگردد؛ بنابراین verification
  // فقط وجود همان مقادیر منطقی را بررسی می‌کند و در صورت mismatch retry می‌شود.
  const verify = await ref.get({source:'server'});
  if(!verify.exists){
    throw Object.assign(new Error('Project document disappeared after status write'), {code:'verification-failed'});
  }
  const d = verify.data() || {};
  if(!!d.trashed !== !!p.trashed || !!d.archived !== !!p.archived){
    throw Object.assign(new Error('Project status verification mismatch'), {code:'verification-failed'});
  }
  return {ok:true};
}

async function flushProjectStatusQueue(){
  if(!cloudMode || !currentUser || !navigator.onLine) return;
  const q = readProjectStatusQueue();
  const ids = Object.keys(q);
  if(!ids.length) return;

  for(const pid of ids){
    const queued = q[pid];
    const p = findProject(pid);
    if(!p || !p.ownerUid || p.ownerUid !== currentUser.uid){
      dequeueProjectStatus(pid);
      continue;
    }
    // اگر وضعیت محلی بعد از queue تغییر کرده، آخرین وضعیت محلی مرجع است.
    const latest = {
      ...p,
      trashed: !!p.trashed,
      archived: !!p.archived
    };
    try{
      await writeProjectStatusVerified(latest);
      dequeueProjectStatus(pid);
    }catch(err){
      console.warn('queued project status sync failed', pid, err);
      if(isPermissionError(err)){
        // permission مشکل زیرساخت دسترسی است؛ آن را بی‌نهایت retry نمی‌کنیم.
        dequeueProjectStatus(pid);
      }
      break;
    }
  }
}

function scheduleProjectStatusRetry(){
  clearTimeout(projectStatusRetryTimer);
  projectStatusRetryTimer = setTimeout(()=>{
    projectStatusRetryTimer = null;
    flushProjectStatusQueue();
  }, 5000);
}

async function cloudSyncProjectStatus(p){
  if(!cloudMode || !currentUser || !p || !p.ownerUid) return false;
  if(p.ownerUid !== currentUser.uid) return false;

  try{
    const result = await writeProjectStatusVerified(p);
    if(result.ok){
      dequeueProjectStatus(p.id);
      return true;
    }
    return false;
  }catch(err){
    console.warn('project status sync failed', p.id, err);
    if(isRetryableCloudError(err)){
      queueProjectStatus(p);
      scheduleProjectStatusRetry();
    }else{
      dequeueProjectStatus(p.id);
    }
    return false;
  }
}

function cloudSyncProjectFull(p){
  const fn = window.KarhaApp?.cloudSyncProjectFull;
  if(typeof fn === 'function'){
    return fn({
      cloudMode, currentUser, db, pendingCloudWrites, normalizeEmail, DATA_SCHEMA_VERSION,
      normalizeProjectScopedData, mergePolicy: window.KarhaApp?.mergePolicy,
      projectRepositoryFind: (id)=> window.KarhaApp?.projectRepository?.find?.(id),
      getRecoveredLocalTasks, normalizeTaskRecord, rememberProjectTasks,
      writeTaskRecordsNormalized, isRetryableCloudError, markDirty, persist,
    }, p);
  }
}

/* Phase 8.7: sharing fork path removed; merge is owned-only via src/sync/mergeCloudSnapshots. sharedWith data fields retained. */
function mergeCloudSnapshots(ownedDocs, sharedDocs){
  const mergeFn = window.KarhaApp?.mergeOwnedCloudSnapshots;
  const docFn = docToProject;
  if(typeof mergeFn === 'function'){
    const preservedActive = data ? data.activeTab : null;
    const preservedMode = data ? data.viewMode : 'simple';
    const preservedStarredOrder = data && data.starredOrder ? data.starredOrder.slice() : [];
    const result = mergeFn({
      ownedDocs: ownedDocs || [],
      // sharedDocs ignored — sharing removed
      localProjects: (data && data.projects) ? data.projects : [],
      dirtyProjectIds,
      pendingCloudWrites,
      currentUser,
      docToProject: docFn,
      preservedActive,
      preservedMode,
      preservedStarredOrder,
    });
    if(!data) return;
    data.projects = result.projects;
    if(result.activeTab != null) data.activeTab = result.activeTab;
    if(result.viewMode) data.viewMode = result.viewMode;
    if(result.starredOrder) data.starredOrder = result.starredOrder;
    try{
      if(window.KarhaApp?.applyCloudSnapshot && Array.isArray(data.projects)){
        data.projects.forEach(pr=>{ if(pr&&pr.id) window.KarhaApp.applyCloudSnapshot(pr); });
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    }catch(e){}
    return;
  }
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
        if(String(data.activeTab) === String(doc.id) && mainSurface === 'projects') renderAll();
        else if(mainSurface === 'workspace') refreshCurrentFooterPage();
      }
    }));
  }
  await Promise.allSettled(hydrations);
}

function startCloudListeners(){
  stopCloudListeners();
  let ownedDocs = [], sharedDocs = [];
  const onSnap = (docs, shared)=>{
    ownedDocs = docs || [];
    sharedDocs = shared || [];
    mergeCloudSnapshots(ownedDocs, sharedDocs);
    hydrateAllCloudProjects(ownedDocs, sharedDocs);
  };
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
  sharedDocs = [];
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
    pendingCloudWrites.add(p.id);
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
    pendingCloudWrites.delete(p.id);
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

/* ---------- soft delete / undo (like WhatsApp/Telegram) ---------- */
let pendingDelete = null;

function isPendingDeleted(type, pid, tid, sid){
  if(!pendingDelete || pendingDelete.pid !== pid) return false;
  if(pendingDelete.type === 'project') return true;
  if(pendingDelete.type === 'task') return pendingDelete.tid === tid;
  if(pendingDelete.type === 'sub') return type === 'sub' && pendingDelete.tid === tid && pendingDelete.sid === sid;
  return false;
}

function softDelete(type, pid, tid, sid, label){
  if(type === 'task' || type === 'sub'){
    const checkId = type === 'task' ? tid : sid;
    const checkType = type === 'task' ? 'task' : 'subtask';
    const check = canDeleteProjectRecord(checkType, checkId);
    if(!check.ok){
      showRecordDeleteBlocked(checkType, check.refs);
      return false;
    }
  }
  if(pendingDelete) finalizePendingDelete();
  pendingDelete = { type, pid, tid, sid };
  renderAll();
  if(taskUI?.hasCurrentDetail()) renderSheet();
  if(type === 'project' && !document.getElementById('projectsPage').classList.contains('hidden')) renderManagementPage();
  showUndoToast(label);
  pendingDelete.timeoutId = setTimeout(finalizePendingDelete, 4000);
  return true;
}

// حذف سراسری رکوردهای خارج از ساختار پروژه؛ همان چرخه Undo → حذف‌شده‌ها را دارد.
function getCurrentProjectScopeId(){
  const id = data && data.activeTab && data.activeTab!=='starred' ? data.activeTab : null;
  return id && findProject(id) ? id : null;
}

function softDeleteProjectRecord(type, id, label){
  if(type==='contact' || type==='activity'){
    const check=canDeleteProjectRecord(type,id);
    if(!check.ok){ showRecordDeleteBlocked(type,check.refs); return false; }
  }
  if(pendingDelete) finalizePendingDelete();
  const scopeProjectId = getCurrentProjectScopeId();
  const p = scopeProjectId ? findProject(scopeProjectId) : null;
  if(!p || (type!=='contact' && type!=='activity')) return;
  pendingDelete = { type, pid:scopeProjectId, tid:null, sid:null, gid:id, scopeProjectId };
  renderAll();
  if(type==='contact') renderContactsPage();
  if(type==='activity') renderProjectActivitiesPage();
  showUndoToast(label);
  pendingDelete.timeoutId = setTimeout(finalizePendingDelete, 4000);
}

function finalizePendingDelete(){
  if(!pendingDelete) return;
  const { type, pid, tid, sid, gid, timeoutId } = pendingDelete;
  clearTimeout(timeoutId);
  if(type === 'project'){
    window.KarhaApp?.projectApi?.trash?.(pid);
    const p = findProject(pid);
    if(p) cloudSyncProjectStatus(p);
    if(data.activeTab === pid){
      const nextVisible = data.projects.find(pr => pr.id !== pid && !pr.trashed && !pr.archived);
      data.activeTab = nextVisible ? nextVisible.id : 'starred';
    }
  } else if(type === 'task'){
    window.KarhaApp?.taskApi?.trash?.(pid,tid)
      || window.KarhaApp?.taskRuntime?.softDelete(pid,tid);
  } else if(type === 'sub'){
    window.KarhaApp?.taskApi?.trash?.(pid,tid,sid)
      || window.KarhaApp?.taskRuntime?.softDelete(pid,tid,sid);
  } else if(type === 'contact'){
    window.KarhaApp?.contactApi?.trash?.(pid,gid);
  } else if(type === 'activity'){
    window.KarhaApp?.activityApi?.trash?.(pid,gid);
  }
  pendingDelete = null;
  // Domain APIs already persisted cloud-only; do not rewrite localStorage here.
  persist({ local:false });
  renderAll();
  if(!document.getElementById('projectsPage').classList.contains('hidden')){ renderManagementPage(); }
  if(typeof renderContactsPage==='function') renderContactsPage();
  if(typeof renderProjectActivitiesPage==='function') renderProjectActivitiesPage();
  if(typeof renderProjectTrashPage==='function') renderProjectTrashPage();
  hideUndoToast();
}

function undoPendingDelete(){
  if(!pendingDelete) return;
  clearTimeout(pendingDelete.timeoutId);
  pendingDelete = null;
  renderAll();
  if(taskUI?.hasCurrentDetail()) renderSheet();
  hideUndoToast();
}

function showUndoToast(label){
  const t = document.getElementById('undoToast');
  document.getElementById('undoToastText').textContent = label;
  const bar = document.getElementById('undoToastBar');
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = 'undoShrink 4s linear forwards';
  t.classList.remove('hidden');
}
function hideUndoToast(){
  document.getElementById('undoToast').classList.add('hidden');
}
document.getElementById('undoToastBtn').onclick = undoPendingDelete;

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
let mainSurface = 'projects';

function enterWorkspaceSurface(){
  mainSurface = 'workspace';
  const content = document.getElementById('content');
  if(content) content.replaceChildren();
}

function enterProjectsSurface(){
  mainSurface = 'projects';
  menuRootMode = null;
  menuRootPage = null;
  renderAll();
}

function renderAll(){
  setBottomNavActive('Projects');
  renderTabs();
  setBottomNavActive(data.activeTab==='starred' ? 'Projects' : (document.querySelector('.bottom-nav-item.active')?.id?.replace(/^bottom/,'').replace(/Btn$/,'') || 'Projects'));
  renderModeToggle();
  const content = document.getElementById('content');
  content.innerHTML = '';
  if(data.activeTab === 'starred'){
    renderStarredView(content);
    return;
  }
  const p = findProject(data.activeTab);
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
  // keep activeTab as starred; only refresh content (and tab counts via renderTabs)
  renderTabs();
  const content = document.getElementById('content');
  content.innerHTML = '';
  renderStarredView(content);
}

function renderModeToggle(){
  const btn = document.getElementById('modeToggle');
  const label = document.getElementById('modeToggleLabel');
  if(data.viewMode === 'cost'){ btn.classList.add('active'); label.textContent = 'نمایش ساده'; }
  else { btn.classList.remove('active'); label.textContent = 'نمایش هزینه'; }
}
document.getElementById('modeToggle').onclick = ()=>{
  data.viewMode = data.viewMode === 'cost' ? 'simple' : 'cost';
  persist(); renderAll();
};


function syncWorkspacePageTop(){
  const topbar = document.getElementById('topbar');
  const context = document.getElementById('workspaceProjectContext');
  if(!topbar) return;
  const topbarHeight = Math.ceil(topbar.getBoundingClientRect().height);
  const contextVisible = !!context && !context.hidden && context.classList.contains('subpage-context');
  const contextHeight = contextVisible ? Math.ceil(context.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--workspace-page-top', (topbarHeight + contextHeight) + 'px');
}
window.addEventListener('resize', syncWorkspacePageTop);
window.addEventListener('orientationchange', ()=>setTimeout(syncWorkspacePageTop,50));

function updateWorkspaceContextBar(){
  const context = document.getElementById('workspaceProjectContext');
  const contextName = document.getElementById('workspaceProjectName');
  const backBtn = document.getElementById('workspaceContextBack');
  const actionBtn = document.getElementById('workspaceContextAction');
  const topbar = document.getElementById('topbar');
  const topbarTitle = document.getElementById('topbarTitle');
  const topbarMain = topbarTitle?.querySelector('.app-title-main');
  const topbarProject = document.getElementById('topbarProjectName');
  if(!context || !contextName) return;

  const activeBtn = document.querySelector('.bottom-nav-item.active');
  const key = activeBtn?.id?.replace(/^bottom/,'').replace(/Btn$/,'') || 'Projects';
  const profileVisible = !document.getElementById('profilePage')?.classList.contains('hidden');
  const managementVisible = !document.getElementById('projectsPage')?.classList.contains('hidden');
  const isWorkspace = key !== 'Projects' || profileVisible || managementVisible;

  // صفحات منوی کناری مستقل از هوم پروژه‌ها هستند؛ فعال بودن «پروژه‌ها» در فوتر
  // فقط نشان می‌دهد این صفحات متعلق به بخش پروژه‌ها هستند، نه اینکه خود هوم پروژه‌ها هستند.
  if(menuRootMode){
    const menuTitles = {
      profile: 'ثبت مشخصات',
      projects: 'مدیریت پروژه‌ها',
    };
    if(topbar) topbar.classList.add('workspace-context');
    if(topbarMain) topbarMain.textContent = menuTitles[menuRootMode] || '';
    if(topbarProject) topbarProject.textContent = '';
    contextName.textContent = '';
    context.hidden = true;
    context.classList.remove('subpage-context');
    if(backBtn) backBtn.hidden = true;
    if(actionBtn) actionBtn.hidden = true;
    if(topbar) topbar.classList.add('root-workspace-context');
    syncWorkspacePageTop();
    return;
  }

  if(profileVisible){
    if(topbar) topbar.classList.add('workspace-context');
    if(topbarMain) topbarMain.textContent = 'ثبت مشخصات';
    if(topbarProject) topbarProject.textContent = '';
    contextName.textContent = '';
    context.hidden = true;
    context.classList.remove('subpage-context');
    if(backBtn) backBtn.hidden = true;
    if(actionBtn) actionBtn.hidden = true;
    if(topbar) topbar.classList.add('root-workspace-context');
    syncWorkspacePageTop();
    return;
  }

  if(managementVisible){
    if(topbar) topbar.classList.add('workspace-context');
    if(topbarMain) topbarMain.textContent = 'مدیریت پروژه‌ها';
    if(topbarProject) topbarProject.textContent = '';
    contextName.textContent = '';
    context.hidden = true;
    context.classList.remove('subpage-context');
    if(backBtn) backBtn.hidden = true;
    if(actionBtn) actionBtn.hidden = true;
    if(topbar) topbar.classList.add('root-workspace-context');
    syncWorkspacePageTop();
    return;
  }

  // در سطح اصلی هر تب فوتر، عنوان همان بخش در هدر اصلی قرار می‌گیرد.
  // نوار سبز فقط در صورتی وجود دارد که واقعاً وارد یک زیرمجموعه شده باشیم.
  let sectionTitle = '';
  if(key === 'Reports') sectionTitle = 'گزارش';
  else if(key === 'Accounting') sectionTitle = 'حسابداری';
  else if(key === 'Settings') sectionTitle = 'تنظیمات';
  else if(key === 'Projects' && workspaceSubpage === 'archive') sectionTitle = 'آرشیو شده ها';

  if(topbarMain){
    topbarMain.textContent = isWorkspace ? sectionTitle : 'کارها';
  }

  const p = data && data.activeTab !== 'starred' ? findProject(data.activeTab) : null;
  if(topbarProject){
    topbarProject.textContent = isWorkspace && p ? ('(پروژه ' + p.name + ')') : '';
  }

  if(!isWorkspace){
    contextName.textContent = '';
    context.hidden = true;
    context.classList.remove('subpage-context');
    if(topbar) topbar.classList.remove('root-workspace-context');
    if(backBtn) backBtn.hidden = true;
    if(actionBtn) actionBtn.hidden = true;
    syncWorkspacePageTop();
    return;
  }

  // زیرصفحه‌های داخلی نوار استاندارد خودشان را دارند؛ نوار سراسری اینجا نباید دوباره نمایش داده شود.
  let subTitle = '';
  const hasOwnInnerSectionBar = ['statusList','statusForm','collab','projectTrash','contractTemplates','contractTemplateForm','statusTest','contracts','contractForm'].includes(workspaceSubpage);
  if(!hasOwnInnerSectionBar){
    if(key === 'Accounting' && (workspaceSubpage === 'statusList' || workspaceSubpage === 'statusForm')) subTitle = 'صورت وضعیت';
    else if(key === 'Settings' && workspaceSubpage === 'collab') subTitle = 'همکاران پروژه';
  }

  // نوار سبز فقط برای زیرمجموعه‌ها فعال است؛ در خودِ سه تب فوتر کاملاً حذف می‌شود.
  const showSubpageBar = isWorkspace && !!subTitle;
  // صفحه اصلی تب: خط طوسی زیر هدر. زیرصفحه: نوار سبز و بدون خط اضافی.
  if(topbar) topbar.classList.toggle('root-workspace-context', isWorkspace && !showSubpageBar);
  context.hidden = !showSubpageBar;
  context.classList.toggle('subpage-context', showSubpageBar);
  context.setAttribute('aria-hidden', showSubpageBar ? 'false' : 'true');
  contextName.textContent = subTitle;

  if(backBtn){
    backBtn.hidden = false;
    backBtn.onclick = ()=>{
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
    };
  }

  if(actionBtn){
    // فقط لیست صورت وضعیت‌ها و همکاران پروژه امکان ایجاد مورد جدید دارند.
    // در فرم ویرایش صورت وضعیت عمداً دکمه + وجود ندارد.
    const hasSubpageAction = !hasOwnInnerSectionBar && (workspaceSubpage === 'contracts');
    actionBtn.hidden = !hasSubpageAction;
    actionBtn.title = 'ایجاد قرارداد';
    actionBtn.setAttribute('aria-label', actionBtn.title);
    actionBtn.onclick = ()=>{
      if(workspaceSubpage === 'statusList'){ openStatusForm(null); return; }
      if(workspaceSubpage === 'contracts'){ openContractForm(null); return; }
      if(workspaceSubpage === 'collab'){
        showToast('اشتراک‌گذاری حذف شده است');
        return;
      }
    };
  }
  syncWorkspacePageTop();
}

function setBottomNavActive(key){
  // چهار گزینه فوتر همیشه فعال/قابل استفاده‌اند. صفحات منوی کناری زیرمجموعه بخش پروژه‌ها هستند،
  // بنابراین در آنها فقط «پروژه‌ها» فعال می‌ماند؛ فوتر خاموش نمی‌شود.
  if(menuRootMode) key='Projects';
  document.querySelectorAll('.bottom-nav-item').forEach(b=>b.classList.remove('active'));
  const el = document.getElementById('bottom' + key + 'Btn');
  if(el) el.classList.add('active');

  const isWorkspace = key !== 'Projects';
  const topbar = document.getElementById('topbar');
  const topbarProject = document.getElementById('topbarProjectName');
  const tabbar = document.getElementById('tabbar');

  // صفحات داخلی: پروژه در عنوان هدر نمایش داده می‌شود و نوار پروژه‌ها حذف است.
  if(topbar) topbar.classList.toggle('workspace-context', isWorkspace);

  if(tabbar) tabbar.setAttribute('aria-hidden', isWorkspace ? 'true' : 'false');
  updateWorkspaceContextBar();

  const nav=document.getElementById('bottomNav');
  if(nav) nav.classList.toggle('starred-disabled', data && data.activeTab==='starred');
}
function showOnlyWorkspacePage(pageId){
  // محتوای هوم پروژه‌ها هرگز همزمان با یک صفحه منو نمایش داده نمی‌شود.
  const content = document.getElementById('content');
  if(content) content.replaceChildren();
  const ids = ['projectsPage','profilePage','calendarPage','createPage','reportsPage','accountingPage','settingsPage','projectActivitiesPage','contactsPage','projectTrashPage','contractsPage','contractFormPage','contractTemplateFormPage','contractTemplatesPage','activityFormPage'];
  // اول همه صفحات را قطعاً پنهان کن؛ سپس فقط صفحه مقصد را نشان بده.
  // این کار جلوی هرگونه هم‌پوشانی بین صفحات منوی اصلی و هوم پروژه‌ها را می‌گیرد.
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.classList.add('hidden');
  });
  const target=document.getElementById(pageId);
  if(target) target.classList.remove('hidden');
}

function closeBottomPages(){
  workspaceSubpage=null;
  ['projectsPage','profilePage','calendarPage','createPage','reportsPage','accountingPage','settingsPage','projectActivitiesPage','contactsPage','projectTrashPage','contractsPage','contractFormPage','contractTemplateFormPage','contractTemplatesPage','activityFormPage']
    .forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.classList.add('hidden');
    });
}

function ensureHomeSelection(){
  const active = findProject(data.activeTab);
  if(!data.activeTab || data.activeTab === 'starred' || !active || active.trashed || active.archived){
    data.activeTab = null;
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
  const p=findProject(data.activeTab);
  body.innerHTML='';
  if(!p){ body.innerHTML='<div class="mgmt-empty">برای نمایش تنظیمات، یک پروژه را انتخاب کنید.</div>'; return; }
  const wrap=document.createElement('div'); wrap.className='workspace-option-list';
  /* همکاران پروژه: UI حذف‌شده در فاز ۵+؛ openCollabPage فقط برای سازگاری باقی مانده */
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
  closeBottomPages(); enterWorkspaceSurface(); workspaceSubpage='contractTemplates';
  setBottomNavActive('Settings'); renderTabs(); showOnlyWorkspacePage('contractTemplatesPage'); updateWorkspaceContextBar();
  pushWorkspaceHistory('contractTemplates'); renderContractTemplatesPage();
}
function closeContractTemplatesPage(){
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
let contractPointerDragState=null;
function startContractPointerDrag(e, arr, index, wrapperEl, render){
  if(!arr || !wrapperEl) return;
  e.preventDefault(); e.stopPropagation();
  const container=wrapperEl.parentElement;
  const siblingEls=Array.from(container?.children||[]).filter(el=>el.dataset && el.dataset.contractDragId);
  contractPointerDragState={arr,index,wrapperEl,siblingEls,hoverEl:null,hoverPos:null,render,moved:false};
  wrapperEl.classList.add('contract-row-dragging');
  document.addEventListener('pointermove',onContractPointerDragMove);
  document.addEventListener('pointerup',onContractPointerDragEnd,{once:true});
}
function onContractPointerDragMove(e){
  if(!contractPointerDragState) return;
  const st=contractPointerDragState; st.moved=true;
  const others=st.siblingEls.filter(el=>el!==st.wrapperEl);
  let target=null,pos=null;
  for(const el of others){ const r=el.getBoundingClientRect(); if(e.clientY < r.top+r.height/2){target=el;pos='before';break;} }
  if(!target && others.length){target=others[others.length-1];pos='after';}
  others.forEach(el=>el.classList.remove('contract-drag-over-top','contract-drag-over-bottom'));
  if(target) target.classList.add(pos==='before'?'contract-drag-over-top':'contract-drag-over-bottom');
  st.hoverEl=target; st.hoverPos=pos;
}
function onContractPointerDragEnd(){
  const st=contractPointerDragState; if(!st) return;
  document.removeEventListener('pointermove',onContractPointerDragMove);
  st.wrapperEl.classList.remove('contract-row-dragging');
  st.siblingEls.forEach(el=>el.classList.remove('contract-drag-over-top','contract-drag-over-bottom'));
  contractPointerDragState=null;
  if(!st.moved || !st.hoverEl) return;
  const targetId=st.hoverEl.dataset.contractDragId;
  const source=st.index; const from=st.arr.findIndex(x=>String(x.id)===String(st.wrapperEl.dataset.contractDragId));
  if(from<0) return;
  const [moved]=st.arr.splice(from,1);
  let to=st.arr.findIndex(x=>String(x.id)===String(targetId));
  if(to<0){st.arr.splice(from,0,moved);return;}
  if(st.hoverPos==='after') to++;
  st.arr.splice(to,0,moved);
  contractTemplateFormDirty=true;
  st.render();
}
function attachContractDrag(handle, arr, index, render){
  handle.onpointerdown=e=>startContractPointerDrag(e,arr,index,handle.closest('.contract-item-card'),render);
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
  if(projectId && String(projectId)!==String(getCurrentProjectScopeId())){
    setActiveProject(projectId,{updateRoute:false,render:false});
  }
  const p=getCurrentProject(); if(!p)return false;
  closeDrawer(); enterWorkspaceSurface(); workspaceSubpage='contracts';
  if(updateRoute) replaceWorkspaceRoute(p.id,'contracts');
  setBottomNavActive('Reports'); renderTabs(); showOnlyWorkspacePage('contractsPage'); updateWorkspaceContextBar();
  if(pushHistory) pushWorkspaceHistory('contracts');
  renderContractsPage();
  return true;
}
function closeContractsPage(){ const p=getCurrentProject(); workspaceSubpage=null; if(p)replaceWorkspaceRoute(p.id,'reports'); setBottomNavActive('Reports'); renderTabs(); showOnlyWorkspacePage('reportsPage'); updateWorkspaceContextBar(); renderReportsWorkspace(); }
function renderContractsPage(){
  const module=window.KarhaApp?.modules?.get('contracts');
  if(module?.render) module.render(getCurrentProject()?.id);
}

// Compatibility shell only: form state, rendering and persistence live in the
// modular real-contract form module.
/* Phase 8.6: contract form business logic lives in src/modules/contracts/*; legacy owns page shell visibility only. */
function openRealContractFormShell(projectId){
  const p=getCurrentProject(); if(!p || String(p.id)!==String(projectId)) return false;
  closeDrawer();
  workspaceSubpage='contractForm'; setInternalFormMode(true);
  showOnlyWorkspacePage('contractFormPage'); setBottomNavActive('Reports');
  renderTabs(); updateWorkspaceContextBar();
  return true;
}
function closeRealContractFormShell(){
  setInternalFormMode(false);
  document.getElementById('contractFormPage')?.classList.add('hidden');
  workspaceSubpage='contracts';
  showOnlyWorkspacePage('contractsPage'); setBottomNavActive('Reports');
  renderTabs(); updateWorkspaceContextBar(); renderContractsPage();
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
  // Phase 5 removed path
  try{ const pid=getCurrentProjectScopeId(); if(pid&&window.KarhaApp?.router) window.KarhaApp.router.navigate(pid,'dashboard',{replace:true}); }catch(e){} return;

  closeDrawer(); enterWorkspaceSurface(); workspaceSubpage='statusTest'; setBottomNavActive('Accounting'); renderTabs(); showOnlyWorkspacePage(); updateWorkspaceContextBar(); pushWorkspaceHistory('statusTest'); renderStatusTestPage();
}
function closeStatusTestPage(){ workspaceSubpage=null; setBottomNavActive('Accounting'); renderTabs(); showOnlyWorkspacePage('accountingPage'); updateWorkspaceContextBar(); renderAccountingWorkspace(); }
function renderStatusTestPage(){
  const body=document.getElementById('statusTestBody'); if(!body)return; body.innerHTML='';
  const project=getCurrentProject();
  if(!project){body.innerHTML='<div class="contract-empty">ابتدا یک پروژه را انتخاب کنید.</div>';return;}
  const contacts=getContacts(project).filter(c=>!c.trashed);
  const contracts=getProjectContracts(project).filter(c=>!c.trashed);
  const state=window.__statusTestState || {contactId:'',contractId:'',date:todayJalaliStr(),percent:'',note:''};
  window.__statusTestState=state;
  if(!state.date) state.date=todayJalaliStr();

  const addField=(label,kind,value,onchange,opts={})=>{
    const field=document.createElement('div'); field.className='status-test-field';
    const lab=document.createElement('label'); lab.textContent=label; field.appendChild(lab);
    let el;
    if(kind==='select'){
      el=document.createElement('select'); el.innerHTML=opts.options||''; el.value=value||'';
    }else if(kind==='textarea'){
      el=document.createElement('textarea'); el.value=value||''; el.rows=3;
    }else{
      el=document.createElement('input'); el.type=kind||'text'; el.value=value||''; if(opts.min!=null)el.min=opts.min;if(opts.max!=null)el.max=opts.max;el.inputMode=opts.inputMode||'';
    }
    el.onchange=()=>{onchange(el.value);renderStatusTestPage();};
    if(kind!=='select' && kind!=='textarea') el.oninput=()=>{onchange(el.value);};
    if(kind==='textarea') el.oninput=()=>{onchange(el.value);};
    field.appendChild(el); body.appendChild(field); return el;
  };

  const contactOptions='<option value="">انتخاب مخاطب…</option>'+contacts.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml([c.firstName,c.lastName].filter(Boolean).join(' ')||c.name||'مخاطب')+'</option>').join('');
  addField('مخاطب / پیمانکار','select',state.contactId,v=>{state.contactId=v;state.contractId='';state.percent='';state.note='';},{options:contactOptions});

  const myContracts=contracts.filter(c=>String(c.contactId)===String(state.contactId));
  const contractOptions='<option value="">انتخاب قرارداد…</option>'+myContracts.map(c=>{const a=findActivityTemplate(c.activityId,project);return '<option value="'+escapeHtml(c.id)+'">'+escapeHtml((c.title||('قرارداد '+(a?.name||'')))+' · '+(a?.name||'بدون فعالیت'))+'</option>';}).join('');
  addField('قرارداد پیمانکار','select',state.contractId,v=>{state.contractId=v;state.percent='';state.note='';},{options:contractOptions});

  if(!state.contactId){ const info=document.createElement('div'); info.className='status-test-info'; info.textContent='ابتدا مخاطب را انتخاب کنید تا قراردادهای همان مخاطب نمایش داده شود.'; body.appendChild(info); return; }
  if(!myContracts.length){ const info=document.createElement('div'); info.className='status-test-info'; info.textContent='برای این مخاطب هنوز قرارداد فعالی ثبت نشده است.'; body.appendChild(info); return; }
  const selected=findProjectContract(state.contractId,project);
  if(!selected){ const info=document.createElement('div'); info.className='status-test-info'; info.textContent='یک قرارداد را انتخاب کنید تا اطلاعات و مراحل صورت وضعیت نمایش داده شود.'; body.appendChild(info); return; }

  const activity=findActivityTemplate(selected.activityId,project);
  const total=Number(toEnglishDigits(String(selected.amount||'')).replace(/[^\d.]/g,''))||0;
  const progress=Array.isArray(selected.progressTimeline)?selected.progressTimeline:[];
  const last=progress.length?Math.max(...progress.map(x=>Number(x.percent)||0)):0;
  const info=document.createElement('div'); info.className='status-test-info';
  info.innerHTML='<b>'+escapeHtml(selected.title||'قرارداد')+'</b><br>فعالیت: '+escapeHtml(activity?.name||'—')+'<br>مبلغ کل قرارداد: '+escapeHtml(formatCostDisplay(total))+'<br>پیشرفت فعلی: <b>'+escapeHtml(toPersianDigits(String(last)))+'٪</b>';
  body.appendChild(info);

  addField('تاریخ صورت وضعیت','text',state.date,v=>{state.date=v;});
  addField('درصد انجام کل قرارداد تا این صورت وضعیت','number',state.percent,v=>{state.percent=v;},{min:0,max:100,inputMode:'decimal'});
  addField('توضیحات صورت وضعیت','textarea',state.note,v=>{state.note=v;});

  const n=Number(state.percent); const validPct=Number.isFinite(n)&&n>=0&&n<=100;
  const doneAmount=validPct?Math.round(total*n/100):0; const previousAmount=Math.round(total*last/100); const stageAmount=Math.max(0,doneAmount-previousAmount); const remaining=Math.max(0,total-doneAmount);
  const calc=document.createElement('div');calc.className='status-test-info';calc.innerHTML='<b>مبلغ تجمعی انجام‌شده:</b> '+escapeHtml(formatCostDisplay(doneAmount))+'<br><b>مبلغ این مرحله:</b> '+escapeHtml(formatCostDisplay(stageAmount))+'<br><b>مانده قرارداد:</b> '+escapeHtml(formatCostDisplay(remaining));body.appendChild(calc);

  const tl=document.createElement('div'); tl.className='status-test-timeline'; const tt=document.createElement('div'); tt.className='status-test-timeline-title'; tt.textContent='تایم‌لاین پیشرفت قرارداد'; tl.appendChild(tt);
  const list=document.createElement('div'); list.className='status-test-timeline-list';
  if(!progress.length){const e=document.createElement('div');e.className='status-test-empty';e.textContent='هنوز صورت وضعیت تستی برای این قرارداد ثبت نشده است.';list.appendChild(e);}
  else progress.slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).forEach((x,i)=>{
    const pt=document.createElement('div');pt.className='status-test-point';
    const xa=Math.round(total*Number(x.percent||0)/100);
    pt.innerHTML='<div class="status-test-point-head"><span>مرحله '+toPersianDigits(String(i+1))+' · '+escapeHtml(x.date||'')+'</span><span class="status-test-point-pct">٪'+escapeHtml(toPersianDigits(String(x.percent||0)))+'</span></div><div style="margin-top:5px;font-size:12px;color:var(--text-dim)">مبلغ تجمعی: '+escapeHtml(formatCostDisplay(x.amount||xa))+' · مبلغ این مرحله: '+escapeHtml(formatCostDisplay(x.stageAmount||0))+'</div>'+(x.note?'<div style="margin-top:5px;font-size:12px;color:var(--text)">'+escapeHtml(x.note)+'</div>':'');
    list.appendChild(pt);
  });
  tl.appendChild(list); body.appendChild(tl);

  const bar=document.createElement('div');bar.className='status-test-savebar';const btn=document.createElement('button');btn.type='button';btn.textContent='ثبت صورت وضعیت تستی';
  btn.onclick=()=>{
    const pct=Number(state.percent);
    if(!Number.isFinite(pct)||pct<0||pct>100){showToast('درصد انجام را بین صفر تا ۱۰۰ وارد کنید');return;}
    if(pct<last){showToast('درصد انجام جدید نمی‌تواند از مرحله قبلی کمتر باشد');return;}
    if(pct===last&&progress.length){showToast('این درصد قبلاً ثبت شده است');return;}
    if(!state.date.trim()){showToast('تاریخ صورت وضعیت را وارد کنید');return;}
    if(!Array.isArray(selected.progressTimeline))selected.progressTimeline=[];
    const cumulative=Math.round(total*pct/100); const prev=Math.round(total*last/100);
    selected.progressTimeline.push({id:uid(),percent:pct,amount:cumulative,stageAmount:Math.max(0,cumulative-prev),date:state.date.trim(),note:String(state.note||'').trim(),createdAt:Date.now()});
    selected.progressPercent=pct; markDirty(project.id); persist(); showToast('صورت وضعیت تستی ثبت شد');
    state.percent='';state.note='';renderStatusTestPage();
  };
  bar.appendChild(btn);body.appendChild(bar);
}
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

function collectAllTrashedRecords(){
  const out=[];
  (data.projects||[]).forEach(p=>{
    if(p && p.trashed) out.push({type:'project',id:p.id,record:p,projectId:p.id,deletedAt:p.deletedAt||0});
    (p.tasks||[]).forEach(t=>{
      if(t && t.trashed) out.push({type:'task',id:t.id,record:t,projectId:p.id,projectName:p.name,deletedAt:t.deletedAt||0});
      walkItems(t.subtasks,(item,parent)=>{
        if(item && item.trashed) out.push({type:'subtask',id:item.id,record:item,projectId:p.id,projectName:p.name,parentId:parent?parent.id:t.id,rootTaskId:t.id,deletedAt:item.deletedAt||0});
      });
    });
  });
  return out.sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0));
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
    p.trashed=false; delete p.deletedAt; delete p.deletedType; cloudSyncProjectStatus(p); data.activeTab=p.id; return true;
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

function getTrashSourceLabel(type){
  switch(type){
    case 'contact': return 'مخاطبین';
    case 'activity': return 'فعالیت‌ها';
    case 'project': return 'پروژه‌ها';
    case 'task':
    case 'subtask': return 'آیتم‌های پروژه';
    default: return 'سایر';
  }
}

function addTrashSourceBadge(container, type){
  const badge=document.createElement('div');
  badge.className='trash-source-badge';
  badge.textContent='بخش: '+getTrashSourceLabel(type);
  container.insertBefore(badge, container.firstChild);
  return badge;
}

function appendTrashActions(actions,entry){
  const restore=document.createElement('button'); restore.type='button'; restore.className='restore-btn'; restore.textContent='بازگردانی';
  restore.onclick=()=>{ if(restoreGlobalRecord(entry)){ persist(); renderProjectTrashPage(); renderAll(); renderContactsPage(); renderProjectActivitiesPage(); showToast('بازگردانده شد'); } };
  const perm=document.createElement('button'); perm.type='button'; perm.className='perm-del-btn'; perm.textContent='حذف همیشگی';
  perm.onclick=()=>openConfirm('این مورد برای همیشه حذف شود؟ این عملیات قابل بازگردانی نیست.',async()=>{
    const ok=await permanentlyDeleteGlobalRecord(entry);
    if(ok){ persist(); renderProjectTrashPage(); renderAll(); renderContactsPage(); renderProjectActivitiesPage(); showToast('برای همیشه حذف شد'); }
  },'حذف همیشگی');
  actions.append(restore,perm);
}

function collectProjectTrashedRecords(projectId){
  const out=[];
  const p=findProject(projectId);
  if(!p) return out;
  (p.tasks||[]).forEach(t=>{
    if(t && t.trashed) out.push({type:'task',id:t.id,record:t,projectId:p.id,projectName:p.name,deletedAt:t.deletedAt||0});
    walkItems(t.subtasks,(item,parent)=>{
      if(item && item.trashed) out.push({type:'subtask',id:item.id,record:item,projectId:p.id,projectName:p.name,parentId:parent?parent.id:t.id,rootTaskId:t.id,deletedAt:item.deletedAt||0});
    });
  });
  // مخاطب و فعالیت ذاتاً داخل Workspace همین پروژه هستند؛ سطل فقط همین Scope را می‌بیند.
  getContacts(p).forEach(c=>{
    if(c && c.trashed) out.push({type:'contact',id:c.id,record:c,projectId,projectName:p.name,deletedAt:c.deletedAt||0});
  });
  getActivityTemplates(p).forEach(a=>{
    if(a && a.trashed) out.push({type:'activity',id:a.id,record:a,projectId,projectName:p.name,deletedAt:a.deletedAt||0});
  });
  return out.sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0));
}

function renderProjectTrashItem(entry,list){
  if(entry.type==='task'||entry.type==='subtask'){ taskUI.renderTrashItem(entry,list); return; }
  const r=entry.record;
  const wrap=document.createElement('div');
  wrap.className='trash-task-wrap project-trash-record';
  addTrashSourceBadge(wrap,entry.type);

  // مخاطب و فعالیت باید همان ظاهر رکورد اصلی خودشان را حفظ کنند و فقط عملیات حذف‌شده‌ها به همان ردیف اضافه شود.
  if(entry.type==='contact'){
    const row=document.createElement('div'); row.className='contact-row trash-native-row';
    const main=document.createElement('div'); main.className='contact-main';
    const displayName=[r.type,r.firstName,r.lastName].filter(Boolean).join(' ').trim() || r.name || 'مخاطب جدید';
    const name=document.createElement('div'); name.className='contact-name'; name.textContent=displayName;
    const activityText=(Array.isArray(r.activities)?r.activities:[]).map(id=>{const a=findActivityTemplate(id);return a&&!a.trashed?a.name:'';}).filter(Boolean).join('، ');
    const activityLine=document.createElement('div'); activityLine.className='contact-activities'; activityLine.textContent=activityText||'بدون فعالیت';
    main.append(name,activityLine);
    const actions=document.createElement('div'); actions.className='contact-actions project-trash-inline-actions'; appendTrashActions(actions,entry);
    row.append(main,actions); wrap.appendChild(row); list.appendChild(wrap); return;
  }
  if(entry.type==='activity'){
    const row=document.createElement('div'); row.className='activity-row trash-native-row';
    const name=document.createElement('div'); name.className='activity-name'; name.textContent=r.name||'فعالیت';
    const actions=document.createElement('div'); actions.className='activity-actions project-trash-inline-actions'; appendTrashActions(actions,entry);
    row.append(name,actions); wrap.appendChild(row); list.appendChild(wrap); return;
  }

}

function renderProjectTrashPage(){
  const body=document.getElementById('projectTrashPageBody'); if(!body) return;
  const projectId=(data.activeTab && data.activeTab!=='starred') ? data.activeTab : null;
  const items=projectId ? collectProjectTrashedRecords(projectId) : [];
  body.innerHTML='';

  const clearWrap=document.createElement('div'); clearWrap.className='project-trash-clear-wrap inner-action-card inner-action-card--danger';
  const clear=document.createElement('button'); clear.type='button'; clear.className='perm-del-btn project-trash-clear'; clear.textContent='حذف همه';
  clear.onclick=async()=>{
    if(clear.dataset.confirmed!=='1'){clear.dataset.confirmed='1';clear.textContent='برای حذف همه دوباره بزنید';setTimeout(()=>{if(clear.isConnected&&clear.dataset.confirmed==='1'){clear.dataset.confirmed='0';clear.textContent='حذف همه';}},3000);return;}
    clear.dataset.confirmed='0';
    for(const entry of items.slice()) await permanentlyDeleteGlobalRecord(entry);
    persist(); renderProjectTrashPage(); renderAll(); showToast('همه موارد این پروژه برای همیشه حذف شدند');
  };
  clearWrap.appendChild(clear); body.appendChild(clearWrap);

  if(!projectId){
    const e=document.createElement('div'); e.className='project-trash-empty'; e.textContent='پروژه‌ای برای نمایش حذف‌شده‌ها انتخاب نشده است.'; body.appendChild(e); return;
  }
  if(!items.length){ const e=document.createElement('div'); e.className='project-trash-empty'; e.textContent='مورد حذف‌شده‌ای در این پروژه وجود ندارد.'; body.appendChild(e); return; }

  const list=document.createElement('div'); list.className='project-trash-list';
  const search=createWorkspaceSearch('جستجو در حذف‌شده‌ها…',q=>{Array.from(list.children).forEach(row=>row.hidden=!workspaceTextMatch(row.dataset.searchText,q));});
  body.appendChild(search.wrap);
  items.forEach(entry=>renderProjectTrashItem(entry,list));
  body.appendChild(list);
}

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

document.getElementById('bottomProjectsBtn').onclick=()=>{commitActiveContactDraft();if(data.activeTab&&data.activeTab!=='starred')replaceWorkspaceRoute(data.activeTab,'dashboard');goHomeProjects();};

document.getElementById('bottomReportsBtn').onclick=()=>{
  commitActiveContactDraft();
  leaveMenuRootForFooter();
  closeBottomPages();
  ensureHomeSelection();
  if(data.activeTab) replaceWorkspaceRoute(data.activeTab,'reports');
  enterWorkspaceSurface();
  workspaceSubpage=null;
  setBottomNavActive('Reports');
  renderTabs();
  showOnlyWorkspacePage('reportsPage');
  renderReportsWorkspace();
  updateWorkspaceContextBar();
  pushWorkspaceHistory('reports-root');
};

document.getElementById('bottomAccountingBtn').onclick=()=>{
  commitActiveContactDraft();
  leaveMenuRootForFooter();
  closeBottomPages();
  ensureHomeSelection();
  if(data.activeTab) replaceWorkspaceRoute(data.activeTab,'accounting');
  enterWorkspaceSurface();
  workspaceSubpage=null;
  setBottomNavActive('Accounting');
  renderTabs();
  // صفحه را اول visible کن تا خطای رندر یا Snapshot شبکه هیچ‌وقت صفحه سفید نسازد.
  showOnlyWorkspacePage('accountingPage');
  try{
    renderAccountingWorkspace();
  }catch(err){
    console.error('renderAccountingWorkspace failed:', err);
    const body=document.getElementById('accountingPageBody');
    if(body) body.innerHTML='<div class="mgmt-empty">خطا در نمایش حسابداری. دوباره وارد شوید.</div>';
  }
  updateWorkspaceContextBar();
  pushWorkspaceHistory('accounting');
};

document.getElementById('bottomSettingsBtn').onclick=()=>{
  commitActiveContactDraft();
  leaveMenuRootForFooter();
  closeBottomPages();
  ensureHomeSelection();
  if(data.activeTab) replaceWorkspaceRoute(data.activeTab,'people');
  enterWorkspaceSurface();
  workspaceSubpage=null;
  setBottomNavActive('Settings');
  renderTabs();
  showOnlyWorkspacePage('settingsPage');
  renderSettingsWorkspace();
  updateWorkspaceContextBar();
  pushWorkspaceHistory('settings-root');
};

document.getElementById('closeReportsPage').onclick=()=>goHomeProjects();
document.getElementById('closeAccountingPage').onclick=()=>goHomeProjects();
document.getElementById('closeSettingsPage').onclick=()=>goHomeProjects();
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
  isFloatingConfirmUser, focusInlineAdd, persist, markDirty, openNumpadGeneric, addTrashSourceBadge, appendTrashActions
});
const {renderProjectView,refreshProjectPartial,renderInlineAddRow,renderTaskBlock,renderStarredView,
  buildStarredGroup,openTaskDetail,openSubDetail,closeSheet,renderSheet}=taskUI;

/* ---------- side drawer (menu) ---------- */
function openDrawer(){
  document.getElementById('drawerOverlay').classList.remove('hidden');
  renderDrawerProjectList();
}
function closeDrawer(){ document.getElementById('drawerOverlay').classList.add('hidden'); }
window.addEventListener('karha:drawer-open', openDrawer);
window.addEventListener('karha:workspace-route-synced', event=>{
  const routeProjectId=event.detail?.projectId;
  if(routeProjectId && String(data.activeTab)!==String(routeProjectId)){
    setActiveProject(routeProjectId,{updateRoute:false,render:false,moduleId:event.detail?.moduleId||'dashboard'});
    if(event.detail?.moduleId==='dashboard') renderAll();
  }
  renderDrawerProjectList();
  if(event.detail?.moduleId==='contracts' && event.detail?.projectId){
    openContractsPage(event.detail.projectId,{updateRoute:false,pushHistory:false});
  }
  updateWorkspaceContextBar();
});

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

/* ---------- user profile (Phase 8.3: store owned by src/modules/profile/profileStore.js) ---------- */
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

let profileDraft = null;

function closeProfilePage(fromPopState=false){
  profileDraft = null;
  document.getElementById('profilePage').classList.add('hidden');
  if(menuRootPage === 'profile' || menuRootHistoryPushed){
    closeMenuRootPage(fromPopState);
    return;
  }
  updateWorkspaceContextBar();
  const active=document.querySelector('.bottom-nav-item.active');
  if(active && active.id==='bottomProjectsBtn') enterProjectsSurface();
  else refreshCurrentFooterPage();
}

document.getElementById('drawerProfileBtn').onclick = ()=>{ closeDrawer(); openProfilePage(); };
document.getElementById('profileCancelBtn').onclick = closeProfilePage;

document.getElementById('profileSaveBtn').onclick = ()=>{
  const nameInp=document.getElementById('profileNameInput');
  const abbrInp=document.getElementById('profileAbbrInput');
  const name=(nameInp?.value || '').trim();
  const senderAbbr=(abbrInp?.value || '').trim();
  if(!senderAbbr){
    if(abbrInp){ abbrInp.focus(); abbrInp.style.borderColor='var(--danger)'; }
    showToast('اختصار فرستنده را وارد کنید');
    return;
  }
  const p={...(profileDraft || loadProfile()), name, senderAbbr};
  saveProfile(p);
  profileDraft = {...p};
  showToast('مشخصات ذخیره شد');
  // ذخیره در صفحه ثبت مشخصات مانند انصراف، به هوم پروژه‌ها برمی‌گردد.
  closeProfilePage(false);
};

function openProfilePage(){
  closeBottomPages();
  menuRootMode='profile';
  enterWorkspaceSurface();
  ensureHomeSelection();
  setBottomNavActive('Projects');
  pushMenuRootHistory('profile');
  profileDraft = {...loadProfile()};
  document.getElementById('profilePage').classList.remove('hidden');
  updateWorkspaceContextBar();
  renderProfilePage();
}
function renderProfilePage(){
  const body = document.getElementById('profilePageBody');
  body.innerHTML = '';
  const prof = {...(profileDraft || loadProfile())};

  const nameField = document.createElement('div');
  nameField.className = 'profile-field';
  nameField.innerHTML = '<label for="profileNameInput">نام و نام خانوادگی</label>';
  const nameInp = document.createElement('input');
  nameInp.type = 'text';
  nameInp.id = 'profileNameInput';
  nameInp.placeholder = 'مثلاً علی رضایی';
  nameInp.value = prof.name || '';
  nameInp.oninput = ()=>{
    if(!profileDraft) profileDraft = {...loadProfile()};
    profileDraft.name = nameInp.value;
    nameInp.style.borderColor='';
  };
  nameField.appendChild(nameInp);
  body.appendChild(nameField);

  const abbrField = document.createElement('div');
  abbrField.className = 'profile-field';
  abbrField.innerHTML = '<label for="profileAbbrInput">اختصار فرستنده <span style="color:var(--danger)">*</span></label>';
  const abbrInp = document.createElement('input');
  abbrInp.type = 'text';
  abbrInp.id = 'profileAbbrInput';
  abbrInp.placeholder = 'مثلاً م.احمدی';
  abbrInp.value = prof.senderAbbr || '';
  abbrInp.oninput = ()=>{
    if(!profileDraft) profileDraft = {...loadProfile()};
    profileDraft.senderAbbr = abbrInp.value;
    abbrInp.style.borderColor='';
  };
  abbrField.appendChild(abbrInp);
  const abbrHint = document.createElement('div');
  abbrHint.style.cssText = 'font-size:12px;color:var(--text-dim);margin-top:8px;line-height:1.5;';
  abbrHint.textContent = 'این مقدار از شما گرفته و در شماره نامه ذخیره می‌شود. نمونه: ۴۰۵۰۵۲۱ / م.احمدی / ۰۱';
  abbrField.appendChild(abbrHint);
  body.appendChild(abbrField);

  const sigField = document.createElement('div');
  sigField.className = 'profile-field';
  sigField.innerHTML = '<label>تصویر امضا</label>';
  const wrap = document.createElement('div');
  wrap.className = 'sig-preview-wrap';
  const preview = document.createElement('div');
  preview.className = 'sig-preview' + (prof.signature ? '' : ' empty');
  if(prof.signature){
    const im = document.createElement('img');
    im.src = prof.signature;
    im.alt = 'امضا';
    preview.appendChild(im);
  } else {
    preview.textContent = 'هنوز امضایی آپلود نشده';
  }
  wrap.appendChild(preview);
  const actions = document.createElement('div');
  actions.className = 'sig-actions';
  const fileInp = document.createElement('input');
  fileInp.type = 'file';
  fileInp.accept = 'image/*';
  fileInp.style.display = 'none';
  const upBtn = document.createElement('button');
  upBtn.className = 'restore-btn';
  upBtn.type = 'button';
  upBtn.textContent = prof.signature ? 'تعویض تصویر' : 'آپلود امضا';
  upBtn.onclick = ()=> fileInp.click();
  fileInp.onchange = async ()=>{
    const f = fileInp.files && fileInp.files[0];
    if(!f) return;
    try{
      showToast('در حال آماده‌سازی تصویر…');
      const dataUrl = await compressSignatureFile(f);
      if(!profileDraft) profileDraft = {...loadProfile()};
      profileDraft.signature = dataUrl;
      renderProfilePage();
      showToast('امضا آماده ذخیره است');
    }catch(err){
      showToast(err.message || 'خطا در آپلود');
    }
  };
  actions.appendChild(upBtn);
  actions.appendChild(fileInp);
  if(prof.signature){
    const delBtn = document.createElement('button');
    delBtn.className = 'perm-del-btn';
    delBtn.type = 'button';
    delBtn.textContent = 'حذف امضا';
    delBtn.onclick = ()=>{
      if(!profileDraft) profileDraft = {...loadProfile()};
      delete profileDraft.signature;
      renderProfilePage();
      showToast('حذف امضا آماده ذخیره است');
    };
    actions.appendChild(delBtn);
  }
  wrap.appendChild(actions);
  const tip = document.createElement('div');
  tip.style.cssText = 'font-size:12px;color:var(--text-dim);line-height:1.6;';
  tip.textContent = 'تصویر به‌صورت خودکار کوچک و فشرده می‌شود. ترجیحاً امضا روی زمینه سفید یا شفاف.';
  wrap.appendChild(tip);
  sigField.appendChild(wrap);
  body.appendChild(sigField);
}


document.getElementById('drawerProjectsBtn').onclick = ()=>{ closeDrawer(); openProjectsPage(); };
document.getElementById('drawerAddProjectBtn').onclick = ()=>{ closeDrawer(); openCreatePage(); };
document.getElementById('drawerGlobalTrashBtn').onclick = openGlobalTrashFromDrawer;
document.getElementById('closeProjectsPage').onclick = ()=>{ closeMenuRootPage(false); };

let managementProjectTab = 'all';

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
  if(data.activeTab===p.id){
    const next=data.projects.find(x=>!x.trashed&&!x.archived) || data.projects.find(x=>!x.trashed) || data.projects.find(x=>!x.archived);
    data.activeTab=next ? next.id : 'starred';
  }
  persist();
  return true;
}

function renderManagementPage(){
  const body = document.getElementById('projectsPageBody');
  if(!body) return;
  body.innerHTML = '';

  const visible = projectsVisibleForAuth(data.projects || []);
  const active = visible.filter(p => !p.trashed && !p.archived && !isPendingDeleted('project',p.id));
  const archived = visible.filter(p => p.archived && !p.trashed && !isPendingDeleted('project',p.id));
  const deleted = visible.filter(p => p.trashed || isPendingDeleted('project',p.id));
  const allCount = active.length + archived.length + deleted.length;

  const tabs=document.createElement('div');
  tabs.className='mgmt-project-tabs';
  const tabDefs=[['all','نمایش همه',allCount],['archived','آرشیو شده ها',archived.length],['deleted','حذف شده ها',deleted.length]];
  tabDefs.forEach(([key,label,count])=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='mgmt-project-tab'+(managementProjectTab===key?' active':'');
    const text=document.createElement('span'); text.textContent=label;
    const badge=document.createElement('span'); badge.className='mgmt-project-tab-count'; badge.textContent=count;
    b.appendChild(text); b.appendChild(badge);
    b.onclick=()=>{ managementProjectTab=key; renderManagementPage(); };
    tabs.appendChild(b);
  });
  body.appendChild(tabs);

  function makeRow(p, mode){
    const row=document.createElement('div'); row.className='mgmt-row'; row.dataset.dragId=p.id;
    const grip=document.createElement('span');
    grip.className='drag-grip';
    grip.innerHTML=svgGrip();
    grip.setAttribute('aria-label','جابجایی پروژه');
    grip.onpointerdown=(e)=>{
      e.stopPropagation(); e.preventDefault();
      const wrap=row.parentElement;
      if(wrap) startProjectMgmtDrag(e,p.id,row,wrap,mode);
    };
    row.appendChild(grip);
    const name=document.createElement('div'); name.className='mgmt-name'; name.textContent=p.name; row.appendChild(name);
    const undone=(p.tasks||[]).filter(t=>!t.done&&!t.trashed&&!isPendingDeleted('task',p.id,t.id)).length;
    if(undone && mode==='active'){ const count=document.createElement('span'); count.className='mgmt-count'; count.textContent=undone; row.appendChild(count); }
    const actions=document.createElement('div'); actions.className='mgmt-actions';

    if(mode==='active'){
      const editBtn=document.createElement('button'); editBtn.className='mgmt-icon-btn blue'; editBtn.title='ویرایش نام'; editBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
      editBtn.onclick=()=>openMiniPrompt('ویرایش نام پروژه',p.name,val=>{
        if(!val||!val.trim()) return;
        if(!window.KarhaApp?.projectApi?.rename?.(p.id,val.trim())?.ok) return;
        cloudRenameProject(findProject(p.id)||p);
        renderManagementPage(); renderAll();
      }); actions.appendChild(editBtn);

      const archBtn=document.createElement('button'); archBtn.className='mgmt-icon-btn'; archBtn.title='آرشیو'; archBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 6h14v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6zM2 4h16v2H2V4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 10h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
      archBtn.onclick=()=>{
        window.KarhaApp?.projectApi?.archive?.(p.id,true);
        if(data.activeTab===p.id)data.activeTab='starred';
        cloudSyncProjectStatus(findProject(p.id)||p);
        // مهم: در همان تب فعلی بمان؛ فقط محتوا و شمارنده‌ها تازه شوند.
        renderManagementPage(); renderAll(); showToast('پروژه آرشیو شد');
      }; actions.appendChild(archBtn);

      const pdfBtn=document.createElement('button'); pdfBtn.className='mgmt-icon-btn blue'; pdfBtn.title='خروجی PDF'; pdfBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 2h7l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 2v4h4M7 11h6M7 14h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'; pdfBtn.onclick=e=>{e.stopPropagation();openExportPage(p.id);}; actions.appendChild(pdfBtn);

      const delBtn=document.createElement('button'); delBtn.className='mgmt-icon-btn danger'; delBtn.title='حذف'; delBtn.innerHTML=svgTrash();
      delBtn.onclick=()=>openConfirm('آیا این پروژه حذف شود؟',()=>{
        softDelete('project',p.id,null,null,'پروژه حذف شد');
        // softDelete عمداً تب فعلی را تغییر نمی‌دهد.
        renderManagementPage();
      },'حذف'); actions.appendChild(delBtn);

    }else if(mode==='archived'){
      const restore=document.createElement('button'); restore.className='restore-btn'; restore.textContent='بازگردانی';
      restore.onclick=()=>{
        window.KarhaApp?.projectApi?.archive?.(p.id,false);
        cloudSyncProjectStatus(findProject(p.id)||p);
        renderManagementPage(); renderAll(); showToast('پروژه بازگردانده شد');
      };
      actions.appendChild(restore);

      const delBtn=document.createElement('button'); delBtn.className='perm-del-btn'; delBtn.textContent='حذف';
      delBtn.onclick=()=>openConfirm('آیا این پروژه حذف شود؟',()=>{
        softDelete('project',p.id,null,null,'پروژه حذف شد');
        renderManagementPage();
      },'حذف');
      actions.appendChild(delBtn);

    }else if(mode==='deleted'){
      const restore=document.createElement('button'); restore.className='restore-btn'; restore.textContent='بازگردانی';
      restore.onclick=()=>{
        if(isPendingDeleted('project',p.id)){
          undoPendingDelete();
        }else{
          p.trashed=false; cloudSyncProjectStatus(p); persist(); renderManagementPage(); renderAll(); showToast('پروژه بازگردانده شد');
        }
      }; actions.appendChild(restore);

      const perm=document.createElement('button'); perm.className='perm-del-btn'; perm.textContent='حذف همیشگی';
      perm.onclick=()=>openConfirm('این پروژه برای همیشه حذف شود؟ این عمل قابل بازگشت نیست.',async()=>{
        const ok=await permanentlyDeleteProject(p);
        if(ok){ renderManagementPage(); renderAll(); showToast('پروژه برای همیشه حذف شد'); }
      },'حذف همیشگی');
      actions.appendChild(perm);
    }
    row.appendChild(actions); return row;
  }

  function appendSection(title, items, mode){
    const titleEl=document.createElement('div'); titleEl.className='mgmt-project-section-title'; titleEl.textContent=title; body.appendChild(titleEl);
    if(!items.length){ const empty=document.createElement('div'); empty.className='mgmt-empty'; empty.textContent=mode==='active'?'پروژه فعالی وجود ندارد.':(mode==='archived'?'پروژه آرشیو شده‌ای وجود ندارد.':'پروژه حذف شده‌ای وجود ندارد.'); body.appendChild(empty); return; }
    const wrap=document.createElement('div'); wrap.className='mgmt-list-wrap'; items.forEach(p=>wrap.appendChild(makeRow(p,mode))); body.appendChild(wrap);
  }

  if(managementProjectTab==='all'){
    appendSection('پروژه‌های فعال',active,'active');
    appendSection('آرشیو شده ها',archived,'archived');
    appendSection('حذف شده ها',deleted,'deleted');
  }else if(managementProjectTab==='archived') appendSection('آرشیو شده ها',archived,'archived');
  else appendSection('حذف شده ها',deleted,'deleted');
}

function openProjectsPage(){
  menuRootMode='projects';
  managementProjectTab='all';
  // مدیریت پروژه‌ها یک سطح مستقل است؛ هوم پروژه‌ها مبنای بازگشت آن است.
  closeBottomPages();
  enterWorkspaceSurface();
  ensureHomeSelection();
  setBottomNavActive('Projects');
  pushMenuRootHistory('projects');
  showOnlyWorkspacePage('projectsPage');
  updateWorkspaceContextBar();
  renderManagementPage();
}


let projDragState = null;
function startProjectMgmtDrag(e,id,rowEl,containerEl,type){
  if(!containerEl || e.button===2) return;
  const siblingEls=Array.from(containerEl.querySelectorAll('.mgmt-row'));
  projDragState={id,type,siblingEls,hoverEl:null,hoverPos:null,rowEl,pointerId:e.pointerId};
  rowEl.classList.add('row-dragging');
  try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(_){}
  document.addEventListener('pointermove',onProjDragMove);
  document.addEventListener('pointerup',onProjDragEnd,{once:true});
  document.addEventListener('pointercancel',onProjDragEnd,{once:true});
}
function onProjDragMove(e){
  if(!projDragState) return;
  const others=projDragState.siblingEls.filter(el=>el!==projDragState.rowEl);
  let target=null,pos=null;
  for(const el of others){
    const r=el.getBoundingClientRect();
    if(e.clientY < r.top+r.height/2){ target=el;pos='before';break; }
  }
  if(!target && others.length){ target=others[others.length-1];pos='after'; }
  others.forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
  if(target) target.classList.add(pos==='before'?'drag-over-top':'drag-over-bottom');
  projDragState.hoverEl=target;
  projDragState.hoverPos=pos;
}
function onProjDragEnd(){
  if(!projDragState) return;
  document.removeEventListener('pointermove',onProjDragMove);
  document.removeEventListener('pointercancel',onProjDragEnd);
  const st=projDragState;
  st.rowEl.classList.remove('row-dragging');
  st.siblingEls.forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
  projDragState=null;

  const {id,type,hoverEl,hoverPos}=st;
  if(!hoverEl) return;
  const targetId=hoverEl.dataset.dragId;
  if(!targetId || targetId===id) return;

  const ids=data.projects
    .filter(p=>{
      if(type==='active') return !p.trashed&&!p.archived&&!isPendingDeleted('project',p.id);
      if(type==='archived') return p.archived&&!p.trashed&&!isPendingDeleted('project',p.id);
      if(type==='deleted') return (p.trashed||isPendingDeleted('project',p.id));
      return false;
    })
    .map(p=>p.id);

  const from=ids.indexOf(id), target=ids.indexOf(targetId);
  if(from<0 || target<0) return;
  ids.splice(from,1);
  let to=ids.indexOf(targetId);
  if(hoverPos==='after') to++;
  ids.splice(to,0,id);

  const movable=new Set(ids);
  const byId=new Map(data.projects.filter(p=>movable.has(p.id)).map(p=>[p.id,p]));
  let n=0;
  data.projects=data.projects.map(p=>movable.has(p.id)?byId.get(ids[n++]):p);

  persist();
  renderManagementPage();
  renderAll();
}

/* ---------- PDF export page (Phase 8.5: notes extracted; page UI still legacy-owned) ---------- */
let exportPid = null;
let exportSelected = new Set(); // keys: "t:"+tid or "s:"+tid+":"+sid
let exportShowCost = false;
let exportMarkMode = 'square'; // 'square' | 'number' — number فقط آیکون والد را عوض می‌کند

/* Phase 8.5: notes store owned by src/modules/export/exportNotesStore.js; export UI still legacy */
const EXPORT_NOTES_KEY = 'karha_export_notes_v1';
function loadExportNotes(){
  if(window.KarhaExportNotes?.loadExportNotes) return window.KarhaExportNotes.loadExportNotes();
  try{ return JSON.parse(localStorage.getItem(EXPORT_NOTES_KEY) || '{}') || {}; }catch(e){ return {}; }
}
function saveExportNote(pid, text){
  if(window.KarhaExportNotes?.saveExportNote) return window.KarhaExportNotes.saveExportNote(pid, text);
  const all = loadExportNotes();
  if(text && text.trim()) all[pid] = text;
  else delete all[pid];
  try{ localStorage.setItem(EXPORT_NOTES_KEY, JSON.stringify(all)); }catch(e){}
}
function getExportNote(pid){
  if(window.KarhaExportNotes?.getExportNote) return window.KarhaExportNotes.getExportNote(pid);
  return loadExportNotes()[pid] || '';
}

document.getElementById('closeExportPage').onclick = ()=>{
  document.getElementById('exportPage').classList.add('hidden');
  enterProjectsSurface();
};

function openExportPage(pid){
  const p = findProject(pid);
  if(!p) return;
  enterWorkspaceSurface();
  exportPid = pid;
  exportSelected = new Set();
  exportShowCost = false;
  exportMarkMode = 'square';
  // پیش‌فرض: همه موارد انتخاب
  p.tasks.forEach(t=>{
    if(t.trashed || isPendingDeleted('task', pid, t.id) || t.done) return;
    exportSelected.add('t:'+t.id);
    t.subtasks.forEach(s=>{
      if(s.trashed || isPendingDeleted('sub', pid, t.id, s.id) || s.done) return;
      exportSelected.add('s:'+t.id+':'+s.id);
    });
  });
  document.getElementById('exportPageTitle').textContent = 'خروجی: ' + p.name;
  const noteInp = document.getElementById('exportNoteInput');
  if(noteInp){
    noteInp.value = getExportNote(pid);
    noteInp.oninput = ()=> saveExportNote(pid, noteInp.value);
  }
  // سه چک‌باکس گزینه — پیش‌فرض خاموش
  const numCb = document.getElementById('exportNumberedCb');
  const costCb = document.getElementById('exportCostCb');
  const sigCb = document.getElementById('exportIncludeSig');
  const sigHint = document.getElementById('exportSigHint');
  if(numCb){ numCb.checked = false; numCb.onchange = ()=>{ exportMarkMode = numCb.checked ? 'number' : 'square'; }; }
  if(costCb){ costCb.checked = false; costCb.onchange = ()=>{ exportShowCost = costCb.checked; renderExportPage(); }; }
  const prof = loadProfile();
  if(sigCb){
    const canSig = !!(prof.name && prof.signature);
    sigCb.checked = false;
    sigCb.disabled = !canSig;
    if(sigHint) sigHint.textContent = canSig ? '' : 'برای امضا: منو → ثبت مشخصات';
  }
  document.getElementById('exportPage').classList.remove('hidden');
  renderExportPage();
}

function renderExportPage(){
  const p = findProject(exportPid);
  if(!p) return;
  const toolbar = document.getElementById('exportToolbar');
  const body = document.getElementById('exportPageBody');
  toolbar.innerHTML = '';
  body.innerHTML = '';

  // همگام‌سازی وضعیت از چک‌باکس‌های ثابت
  const numCb = document.getElementById('exportNumberedCb');
  const costCb = document.getElementById('exportCostCb');
  if(numCb) exportMarkMode = numCb.checked ? 'number' : 'square';
  if(costCb) exportShowCost = costCb.checked;

  const allKeys = [];
  p.tasks.forEach(t=>{
    if(t.trashed || isPendingDeleted('task', exportPid, t.id) || t.done) return;
    allKeys.push('t:'+t.id);
    t.subtasks.forEach(s=>{
      if(s.trashed || isPendingDeleted('sub', exportPid, t.id, s.id) || s.done) return;
      allKeys.push('s:'+t.id+':'+s.id);
    });
  });
  const allChecked = allKeys.length > 0 && allKeys.every(k => exportSelected.has(k));

  // راست: فقط چک‌باکس انتخاب همه (آبی درشت)
  const allWrap = document.createElement('label');
  allWrap.className = 'export-check-all-wrap';
  const allCb = document.createElement('input');
  allCb.type = 'checkbox';
  allCb.checked = allChecked;
  allCb.onchange = ()=>{
    if(allCb.checked) allKeys.forEach(k => exportSelected.add(k));
    else exportSelected.clear();
    renderExportPage();
  };
  allWrap.appendChild(allCb);
  allWrap.appendChild(document.createTextNode('همه'));
  toolbar.appendChild(allWrap);

  // چپ: PDF و JPEG
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'export-actions';
  const pdfBtn = document.createElement('button');
  pdfBtn.className = 'export-pdf-btn';
  pdfBtn.textContent = 'PDF';
  pdfBtn.onclick = ()=> generateProjectPdf();
  actionsWrap.appendChild(pdfBtn);
  const jpgBtn = document.createElement('button');
  jpgBtn.className = 'export-jpg-btn';
  jpgBtn.textContent = 'JPEG';
  jpgBtn.onclick = ()=> generateProjectJpeg();
  actionsWrap.appendChild(jpgBtn);
  toolbar.appendChild(actionsWrap);

  if(exportShowCost){
    let sum = 0;
    p.tasks.forEach(t=>{
      if(t.trashed || isPendingDeleted('task', exportPid, t.id) || t.done) return;
      if(exportSelected.has('t:'+t.id)) sum += parseFloat(t.cost)||0;
      t.subtasks.forEach(s=>{
        if(s.trashed || isPendingDeleted('sub', exportPid, t.id, s.id) || s.done) return;
        if(exportSelected.has('s:'+t.id+':'+s.id)) sum += parseFloat(s.cost)||0;
      });
    });
    const sumEl = document.createElement('div');
    sumEl.className = 'export-summary';
    sumEl.innerHTML = '<span>جمع موارد انتخاب‌شده</span><span class="cost-sum-val"><span class="cost-unit">تومان</span> '+formatCost(sum)+'</span>';
    body.appendChild(sumEl);
  }

  const tasks = p.tasks.filter(t => !t.trashed && !isPendingDeleted('task', exportPid, t.id) && !t.done);
  if(!tasks.length){
    body.appendChild(elFromHtml('<div class="mgmt-empty">مورد باز (ناتمام) برای خروجی نیست.</div>'));
    return;
  }

  tasks.forEach(t=>{
    const tKey = 't:'+t.id;
    const row = document.createElement('div');
    row.className = 'export-row' + (t.done ? ' done' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'exp-check';
    cb.checked = exportSelected.has(tKey);
    cb.onchange = ()=>{
      if(cb.checked){
        exportSelected.add(tKey);
        t.subtasks.forEach(s=>{
          if(!s.trashed && !isPendingDeleted('sub', exportPid, t.id, s.id) && !s.done)
            exportSelected.add('s:'+t.id+':'+s.id);
        });
      } else {
        exportSelected.delete(tKey);
        t.subtasks.forEach(s=> exportSelected.delete('s:'+t.id+':'+s.id));
      }
      renderExportPage();
    };
    row.appendChild(cb);
    const bodyEl = document.createElement('div');
    bodyEl.className = 'exp-body';
    const title = document.createElement('div');
    title.className = 'exp-title';
    title.textContent = t.text;
    bodyEl.appendChild(title);
    row.appendChild(bodyEl);
    if(exportShowCost){
      const c = document.createElement('span');
      c.className = 'row-cost';
      c.innerHTML = '<span class="cost-unit">تومان</span> '+formatCost(Number(t.cost)||0);
      row.appendChild(c);
    }
    body.appendChild(row);

    t.subtasks.filter(s => !s.trashed && !isPendingDeleted('sub', exportPid, t.id, s.id) && !s.done).forEach(s=>{
      const sKey = 's:'+t.id+':'+s.id;
      const srow = document.createElement('div');
      srow.className = 'export-row sub' + (s.done ? ' done' : '');
      const scb = document.createElement('input');
      scb.type = 'checkbox';
      scb.className = 'exp-check';
      scb.checked = exportSelected.has(sKey);
      scb.onchange = ()=>{
        if(scb.checked) exportSelected.add(sKey);
        else exportSelected.delete(sKey);
        renderExportPage();
      };
      srow.appendChild(scb);
      const sbody = document.createElement('div');
      sbody.className = 'exp-body';
      const st = document.createElement('div');
      st.className = 'exp-title';
      st.textContent = s.text;
      sbody.appendChild(st);
      srow.appendChild(sbody);
      if(exportShowCost && s.cost){
        const c = document.createElement('span');
        c.className = 'row-cost';
        c.innerHTML = '<span class="cost-unit">تومان</span> '+formatCost(s.cost);
        srow.appendChild(c);
      }
      body.appendChild(srow);
    });
  });
}

function generateProjectPdf(){
  const p = findProject(exportPid);
  if(!p) return;
  if(!exportSelected.size){
    showToast('حداقل یک مورد را انتخاب کنید');
    return;
  }
  const numCb = document.getElementById('exportNumberedCb');
  const costCb = document.getElementById('exportCostCb');
  if(numCb) exportMarkMode = numCb.checked ? 'number' : 'square';
  if(costCb) exportShowCost = costCb.checked;

  function amountHtml(n){
    if(n===null || n===undefined || n==='' || Number(n)===0) return '';
    // مثل تب پروژه: تومان سمت چپ + JetBrains Mono
    return '<span class="row-cost"><span class="cost-unit">تومان</span> '+formatCost(n)+'</span>';
  }

  // only incomplete items
  const tasks = p.tasks.filter(t => !t.trashed && !isPendingDeleted('task', exportPid, t.id) && !t.done);
  let rowsHtml = '';
  let total = 0;

  let parentNum = 0;
  tasks.forEach(t=>{
    const tKey = 't:'+t.id;
    const tOn = exportSelected.has(tKey);
    const subs = t.subtasks.filter(s => !s.trashed && !isPendingDeleted('sub', exportPid, t.id, s.id) && !s.done);
    const anySubOn = subs.some(s => exportSelected.has('s:'+t.id+':'+s.id));

    if(!tOn && !anySubOn) return;

    if(tOn){
      if(exportShowCost) total += parseFloat(t.cost)||0;
      const costCell = exportShowCost
        ? '<td class="cost-cell">'+amountHtml(t.cost!=null?t.cost:0)+'</td>'
        : '';
      // شماره فقط آیکون والد را عوض می‌کند؛ فرزندان همیشه □
      let markCell;
      if(exportMarkMode === 'number'){
        parentNum += 1;
        markCell = '<td class="mark parent-num">'+toPersianDigits(String(parentNum))+'</td>';
      } else {
        markCell = '<td class="mark parent-mark">■</td>';
      }
      rowsHtml += '<tr>'
        + markCell
        + '<td class="title parent-title">'+escapeHtml(t.text)+'</td>'
        + costCell + '</tr>';
    } else if(anySubOn){
      let markCell;
      if(exportMarkMode === 'number'){
        parentNum += 1;
        markCell = '<td class="mark parent-num">'+toPersianDigits(String(parentNum))+'</td>';
      } else {
        markCell = '<td class="mark parent-mark">■</td>';
      }
      rowsHtml += '<tr class="context">'
        + markCell
        + '<td class="title parent-title">'+escapeHtml(t.text)+'</td>'
        + (exportShowCost?'<td class="cost-cell"></td>':'') + '</tr>';
    }

    subs.forEach(s=>{
      if(!exportSelected.has('s:'+t.id+':'+s.id)) return;
      if(exportShowCost) total += parseFloat(s.cost)||0;
      const costCell = exportShowCost
        ? '<td class="cost-cell">'+(s.cost!=null&&s.cost!==''?amountHtml(s.cost):'')+'</td>'
        : '';
      rowsHtml += '<tr class="sub">'
        + '<td class="mark child-mark" style="padding-right:28px;">□</td>'
        + '<td class="title child-title">'+escapeHtml(s.text)+'</td>'
        + costCell + '</tr>';
    });
  });

  const dateStr = new Date().toLocaleDateString('fa-IR');
  const costHeader = exportShowCost
    ? '<th class="cost-head">مبلغ</th>'
    : '';
  const totalRow = exportShowCost
    ? '<tr class="total-row"><td></td><td class="title">جمع کل</td><td class="cost-cell">'+amountHtml(total)+'</td></tr>'
    : '';
  const noteText = ((document.getElementById('exportNoteInput') && document.getElementById('exportNoteInput').value) || '').trim();
  saveExportNote(exportPid, noteText);
  const noteHtml = noteText
    ? '<div class="pdf-note">'+escapeHtml(noteText).replace(/\n/g,'<br>')+'</div>'
    : '';
  const prof = loadProfile();
  const wantSig = document.getElementById('exportIncludeSig') && document.getElementById('exportIncludeSig').checked;
  const sigHtml = (wantSig && prof.signature && prof.name)
    ? '<div class="pdf-sig"><img src="'+prof.signature+'" alt="امضا"><div class="pdf-sig-name">'+escapeHtml(prof.name)+'</div></div>'
    : '';

  const doc = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><title>${escapeHtml(p.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  @page { margin: 14mm; }
  body { font-family: 'IRANYekan', IRANYekan, Vazirmatn, Tahoma, sans-serif; color: #202124; margin: 0; padding: 8px 4px; }
  .pdf-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0; font-weight: 700; flex: 1; text-align: right; }
  .meta { font-size: 12px; color: #5f6368; margin: 0; flex-shrink: 0; text-align: left; direction: rtl; white-space: nowrap; }
  .pdf-note { margin-top: 22px; padding-top: 14px; border-top: 1px solid #e8eaed; font-size: 13.5px; line-height: 1.7; color: #00075D; white-space: pre-wrap; }
  .pdf-sig { margin-top: 28px; text-align: left; direction: ltr; }
  .pdf-sig img { max-width: 180px; max-height: 70px; object-fit: contain; display: block; margin-left: 0; }
  .pdf-sig-name { margin-top: 4px; font-size: 11px; font-weight: 500; color: #5f6368; text-align: left; direction: rtl; unicode-bidi: isolate; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: right; padding: 8px 6px; border-bottom: 2px solid #202124; font-size: 12px; color: #5f6368; font-weight: 600; }
  th.cost-head { text-align: left; direction: ltr; unicode-bidi: isolate; }
  th.cost-head .unit { font-weight: 500; margin-right: 4px; }
  td { padding: 7px 6px; vertical-align: top; border-bottom: 1px solid #e8eaed; }
  td.mark { width: 36px; text-align: center; font-size: 14px; line-height: 1.4; color: #202124; }
  td.parent-mark { font-size: 13px; }
  td.parent-num {
    font-family: 'IRANYekan', IRANYekan, Vazirmatn, Tahoma, sans-serif;
    font-size: 16px; font-weight: 700; color: #202124;
    text-align: center; width: 40px;
  }
  td.child-mark { font-size: 14px; color: #5f6368; padding-right: 28px; }
  td.title { font-size: 14px; line-height: 1.45; }
  td.parent-title { font-weight: 700; }
  td.child-title { font-size: 13.5px; padding-right: 28px; color: #3c4043; }
  td.cost-cell { text-align: left; white-space: nowrap; }
  .row-cost {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12.5px;
    font-weight: 600;
    color: #202124;
    direction: ltr;
    unicode-bidi: isolate;
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
  }
  .row-cost .cost-unit {
    font-family: 'IRANYekan', IRANYekan, Vazirmatn, Tahoma, sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: #5f6368;
  }
  tr.total-row .row-cost { font-size: 14px; }
  tr.done td.title { color: #5f6368; text-decoration: line-through; }
  tr.context td.title { color: #5f6368; font-weight: 600; }
  tr.total-row td {
    border-bottom: none;
    border-top: 2px solid #202124;
    padding-top: 12px;
    font-weight: 700;
  }
  tr.total-row .amount { font-size: 16px; color: #202124; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  /* ---------- صورت وضعیت ---------- */
  .st-form{padding:0 0 90px;}
  .st-row{
    padding:14px 16px;background:var(--surface);border-bottom:1px solid var(--divider);
    min-height:52px;display:flex;align-items:center;
  }
  .st-row input.st-inp, .st-row textarea.st-inp{
    width:100%;border:none;outline:none;background:transparent;font-family:inherit;
    font-size:15px;color:var(--text);text-align:right;direction:rtl;
  }
  .st-row input.st-inp::placeholder, .st-row textarea.st-inp::placeholder{color:#b0b3b8;}
  .st-row textarea.st-inp{resize:none;min-height:44px;line-height:1.5;padding:0;}
  .st-row.st-tap{cursor:pointer;}
  .st-row .st-val{width:100%;font-size:15px;color:var(--text);text-align:right;}
  .st-row .st-val.placeholder{color:#b0b3b8;}
  .st-section-title{padding:12px 16px 4px;font-size:12px;color:var(--text-dim);background:var(--bg);}
  .st-pay-block{padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--divider);}
  .st-pay-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;font-size:14px;color:var(--text);}
  .st-pay-line input[type="text"]{
    flex:1;min-width:120px;border:none;border-bottom:1px solid var(--divider);outline:none;
    background:transparent;font-family:inherit;font-size:14px;padding:6px 4px;color:var(--text);
  }
  .st-pay-line label.chk{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--text);cursor:pointer;}
  .st-pay-line input[type="checkbox"]{width:18px;height:18px;accent-color:var(--green);}
  .st-save-bar{
    position:sticky;bottom:0;padding:12px 16px;background:var(--bg);
    border-top:1px solid var(--divider);display:flex;gap:10px;
  }
  .st-save-bar button{
    flex:1;border:none;border-radius:12px;padding:14px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;
  }
  .st-save-bar .st-save{background:var(--green);color:#fff;}
  .st-save-bar .st-export{background:#202124;color:#fff;}
  .jalali-pop{
    position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:80;display:flex;align-items:center;justify-content:center;padding:20px;
  }
  .jalali-pop.hidden{display:none;}
  .jalali-box{
    background:#fff;border-radius:14px;padding:14px 12px 16px;width:min(320px,100%);
    box-shadow:0 12px 40px rgba(0,0,0,.18);
  }
  .jalali-head{display:flex;align-items:center;justify-content:space-between;direction:ltr;margin-bottom:10px;color:var(--green);font-weight:700;font-size:15px;} .jalali-head span{direction:rtl;}
  .jalali-head button{border:none;background:transparent;color:var(--green);font-size:18px;cursor:pointer;padding:4px 10px;}
  .jalali-week{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:12px;color:var(--text-dim);margin-bottom:6px;}
  .jalali-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;}
  .jalali-days button{
    border:none;background:transparent;font-family:inherit;font-size:14px;padding:8px 0;border-radius:50%;cursor:pointer;color:var(--text);
  }
  .jalali-days button.today{font-weight:700;}
  .jalali-days button.selected{background:var(--green);color:#fff;}
  .jalali-days button.muted{color:#c4c7c5;pointer-events:none;}
  .st-list-row{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--divider);background:var(--surface);}
  .st-list-row .st-list-body{flex:1;min-width:0;}
  .st-list-row .st-list-title{font-size:15px;font-weight:600;color:var(--text);}
  .st-list-row .st-list-meta{font-size:12px;color:var(--text-dim);margin-top:3px;}

</style><meta name="karha-build" content="210">
</head><body>
  <div class="pdf-top">
    <h1>${escapeHtml(p.name)}</h1>
    <div class="meta">تاریخ: ${dateStr}</div>
  </div>
  <table>
    <thead><tr>
      <th style="width:28px;"></th>
      <th>مورد</th>
      ${costHeader}
    </tr></thead>
    <tbody>${rowsHtml}${totalRow}</tbody>
  </table>
  ${noteHtml}
  ${sigHtml}
  <script>
    window.onload = function(){
      setTimeout(function(){ window.print(); }, 450);
    };
  <\/script>


<!-- status form save action fixed: bottom above footer -->
<!-- VERSION 134 -->




<\/body><\/html>`;

  const w = window.open('', '_blank');
  if(!w){
    showToast('اجازهٔ باز شدن پنجره را بدهید');
    return;
  }
  w.document.open();
  w.document.write(doc);
  w.document.close();
}

/** یک تصویر JPEG بلند از کل محتوای خروجی */
async function generateProjectJpeg(){
  const p = findProject(exportPid);
  if(!p) return;
  if(!exportSelected.size){
    showToast('حداقل یک مورد را انتخاب کنید');
    return;
  }
  const numCb = document.getElementById('exportNumberedCb');
  const costCb = document.getElementById('exportCostCb');
  if(numCb) exportMarkMode = numCb.checked ? 'number' : 'square';
  if(costCb) exportShowCost = costCb.checked;
  if(typeof html2canvas !== 'function'){
    showToast('بارگذاری ابزار تصویر ناموفق بود — اینترنت را بررسی کنید');
    return;
  }

  function amountHtml(n){
    if(n===null || n===undefined || n==='' || Number(n)===0) return '';
    return '<span class="row-cost"><span class="cost-unit">تومان</span> '+formatCost(n)+'</span>';
  }
  const tasks = p.tasks.filter(t => !t.trashed && !isPendingDeleted('task', exportPid, t.id) && !t.done);
  let rowsHtml = '';
  let total = 0;
  let parentNum = 0;
  tasks.forEach(t=>{
    const tKey = 't:'+t.id;
    const tOn = exportSelected.has(tKey);
    const subs = t.subtasks.filter(s => !s.trashed && !isPendingDeleted('sub', exportPid, t.id, s.id) && !s.done);
    const anySubOn = subs.some(s => exportSelected.has('s:'+t.id+':'+s.id));
    if(!tOn && !anySubOn) return;
    if(tOn){
      if(exportShowCost) total += parseFloat(t.cost)||0;
      const costCell = exportShowCost ? '<td class="cost-cell">'+amountHtml(t.cost!=null?t.cost:0)+'</td>' : '';
      let markCell;
      if(exportMarkMode === 'number'){ parentNum += 1; markCell = '<td class="mark parent-num">'+toPersianDigits(String(parentNum))+'</td>'; }
      else markCell = '<td class="mark parent-mark">■</td>';
      rowsHtml += '<tr>'+markCell+'<td class="title parent-title">'+escapeHtml(t.text)+'</td>'+costCell+'</tr>';
    } else if(anySubOn){
      let markCell;
      if(exportMarkMode === 'number'){ parentNum += 1; markCell = '<td class="mark parent-num">'+toPersianDigits(String(parentNum))+'</td>'; }
      else markCell = '<td class="mark parent-mark">■</td>';
      rowsHtml += '<tr class="context">'+markCell+'<td class="title parent-title">'+escapeHtml(t.text)+'</td>'+(exportShowCost?'<td class="cost-cell"></td>':'')+'</tr>';
    }
    subs.forEach(s=>{
      if(!exportSelected.has('s:'+t.id+':'+s.id)) return;
      if(exportShowCost) total += parseFloat(s.cost)||0;
      const costCell = exportShowCost ? '<td class="cost-cell">'+(s.cost!=null&&s.cost!==''?amountHtml(s.cost):'')+'</td>' : '';
      rowsHtml += '<tr class="sub"><td class="mark child-mark" style="padding-right:28px;">□</td><td class="title child-title">'+escapeHtml(s.text)+'</td>'+costCell+'</tr>';
    });
  });
  const dateStr = new Date().toLocaleDateString('fa-IR');
  const costHeader = exportShowCost ? '<th class="cost-head">مبلغ</th>' : '';
  const totalRow = exportShowCost ? '<tr class="total-row"><td></td><td class="title">جمع کل</td><td class="cost-cell">'+amountHtml(total)+'</td></tr>' : '';
  const noteText = ((document.getElementById('exportNoteInput') && document.getElementById('exportNoteInput').value) || '').trim();
  saveExportNote(exportPid, noteText);
  const noteHtml = noteText ? '<div class="pdf-note">'+escapeHtml(noteText).replace(/\n/g,'<br>')+'</div>' : '';
  const prof = loadProfile();
  const wantSig = document.getElementById('exportIncludeSig') && document.getElementById('exportIncludeSig').checked;
  const sigHtml = (wantSig && prof.signature && prof.name)
    ? '<div class="pdf-sig"><img src="'+prof.signature+'" alt="امضا"><div class="pdf-sig-name">'+escapeHtml(prof.name)+'</div></div>'
    : '';

  const wrap = document.createElement('div');
  wrap.id = 'jpegExportCapture';
  wrap.setAttribute('dir', 'rtl');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;padding:28px 24px;background:#fff;color:#202124;font-family:Vazirmatn,Tahoma,sans-serif;box-sizing:border-box;z-index:-1;';
  wrap.innerHTML = `
    <style>
      #jpegExportCapture .pdf-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;}
      #jpegExportCapture h1{font-size:22px;margin:0;font-weight:700;flex:1;text-align:right;}
      #jpegExportCapture .meta{font-size:13px;color:#5f6368;margin:0;white-space:nowrap;}
      #jpegExportCapture table{width:100%;border-collapse:collapse;}
      #jpegExportCapture th{text-align:right;padding:8px 6px;border-bottom:2px solid #202124;font-size:12px;color:#5f6368;}
      #jpegExportCapture th.cost-head{text-align:left;}
      #jpegExportCapture td{padding:8px 6px;vertical-align:top;border-bottom:1px solid #e8eaed;font-size:14px;}
      #jpegExportCapture td.mark{width:40px;text-align:center;}
      #jpegExportCapture td.parent-num{font-size:16px;font-weight:700;}
      #jpegExportCapture td.parent-title{font-weight:700;}
      #jpegExportCapture td.child-title{font-size:13.5px;padding-right:28px;color:#3c4043;}
      #jpegExportCapture td.cost-cell{text-align:left;white-space:nowrap;}
      #jpegExportCapture .row-cost{font-family:JetBrains Mono,monospace;font-size:12.5px;font-weight:600;direction:ltr;unicode-bidi:isolate;display:inline-flex;gap:4px;align-items:baseline;}
      #jpegExportCapture .cost-unit{font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;font-weight:500;color:#5f6368;}
      #jpegExportCapture tr.total-row td{border-bottom:none;border-top:2px solid #202124;padding-top:12px;font-weight:700;}
      #jpegExportCapture .pdf-note{margin-top:22px;padding-top:14px;border-top:1px solid #e8eaed;font-size:13.5px;line-height:1.7;color:#00075D;white-space:pre-wrap;}
      #jpegExportCapture .pdf-sig{margin-top:28px;text-align:left;direction:ltr;}
      #jpegExportCapture .pdf-sig img{max-width:180px;max-height:70px;object-fit:contain;display:block;}
      #jpegExportCapture .pdf-sig-name{margin-top:4px;font-size:11px;font-weight:500;color:#5f6368;text-align:left;direction:rtl;unicode-bidi:isolate;}
    
  /* ---------- صورت وضعیت ---------- */
  .st-form{padding:0 0 90px;}
  .st-row{
    padding:14px 16px;background:var(--surface);border-bottom:1px solid var(--divider);
    min-height:52px;display:flex;align-items:center;
  }
  .st-row input.st-inp, .st-row textarea.st-inp{
    width:100%;border:none;outline:none;background:transparent;font-family:inherit;
    font-size:15px;color:var(--text);text-align:right;direction:rtl;
  }
  .st-row input.st-inp::placeholder, .st-row textarea.st-inp::placeholder{color:#b0b3b8;}
  .st-row textarea.st-inp{resize:none;min-height:44px;line-height:1.5;padding:0;}
  .st-row.st-tap{cursor:pointer;}
  .st-row .st-val{width:100%;font-size:15px;color:var(--text);text-align:right;}
  .st-row .st-val.placeholder{color:#b0b3b8;}
  .st-section-title{padding:12px 16px 4px;font-size:12px;color:var(--text-dim);background:var(--bg);}
  .st-pay-block{padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--divider);}
  .st-pay-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;font-size:14px;color:var(--text);}
  .st-pay-line input[type="text"]{
    flex:1;min-width:120px;border:none;border-bottom:1px solid var(--divider);outline:none;
    background:transparent;font-family:inherit;font-size:14px;padding:6px 4px;color:var(--text);
  }
  .st-pay-line label.chk{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--text);cursor:pointer;}
  .st-pay-line input[type="checkbox"]{width:18px;height:18px;accent-color:var(--green);}
  .st-save-bar{
    position:sticky;bottom:0;padding:12px 16px;background:var(--bg);
    border-top:1px solid var(--divider);display:flex;gap:10px;
  }
  .st-save-bar button{
    flex:1;border:none;border-radius:12px;padding:14px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;
  }
  .st-save-bar .st-save{background:var(--green);color:#fff;}
  .st-save-bar .st-export{background:#202124;color:#fff;}
  .jalali-pop{
    position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:80;display:flex;align-items:center;justify-content:center;padding:20px;
  }
  .jalali-pop.hidden{display:none;}
  .jalali-box{
    background:#fff;border-radius:14px;padding:14px 12px 16px;width:min(320px,100%);
    box-shadow:0 12px 40px rgba(0,0,0,.18);
  }
  .jalali-head{display:flex;align-items:center;justify-content:space-between;direction:ltr;margin-bottom:10px;color:var(--green);font-weight:700;font-size:15px;} .jalali-head span{direction:rtl;}
  .jalali-head button{border:none;background:transparent;color:var(--green);font-size:18px;cursor:pointer;padding:4px 10px;}
  .jalali-week{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:12px;color:var(--text-dim);margin-bottom:6px;}
  .jalali-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;}
  .jalali-days button{
    border:none;background:transparent;font-family:inherit;font-size:14px;padding:8px 0;border-radius:50%;cursor:pointer;color:var(--text);
  }
  .jalali-days button.today{font-weight:700;}
  .jalali-days button.selected{background:var(--green);color:#fff;}
  .jalali-days button.muted{color:#c4c7c5;pointer-events:none;}
  .st-list-row{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--divider);background:var(--surface);}
  .st-list-row .st-list-body{flex:1;min-width:0;}
  .st-list-row .st-list-title{font-size:15px;font-weight:600;color:var(--text);}
  .st-list-row .st-list-meta{font-size:12px;color:var(--text-dim);margin-top:3px;}

</style>
    <div class="pdf-top"><h1>${escapeHtml(p.name)}</h1><div class="meta">تاریخ: ${dateStr}</div></div>
    <table><thead><tr><th style="width:28px;"></th><th>مورد</th>${costHeader}</tr></thead>
    <tbody>${rowsHtml}${totalRow}</tbody></table>
    ${noteHtml}${sigHtml}`;
  document.body.appendChild(wrap);

  showToast('در حال ساخت تصویر…');
  try{
    // صبر کوتاه برای لود فونت/تصویر امضا
    await new Promise(r => setTimeout(r, 200));
    const canvas = await html2canvas(wrap, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: 800
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const a = document.createElement('a');
    const safeName = (p.name || 'export').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    a.href = dataUrl;
    a.download = safeName + '.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('تصویر JPEG ذخیره شد');
  }catch(err){
    console.error(err);
    showToast('ساخت تصویر ناموفق بود');
  }finally{
    wrap.remove();
  }
}


function escapeHtml(str){
  return String(str||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}



/* ---------- collaborations / share (Phase 8.1 condemned runtime removed) ---------- */
/* Runtime/UI path for share & collab removed. Firestore fields like sharedWith are NOT wiped. */
function openCollabPage(){ try{ showToast('همکاری در این نسخه حذف شده است'); }catch(e){} }
function closeCollabPage(){
  workspaceSubpage = null;
  mainSurface = 'workspace';
  const settingsPage = document.getElementById('settingsPage');
  if(settingsPage){
    setBottomNavActive('Settings');
    renderTabs();
    showOnlyWorkspacePage('settingsPage');
    renderSettingsWorkspace();
    updateWorkspaceContextBar();
  } else {
    refreshCurrentFooterPage();
  }
}
function renderCollabPage(){ /* no-op: collab DOM removed */ }
function removeShare(){ return; }
function openShareForm(pid){ try{ showToast('اشتراک‌گذاری در این نسخه حذف شده است'); }catch(e){} }
function submitShareForm(){ return; }
function closeShareForm(){ return; }
function requestCloseShareForm(){ return; }
function openShareDialog(){ return; }
function closeShareDialog(){
  const ov = document.getElementById('shareOverlay');
  if(ov) ov.classList.add('hidden');
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


/* ==================== صورت وضعیت (مستقل از پروژه) ==================== */
/* ---------- normalized project domains for future reporting ---------- */
function makePurchaseRecord(projectId, taskId, item={}){ return { id:uid(), projectId, taskId, item:'', quantity:null, unit:'', estimatedUnitPrice:null, actualUnitPrice:null, status:'pending', notes:'', createdAt:Date.now(), ...item, schemaVersion:DATA_SCHEMA_VERSION }; }
function makeEstimateRecord(projectId, taskId, item={}){ return { id:uid(), projectId, taskId, title:'', quantity:null, unit:'', unitPrice:null, total:null, notes:'', createdAt:Date.now(), ...item, schemaVersion:DATA_SCHEMA_VERSION }; }
function makeTaskReportRecord(projectId, taskId, item={}){ return { id:uid(), projectId, taskId, reportDate:null, status:null, percent:null, notes:'', createdAt:Date.now(), ...item, schemaVersion:DATA_SCHEMA_VERSION }; }
async function addPurchaseRecord(record){
  if(!cloudMode || !currentUser) throw new Error('cloud-required');
  const r = {...record, schemaVersion:DATA_SCHEMA_VERSION};
  await purchaseCollection(r.projectId).doc(r.id).set(r);
  return r;
}
async function addEstimateRecord(record){
  if(!cloudMode || !currentUser) throw new Error('cloud-required');
  const r = {...record, schemaVersion:DATA_SCHEMA_VERSION};
  await estimateCollection(r.projectId).doc(r.id).set(r);
  return r;
}
async function addTaskReportRecord(record){
  if(!cloudMode || !currentUser) throw new Error('cloud-required');
  const r = {...record, schemaVersion:DATA_SCHEMA_VERSION};
  await taskReportCollection(r.projectId).doc(r.id).set(r);
  return r;
}
async function listTaskDomainRecords(projectId, domain){
  const col = domain==='purchases' ? purchaseCollection(projectId) : domain==='estimates' ? estimateCollection(projectId) : taskReportCollection(projectId);
  const snap = await col.get();
  return snap.docs.map(d=>d.data());
}


const STATUS_KEY = 'karha_status_reports_v1';
let statusEditingId = null;
let statusFormState = null;
let jalaliPick = { y:1404, m:1, onPick:null };

function loadStatusReports(){
  try{ return JSON.parse(localStorage.getItem(STATUS_KEY)||'[]') || []; }catch(e){ return []; }
}
function saveStatusReports(list){
  try{ localStorage.setItem(STATUS_KEY, JSON.stringify(list)); }catch(e){ showToast('ذخیره ممکن نشد'); }
}

/* --- Jalali helpers (Phase 8.2: owned by src/ui/jalali.js via KarhaUI) --- */
function gregorianToJalali(gy, gm, gd){ return window.KarhaUI?.gregorianToJalali?.(gy,gm,gd); }
function jalaliToGregorian(jy, jm, jd){ return window.KarhaUI?.jalaliToGregorian?.(jy,jm,jd); }
function jalaliMonthLength(jy, jm){ return window.KarhaUI?.jalaliMonthLength?.(jy,jm) ?? 29; }
function todayJalaliStr(){ return window.KarhaUI?.todayJalaliStr ? window.KarhaUI.todayJalaliStr() : ''; }
function formatJalaliDisplay(str){ return window.KarhaUI?.formatJalaliDisplay ? window.KarhaUI.formatJalaliDisplay(str) : (str||''); }
function openJalaliPicker(current, onPick, opts){ return window.KarhaUI?.openJalaliPicker?.(current, onPick, opts); }
function closeJalaliPicker(fromPopState=false){ return window.KarhaUI?.closeJalaliPicker?.(fromPopState); }
/* picker DOM binds + popstate installed by installUiPrimitives */

/* ---------- شماره نامه خودکار: YYMMDD / اختصار / شمارنده روزانه ---------- */
const LETTER_COUNTER_KEY = 'karha_letter_counters_v1';

function jalaliCompactYYMMDD(jDateStr){
  let jy, jm, jd;
  if(jDateStr && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(jDateStr)){
    const p = jDateStr.split('/');
    jy = +p[0]; jm = +p[1]; jd = +p[2];
  } else {
    const n = new Date();
    const j = gregorianToJalali(n.getFullYear(), n.getMonth()+1, n.getDate());
    jy = j.jy; jm = j.jm; jd = j.jd;
  }
  const yy = String(jy % 1000);
  const mm = String(jm).padStart(2,'0');
  const dd = String(jd).padStart(2,'0');
  return yy + mm + dd;
}

function getStatusProjectIdForCounter(projectId){
  const pid = projectId || (statusFormState && statusFormState.projectId) || (data.activeTab !== 'starred' ? data.activeTab : null);
  return pid ? String(pid) : '';
}
function letterCounterStorageKey(compactDate, projectId){
  return String(compactDate) + '::' + getStatusProjectIdForCounter(projectId);
}
function loadLetterCounters(){
  try{ return JSON.parse(localStorage.getItem(LETTER_COUNTER_KEY) || '{}') || {}; }catch(e){ return {}; }
}
function saveLetterCounters(map){
  try{ localStorage.setItem(LETTER_COUNTER_KEY, JSON.stringify(map)); }catch(e){}
}
function getLocalMaxCounter(compactDate, projectId){
  const key = letterCounterStorageKey(compactDate, projectId);
  const n = parseInt(loadLetterCounters()[key], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function setLocalCounter(compactDate, projectId, n){
  const map = loadLetterCounters();
  map[letterCounterStorageKey(compactDate, projectId)] = n;
  saveLetterCounters(map);
}

/** شمارنده‌های استفاده‌شده در همان روز و همان پروژه از روی صورت‌وضعیت‌های ذخیره‌شده */
function usedCountersForDate(compactDate, excludeId, projectId){
  const used = new Set();
  const compactDigits = String(compactDate).replace(/\D/g, '');
  const pid = getStatusProjectIdForCounter(projectId);
  loadStatusReports().forEach(r => {
    if(excludeId && r.id === excludeId) return;
    if(pid && String(r.projectId || '') !== pid) return;
    if(!pid && r.projectId) return;
    if(!r.letterNo) return;
    const parts = String(r.letterNo).split('/').map(s => s.trim());
    if(parts.length < 3) return;
    const head = toEnglishDigits(parts[0]).replace(/\D/g, '');
    if(head !== compactDigits) return;
    const c = parseInt(toEnglishDigits(parts[parts.length - 1]).replace(/\D/g, ''), 10);
    if(c > 0) used.add(c);
  });
  return used;
}

/** کوچک‌ترین شماره آزاد همان روز در همان پروژه (بعد از حذف، شماره آزاد دوباره استفاده می‌شود) */
function nextAvailableCounter(compactDate, excludeId, projectId){
  const used = usedCountersForDate(compactDate, excludeId, projectId);
  let n = 1;
  while(used.has(n)) n++;
  return n;
}

async function allocateDailyLetterCounter(compactDate, excludeId, projectId){
  const pid = getStatusProjectIdForCounter(projectId);
  let next = nextAvailableCounter(compactDate, excludeId, pid);
  // همگام اختیاری با سرور — کلید شمارنده حالا مستقل از پروژه است.
  if(cloudMode && currentUser && typeof db !== 'undefined' && db){
    try{
      const ref = db.collection('letterCounters').doc(currentUser.uid + '_' + (pid || 'no-project') + '_' + compactDate);
      await db.runTransaction(async (tx)=>{
        const snap = await tx.get(ref);
        const cur = snap.exists && snap.data() && snap.data().n ? parseInt(snap.data().n, 10) : 0;
        const maxUsed = Math.max(next - 1, Number.isFinite(cur) ? cur : 0);
        tx.set(ref, {
          n: Math.max(maxUsed, next),
          date: compactDate,
          projectId: pid || null,
          uid: currentUser.uid,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
    }catch(err){
      console.warn('letter counter tx failed, using local gaps', err);
    }
  }
  setLocalCounter(compactDate, pid, Math.max(getLocalMaxCounter(compactDate, pid), next));
  return next;
}

function formatLetterNo(compactDate, senderAbbr, counter){
  const c = String(counter).padStart(2, '0');
  const abbr = (senderAbbr || '').trim() || '—';
  return compactDate + ' / ' + abbr + ' / ' + c;
}
function formatLetterNoDisplay(letterNo){
  return toPersianDigits(String(letterNo || ''));
}

async function generateNextLetterNo(jDateStr, excludeId){
  // تاریخ شماره نامه = همان تاریخ ثبت‌شده در فرم
  const compact = jalaliCompactYYMMDD(jDateStr || todayJalaliStr());
  const prof = loadProfile();
  const abbr = (prof.senderAbbr || '').trim();
  const projectId = getStatusProjectIdForCounter();
  const n = await allocateDailyLetterCounter(compact, excludeId, projectId);
  return formatLetterNo(compact, abbr, n);
}


function emptyStatusItem(){
  return { desc:'', percent:'', unitPrice:'', qty:'', unit:'', contractPrice:'', notes:'' };
}
function emptyStatusForm(){
  return {
    id: null,
    letterNo: '',
    date: todayJalaliStr(),
    personName: '',
    items: [emptyStatusItem()],
    payAmount: '',
    payCard: false,
    paySheba: false,
    payAccount: '',
    payName: '',
    payExtra: '',
    createdAt: Date.now()
  };
}
/** سازگاری با صورت‌وضعیت‌های قدیمی تک‌ردیفه */
function normalizeStatusForm(s){
  if(!s) return emptyStatusForm();
  // «موضوع نامه» دیگر بخشی از صورت وضعیت نیست؛ داده‌های قدیمی نیز حذف می‌شوند.
  if(Object.prototype.hasOwnProperty.call(s, 'subject')) delete s.subject;
  if(!Array.isArray(s.items) || !s.items.length){
    if(s.desc || s.unitPrice || s.qty || s.contractPrice || s.percent || s.notes || s.unit){
      s.items = [{
        desc: s.desc || '',
        percent: s.percent || '',
        unitPrice: s.unitPrice || '',
        qty: s.qty || '',
        unit: s.unit || '',
        contractPrice: s.contractPrice || '',
        notes: s.notes || ''
      }];
    } else {
      s.items = [emptyStatusItem()];
    }
  }
  // مجموع هزینه برای هر ردیف فقط از «قیمت واحد × مقدار انجام شده» محاسبه می‌شود.
  s.items.forEach(autoContractPriceForItem);
  return s;
}

let statusFormHistoryPushed = false;
let statusFormReturnSubpage = 'statusList';
let statusFormDirty = false;
const STATUS_DRAFT_KEY='karha_status_form_draft_v1';
function readStatusDraft(){try{return JSON.parse(localStorage.getItem(STATUS_DRAFT_KEY)||'null')}catch(e){return null}}
function writeStatusDraft(){try{if(statusFormState)localStorage.setItem(STATUS_DRAFT_KEY,JSON.stringify(statusFormState))}catch(e){}}
function clearStatusDraft(){try{localStorage.removeItem(STATUS_DRAFT_KEY)}catch(e){}}
function statusFormHasInput(){
  if(!statusFormState) return false;
  if(String(statusFormState.personName||'').trim()||String(statusFormState.payAmount||'').trim()||String(statusFormState.payAccount||'').trim()||String(statusFormState.payName||'').trim()||String(statusFormState.payExtra||'').trim()) return true;
  if(Array.isArray(statusFormState.items) && statusFormState.items.some(x=>String(x.description||'').trim()||String(x.qty||'').trim()||String(x.unit||'').trim()||String(x.unitPrice||'').trim()||String(x.contractPrice||'').trim()||String(x.notes||'').trim())) return true;
  return false;
}
function showStatusExitChoice(){
  const ov=document.createElement('div'); ov.className='contact-exit-choice';
  ov.innerHTML='<div class="contact-exit-card"><div class="contact-exit-title">اطلاعات ذخیره نشده است</div><div class="contact-exit-text">می‌خواهید اطلاعات فعلی به‌صورت پیش‌نویس ذخیره شود؟</div><div class="contact-exit-actions"><button type="button" class="mini-btn ghost" data-exit="stay">ادامه ثبت</button><button type="button" class="mini-btn ghost" data-exit="discard">خروج بدون ذخیره</button><button type="button" class="mini-btn primary" data-exit="draft">ذخیره پیش‌نویس</button></div></div>';
  document.body.appendChild(ov); const close=()=>ov.remove();
  ov.querySelector('[data-exit="stay"]').onclick=close;
  ov.querySelector('[data-exit="discard"]').onclick=()=>{close();clearStatusDraft();closeStatusForm();};
  ov.querySelector('[data-exit="draft"]').onclick=()=>{writeStatusDraft();close();closeStatusForm();};
}
function requestCloseStatusForm(){
  const hasInput=statusFormHasInput();
  const requiredComplete=validateStatusFormUI(false);
  if(hasInput && !requiredComplete){
    showIncompleteFormExitChoice({
      onYes:()=>{writeStatusDraft();statusFormDirty=false;closeStatusForm();},
      onNo:()=>{clearStatusDraft();closeStatusForm();}
    });
    return;
  }
  clearStatusDraft();
  closeStatusForm();
}


async function openStatusForm(id){
  try{ showToast('صورت‌وضعیت در این نسخه حذف شده است'); }catch(e){}
  return false;

  closeDrawer();
  // فرم را قبل از هر عملیات شبکه‌ای/غیرهمزمان باز می‌کنیم تا دکمه + هیچ‌وقت معطل نماند.
  statusFormReturnSubpage = 'statusList';
  workspaceSubpage = 'statusForm';
  enterWorkspaceSurface();
  statusEditingId = id || null;

  statusFormDirty=false;
  if(id){
    const list = loadStatusReports();
    const found = list.find(x => x.id === id);
    statusFormState = normalizeStatusForm(found ? JSON.parse(JSON.stringify(found)) : emptyStatusForm());
  } else {
    const savedDraft=readStatusDraft();
    statusFormState = savedDraft ? normalizeStatusForm(savedDraft) : emptyStatusForm();
    statusFormState.projectId = data.activeTab !== 'starred' ? data.activeTab : (statusFormState.projectId||null);
  }
  setInternalFormMode(true);
  if(!statusFormState.date) statusFormState.date = todayJalaliStr();

  document.getElementById('statusFormTitle').textContent = id ? 'ویرایش صورت وضعیت' : 'صورت وضعیت جدید';
  setBottomNavActive('Accounting');
  renderTabs();
  showOnlyWorkspacePage();
  updateWorkspaceContextBar();

  if(!statusFormHistoryPushed){
    try{ history.pushState({karhaWorkspace:'statusForm'}, '', location.href); statusFormHistoryPushed = true; }catch(e){}
  }

  // فرم فوراً رندر می‌شود؛ شماره نامه در صورت نیاز بعداً تکمیل می‌شود.
  renderStatusForm();
  requestAnimationFrame(()=>{
    const page = null;
    const pb = page && page.querySelector('.page-body');
    if(pb) pb.scrollTop = 0;
    if(page) page.scrollTop = 0;
  });

  if(!id && !statusFormState.letterNo){
    const abbr = (loadProfile().senderAbbr || '').trim();
    if(!abbr) showToast('ابتدا در ثبت مشخصات، اختصار فرستنده را وارد کنید');
    try{
      statusFormState.letterNo = await generateNextLetterNo(statusFormState.date);
    }catch(e){
      console.warn(e);
      const compact = jalaliCompactYYMMDD(statusFormState.date);
      statusFormState.letterNo = formatLetterNo(compact, abbr || '—', nextAvailableCounter(compact, statusFormState.id, statusFormState.projectId));
    }
    // فقط اگر هنوز همین فرم باز است، مقدار شماره نامه را به‌روز کن.
    if(workspaceSubpage === 'statusForm' && statusFormState){
      renderStatusForm();
    }
  }
}
function closeStatusForm(fromPopState=false){
  setInternalFormMode(false);
  null?.classList.add('hidden');
  statusFormHistoryPushed = false;
  const statusActions = document.getElementById('statusFormActions');
  if(statusActions) statusActions.innerHTML = '';
  statusFormState = null;
  statusEditingId = null;

  // خروج عادی/Back از فرم همیشه به لیست صورت وضعیت‌ها برمی‌گردد؛ سپس بک بعدی به حسابداری می‌رود.
  if(statusFormReturnSubpage === 'statusList'){
    workspaceSubpage = 'statusList';
    setBottomNavActive('Accounting');
    renderTabs();
    showOnlyWorkspacePage();
    updateWorkspaceContextBar();
    renderStatusList();
  } else {
    workspaceSubpage = null;
    setBottomNavActive('Accounting');
    renderTabs();
    showOnlyWorkspacePage('accountingPage');
    updateWorkspaceContextBar();
    renderAccountingWorkspace();
  }
}

function finishStatusSaveAndReturnToList(){
  // مسیر اختصاصی ذخیره: ابتدا فرم را از DOM خارج می‌کنیم تا هیچ بخشی از آن
  // دوباره توسط refresh/render فوتر نمایش داده نشود، سپس لیست را می‌سازیم.
  const formPage = null;
  if(formPage) formPage.classList.add('hidden');
  const actions = document.getElementById('statusFormActions');
  if(actions) actions.innerHTML = '';

  statusFormHistoryPushed = false;
  statusFormState = null;
  statusEditingId = null;
  statusFormReturnSubpage = 'statusList';
  workspaceSubpage = 'statusList';

  setBottomNavActive('Accounting');
  renderTabs();
  showOnlyWorkspacePage();
  updateWorkspaceContextBar();
  renderStatusList();
}

function formatStatusMoney(v){
  if(v===null || v===undefined || v==='') return '';
  const n = String(toEnglishDigits(String(v))).replace(/[^\d]/g,'');
  if(!n) return '';
  return toPersianDigits(groupWithCommas(n));
}

/** فیلد با برچسب آبی کوچک بالا (فقط فرم) */
function stLabeledField(label, getVal, setVal, opts){
  opts = opts || {};
  const wrap = document.createElement('div');
  wrap.className = 'st-field' + (opts.date || opts.numpad ? ' st-tap' : '');
  if(opts.required){
    wrap.classList.add('st-required');
    if(opts.validationKey) wrap.dataset.validationKey = opts.validationKey;
  }
  const lab = document.createElement('span');
  lab.className = 'st-field-lab';
  lab.textContent = label;
  wrap.appendChild(lab);

  if(opts.date){
    const val = document.createElement('div');
    const cur = getVal();
    val.className = 'st-val' + (cur ? '' : ' placeholder');
    val.textContent = cur ? formatJalaliDisplay(cur) : 'انتخاب تاریخ';
    wrap.appendChild(val);
    wrap.onclick = ()=>{
      openJalaliPicker(getVal() || todayJalaliStr(), async (v)=>{
        statusFormDirty=true; setVal(v);
        if(opts.onDatePicked) await opts.onDatePicked(v);
        else renderStatusForm();
      });
    };
    return wrap;
  }

  if(opts.numpad){
    const val = document.createElement('div');
    const raw = getVal();
    const has = raw!==null && raw!==undefined && String(raw)!=='';
    val.className = 'st-val' + (has ? '' : ' placeholder');
    const dsuf = opts.displaySuffix != null ? opts.displaySuffix : '';
    const dpre = opts.displayPrefix != null ? opts.displayPrefix : '';
    if(has){
      const numTxt = opts.noGroup
        ? toPersianDigits(String(toEnglishDigits(String(raw)).replace(/[^\d]/g,'')))
        : formatStatusMoney(raw);
      val.textContent = dpre + numTxt + dsuf;
      if(dpre === '٪'){
        val.style.direction = 'ltr';
        val.style.unicodeBidi = 'isolate';
        val.style.textAlign = 'right';
      }
    } else {
      val.textContent = 'وارد کنید…';
    }
    wrap.appendChild(val);
    wrap.onclick = ()=>{
      openNumpadGeneric(getVal(), (buf)=>{
        setVal(buf === '' ? '' : buf);
        if(opts.onNumpadDone) opts.onNumpadDone();
        renderStatusForm();
      }, {
        suffix: opts.numpadSuffix != null ? opts.numpadSuffix : ' تومان',
        prefix: opts.displayPrefix || '',
        maxLen: opts.maxLen||16,
        group: !opts.noGroup
      });
    };
    return wrap;
  }

  if(opts.multiline){
    const inp = document.createElement('textarea');
    inp.className = 'st-inp';
    inp.rows = opts.rows || 2;
    inp.placeholder = '';
    inp.value = getVal() || '';
    inp.oninput = ()=>{
    setVal(inp.value);

  };
    wrap.appendChild(inp);
    return wrap;
  }

  if(opts.readonly){
    const val = document.createElement('div');
    val.className = 'st-val';
    val.style.textAlign = 'right';
    val.style.direction = 'rtl';
    val.style.unicodeBidi = 'isolate';
    val.textContent = getVal() || '—';
    wrap.appendChild(val);
    return wrap;
  }

  const inp = document.createElement('input');
  inp.className = 'st-inp';
  inp.type = 'text';
  inp.placeholder = '';
  inp.value = getVal() || '';
  if(opts.ltr){ inp.dir = 'ltr'; inp.style.textAlign = 'left'; }
  inp.oninput = ()=> setVal(inp.value);
  if(opts.onBlur){
    inp.onblur = ()=>{ try{ opts.onBlur(); }catch(e){} };
  }
  wrap.appendChild(inp);
  return wrap;
}

function autoContractPriceForItem(item){
  const uRaw = toEnglishDigits(String(item.unitPrice ?? '')).replace(/[^\d.]/g,'');
  const qRaw = toEnglishDigits(String(item.qty ?? '')).replace(/[^\d.]/g,'');
  const u = parseFloat(uRaw);
  const q = parseFloat(qRaw);
  // مجموع هزینه همیشه محاسباتی است و هرگز از کاربر دریافت نمی‌شود.
  if(Number.isFinite(u) && Number.isFinite(q) && u >= 0 && q >= 0 && uRaw !== '' && qRaw !== ''){
    item.contractPrice = String(Math.round(u * q));
  } else {
    item.contractPrice = '';
  }
}


function statusBlank(v){
  return v === null || v === undefined || String(v).trim() === '';
}

function getStatusValidation(){
  const invalid = new Set();
  if(!statusFormState) return invalid;

  if(statusBlank(statusFormState.date)) invalid.add('date');
  if(statusBlank(statusFormState.personName)) invalid.add('personName');

  (statusFormState.items || []).forEach((item, idx)=>{
    if(statusBlank(item.desc)) invalid.add(`item:${idx}:desc`);
    if(statusBlank(item.notes)) invalid.add(`item:${idx}:notes`);
    if(statusBlank(item.unit)) invalid.add(`item:${idx}:unit`);
    if(statusBlank(item.percent)) invalid.add(`item:${idx}:percent`);
    if(statusBlank(item.unitPrice)) invalid.add(`item:${idx}:unitPrice`);
    if(statusBlank(item.qty)) invalid.add(`item:${idx}:qty`);
  });

  if(statusBlank(statusFormState.payAmount)) invalid.add('payAmount');
  if(!statusFormState.payCard && !statusFormState.paySheba) invalid.add('payType');
  if(statusBlank(statusFormState.payAccount)) invalid.add('payAccount');
  if(statusBlank(statusFormState.payName)) invalid.add('payName');

  // «توضیحات اختیاری پرداخت» عمداً اختیاری است.
  return invalid;
}

function validateStatusFormUI(showErrors=false){
  if(!statusFormState) return false;
  const invalid = getStatusValidation();

  if(showErrors){
    document.querySelectorAll('#statusFormBody .st-required[data-validation-key]').forEach(el=>{
      el.classList.toggle('st-required-invalid', invalid.has(el.dataset.validationKey));
    });
  }

  return invalid.size === 0;
}

function renderStatusForm(){
  const body = document.getElementById('statusFormBody');
  body.innerHTML = '';
  if(!statusFormState) return;
  normalizeStatusForm(statusFormState);

  // اطلاعات نامه — موضوع نامه عمداً در فرم وجود ندارد.
  body.appendChild(stLabeledField('شماره نامه',
    ()=> statusFormState.letterNo, ()=>{}, { readonly:true }));
  body.appendChild(stLabeledField('تاریخ',
    ()=> statusFormState.date,
    v=>{ statusFormState.date = v; },
    { required:true, validationKey:'date', date:true, onDatePicked: async (v)=>{
        statusFormState.date = v;
        if(!statusFormState.id){
          statusFormState.letterNo = await generateNextLetterNo(v, statusFormState.id);
          renderStatusForm();
        }
      }
    }));
  body.appendChild(stLabeledField('عنوان نامه',
    ()=> statusFormState.personName, v=>{ statusFormState.personName = v; },
    { required:true, validationKey:'personName' }));

  // ردیف‌های شرح وضعیت
  statusFormState.items.forEach((item, idx)=>{
    const block = document.createElement('div');
    block.className = 'st-item-block';
    const head = document.createElement('div');
    head.className = 'st-item-head';
    head.innerHTML = '<span>شرح وضعیت ' + toPersianDigits(idx+1) + '</span>';
    if(statusFormState.items.length > 1){
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'حذف';
      del.onclick = ()=>{
        statusFormState.items.splice(idx, 1);
        renderStatusForm();
      };
      head.appendChild(del);
    }
    block.appendChild(head);

    block.appendChild(stLabeledField('شرح وضعیت',
      ()=> item.desc, v=>{ item.desc = v; }, { multiline:true, required:true, validationKey:'item:' + idx + ':desc' }));
    // توضیحات باید بلافاصله بعد از شرح وضعیت قرار بگیرد.
    block.appendChild(stLabeledField('توضیحات',
      ()=> item.notes, v=>{ item.notes = v; }, { multiline:true, required:true, validationKey:'item:' + idx + ':notes' }));
    block.appendChild(stLabeledField('یونیت (مثلاً متر مربع)',
      ()=> item.unit, v=>{ item.unit = v; },
      { required:true, validationKey:'item:' + idx + ':unit', onBlur: ()=> renderStatusForm() }));
    block.appendChild(stLabeledField('درصد انجام',
      ()=> item.percent, v=>{ item.percent = v; },
      { required:true, validationKey:'item:' + idx + ':percent', numpad:true, numpadSuffix:'', displayPrefix:'٪', displaySuffix:'', noGroup:true, maxLen:3 }));
    block.appendChild(stLabeledField('قیمت واحد (تومان)',
      ()=> item.unitPrice, v=>{ item.unitPrice = v; autoContractPriceForItem(item); },
      { required:true, validationKey:'item:' + idx + ':unitPrice', numpad:true, numpadSuffix:' تومان', displaySuffix:' تومان', onNumpadDone:()=> autoContractPriceForItem(item) }));
    // مقدار + یونیت کنار عدد
    (function(){
      const unitTxt = (item.unit || '').trim();
      const wrap = stLabeledField('مقدار انجام شده',
        ()=> item.qty, v=>{ item.qty = v; autoContractPriceForItem(item); },
        {
          required:true,
          validationKey:'item:' + idx + ':qty',
          numpad:true,
          numpadSuffix: unitTxt ? (' ' + unitTxt) : '',
          displaySuffix: unitTxt ? (' ' + unitTxt) : '',
          onNumpadDone:()=> autoContractPriceForItem(item)
        });
      block.appendChild(wrap);
    })();
    autoContractPriceForItem(item);
    block.appendChild(stLabeledField('مجموع هزینه (تومان)',
      ()=> item.contractPrice ? (formatStatusMoney(item.contractPrice) + ' تومان') : '—',
      ()=>{},
      { readonly:true }));

    body.appendChild(block);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'st-add-item';
  addBtn.innerHTML = '<span style="font-size:20px;line-height:1;">+</span> افزودن شرح وضعیت';
  addBtn.onclick = ()=>{
    statusFormDirty=true; statusFormState.items.push(emptyStatusItem());
    renderStatusForm();
  };
  body.appendChild(addBtn);

  const sec = document.createElement('div');
  sec.className = 'st-section-title';
  sec.textContent = 'اطلاعات واریز';
  body.appendChild(sec);

  body.appendChild(stLabeledField('مبلغ (تومان)',
    ()=> statusFormState.payAmount, v=>{ statusFormState.payAmount = v; },
    { required:true, validationKey:'payAmount', numpad:true, numpadSuffix:' تومان', displaySuffix:' تومان' }));

  const typeRow = document.createElement('div');
  typeRow.className = 'st-field st-required';
  typeRow.dataset.validationKey = 'payType';
  typeRow.style.display = 'flex';
  typeRow.style.gap = '18px';
  const mkChk = (label, key, other)=>{
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:14px;color:var(--text);cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!statusFormState[key];
    cb.onchange = ()=>{
      statusFormDirty=true;
      statusFormState[key] = cb.checked;
      if(cb.checked) statusFormState[other] = false;
      renderStatusForm();
    };
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(label));
    return lab;
  };
  typeRow.appendChild(mkChk('شماره کارت', 'payCard', 'paySheba'));
  typeRow.appendChild(mkChk('شماره شبا', 'paySheba', 'payCard'));
  body.appendChild(typeRow);

  body.appendChild(stLabeledField(
    statusFormState.paySheba ? 'شماره شبا' : (statusFormState.payCard ? 'شماره کارت' : 'شماره کارت یا شبا'),
    ()=> statusFormState.payAccount, v=>{ statusFormState.payAccount = v; },
    { required:true, validationKey:'payAccount', numpad:true, numpadSuffix:'', noGroup:true, maxLen:24 }
  ));
  body.appendChild(stLabeledField('به نام',
    ()=> statusFormState.payName, v=>{ statusFormState.payName = v; },
    { required:true, validationKey:'payName' }));
  body.appendChild(stLabeledField('توضیحات اختیاری پرداخت',
    ()=> statusFormState.payExtra, v=>{ statusFormState.payExtra = v; }, { multiline:true }));

  const actions = document.getElementById('statusFormActions');
  if(actions) actions.innerHTML='';
  const bar=document.createElement('div'); bar.className='st-save-bar';
  const saveBtn=document.createElement('button'); saveBtn.className='st-save'; saveBtn.type='button'; saveBtn.textContent='ذخیره';
  saveBtn.onclick=async()=>{if(!validateStatusFormUI(true)){showToast('لطفاً فیلدهای مشخص‌شده را تکمیل کنید');return;}if(!statusFormState.letterNo)statusFormState.letterNo=await generateNextLetterNo(statusFormState.date);if(!saveCurrentStatus(false))return;clearStatusDraft();statusFormDirty=false;finishStatusSaveAndReturnToList();};
  const draftBtn=document.createElement('button'); draftBtn.className='st-draft'; draftBtn.type='button'; draftBtn.textContent='پیش‌نویس'; draftBtn.onclick=()=>{writeStatusDraft();statusFormDirty=false;showToast('پیش‌نویس ذخیره شد');closeStatusForm();};
  const cancelBtn=document.createElement('button'); cancelBtn.className='st-cancel'; cancelBtn.type='button'; cancelBtn.textContent='انصراف'; cancelBtn.onclick=()=>{clearStatusDraft();closeStatusForm();};
  bar.append(saveBtn,draftBtn,cancelBtn); if(actions) actions.appendChild(bar);
}

function saveCurrentStatus(silent){
  if(!validateStatusFormUI(true)){
    if(!silent) showToast('لطفاً فیلدهای مشخص‌شده را تکمیل کنید');
    return false;
  }
  if(statusFormState && data.activeTab!=='starred') statusFormState.projectId=data.activeTab;
  if(!statusFormState) return;
  // موضوع نامه نباید در داده ذخیره شود؛ حتی اگر رکورد قدیمی آن را داشته باشد.
  if(Object.prototype.hasOwnProperty.call(statusFormState, 'subject')) delete statusFormState.subject;
  const list = loadStatusReports();
  if(!statusFormState.id){
    statusFormState.id = 'st_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    statusFormState.createdAt = Date.now();
    list.unshift(statusFormState);
  } else {
    const i = list.findIndex(x => x.id === statusFormState.id);
    if(i>=0) list[i] = statusFormState;
    else list.unshift(statusFormState);
  }
  statusEditingId = statusFormState.id;
  saveStatusReports(list);
  if(!silent) showToast('ذخیره شد');
  return true;
}

function openStatusList(){
  try{ showToast('صورت‌وضعیت در این نسخه حذف شده است'); }catch(e){}
  return;

  ensureHomeSelection();
  enterWorkspaceSurface();
  workspaceSubpage='statusList';
  setBottomNavActive('Accounting');
  renderTabs();
  showOnlyWorkspacePage();
  updateWorkspaceContextBar();
  pushWorkspaceHistory('statusList');
  renderStatusList();
}
function closeStatusList(){
  workspaceSubpage=null;
  setBottomNavActive('Accounting');
  renderTabs();
  showOnlyWorkspacePage('accountingPage');
  updateWorkspaceContextBar();
  renderAccountingWorkspace();
}

function renderStatusList(){
  const body = document.getElementById('statusListBody');
  body.innerHTML = '';
  const allList = loadStatusReports();
  const activeProjectId = data.activeTab !== 'starred' ? data.activeTab : null;
  const list = activeProjectId ? allList.filter(x=>x.projectId===activeProjectId) : [];
  if(!list.length){
    body.innerHTML = '<div class="mgmt-empty">هنوز صورت وضعیتی ثبت نشده.<br>از دکمهٔ + یک مورد بسازید.</div>';
    return;
  }
  list.forEach(item => {
    const row = document.createElement('div');
    row.className = 'st-list-row';
    const b = document.createElement('div');
    b.className = 'st-list-body';
    b.onclick = ()=> openStatusForm(item.id);
    const t = document.createElement('div');
    t.className = 'st-list-title';
    t.textContent = item.personName || 'بدون عنوان';
    const m = document.createElement('div');
    m.className = 'st-list-meta';
    const unitPart = item.unit ? ' · ' + item.unit : '';
    m.textContent = (item.date ? formatJalaliDisplay(item.date) : '') + unitPart;
    b.appendChild(t); b.appendChild(m);
    row.appendChild(b);

    const pdfB = document.createElement('button');
    pdfB.className = 'mgmt-icon-btn blue';
    pdfB.title = 'PDF';
    pdfB.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 2h7l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 2v4h4M7 11h6M7 14h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    pdfB.onclick = (e)=>{
      e.stopPropagation();
      statusFormState = normalizeStatusForm(JSON.parse(JSON.stringify(item)));
      generateStatusPdf();
    };

    const jpgB = document.createElement('button');
    jpgB.className = 'mgmt-icon-btn blue';
    jpgB.title = 'JPEG';
    jpgB.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="9" r="1.5" fill="currentColor"/><path d="M3 14l4-4 3 3 3-4 4 5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    jpgB.onclick = (e)=>{
      e.stopPropagation();
      statusFormState = normalizeStatusForm(JSON.parse(JSON.stringify(item)));
      generateStatusJpeg();
    };

    const delB = document.createElement('button');
    delB.className = 'mgmt-icon-btn danger';
    delB.title = 'حذف';
    delB.innerHTML = '<svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V2.6c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7V4M6.6 7v5M9.4 7v5M3.7 4l.6 9.2c0 .6.5 1 1.1 1h5.2c.6 0 1.1-.4 1.1-1L12.3 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    delB.onclick = (e)=>{
      e.stopPropagation();
      if(!confirm('این صورت وضعیت حذف شود؟')) return;
      saveStatusReports(loadStatusReports().filter(x => x.id !== item.id));
      renderStatusList();
      showToast('حذف شد');
    };
    row.appendChild(pdfB);
    row.appendChild(jpgB);
    row.appendChild(delB);
    body.appendChild(row);
  });
}

let statusExportId = null;
function openStatusExport(id){
  enterWorkspaceSurface();
  const list = loadStatusReports();
  const item = list.find(x => x.id === id);
  if(!item) return;
  statusExportId = id;
  statusFormState = normalizeStatusForm(JSON.parse(JSON.stringify(item)));
  document.getElementById('statusExportTitle').textContent = 'خروجی: ' + (item.personName || 'صورت وضعیت');
  null?.classList.remove('hidden');
  renderStatusExportPage();
}
function closeStatusExport(){
  null?.classList.add('hidden');
  statusExportId = null;
}
function renderStatusExportPage(){
  const toolbar = document.getElementById('statusExportToolbar');
  const body = document.getElementById('statusExportBody');
  if(toolbar){
    toolbar.innerHTML = '';
    toolbar.style.display = 'none';
  }
  body.innerHTML = '';

  // فقط پیش‌نمایش — خروجی از آیکون‌های لیست
  const preview = document.createElement('div');
  preview.style.cssText = 'padding:12px;overflow:auto;max-width:100%;box-sizing:border-box;';
  preview.innerHTML = '<style>'+STATUS_DOC_CSS+'</style>' + statusExportHtml(statusFormState);
  const docEl = preview.querySelector('.doc');
  if(docEl){
    docEl.style.width = '100%';
    docEl.style.maxWidth = '100%';
    docEl.style.padding = '8px';
    docEl.style.boxSizing = 'border-box';
  }
  body.appendChild(preview);
}


const STATUS_DOC_CSS = `
  .doc{
    font-family:IRANYekan,Vazirmatn,Tahoma,sans-serif;color:#202124;
    padding:8px 4px;width:100%;max-width:100%;box-sizing:border-box;background:#fff;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
  }
  .head-meta{
    display:flex;align-items:flex-start;justify-content:space-between;gap:16px;
    font-size:12px;color:#202124;line-height:1.8;margin-bottom:14px;
  }
  .head-meta-right{text-align:right;flex:1;}
  .head-meta-left{text-align:left;direction:rtl;flex-shrink:0;unicode-bidi:isolate;}
  .org-name{font-size:14px;font-weight:700;color:#202124;margin-bottom:6px;}
  h1{font-size:16px;text-align:center;margin:0 0 16px;font-weight:700;}
  table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}
  col.c-desc{width:16%;}
  col.c-pct{width:8%;}
  col.c-unit{width:13%;}
  col.c-qty{width:12%;}
  col.c-sum{width:14%;}
  col.c-notes{width:37%;}
  th{
    background:var(--green);color:#fff;padding:8px 5px;border:1px solid #00075D;
    font-weight:600;word-wrap:break-word;text-align:center;
  }
  td{
    padding:8px 5px;border:1px solid #cfd8dc;vertical-align:top;
    word-wrap:break-word;overflow-wrap:anywhere;
  }
  td.num{text-align:center;white-space:nowrap;}
  tr.total td{font-weight:700;background:#eceff1;}
  .pay-box{
    margin-top:18px;padding:12px 14px;border:1px solid #cfd8dc;border-radius:8px;
    background:#fafafa;font-size:12.5px;font-weight:500;line-height:1.75;color:#202124;
  }
  .pay-box .pay-line{color:#202124;}
  .pay-box .extra{color:#c62828;margin-top:8px;}
  .sig{margin-top:28px;width:max-content;max-width:50%;margin-inline-start:auto;text-align:center;direction:rtl;unicode-bidi:isolate;}
  .sig-label{font-size:12px;color:#202124;margin-bottom:4px;}
  .sig-name{font-size:13px;font-weight:600;color:#202124;margin-bottom:6px;}
  .sig img{max-width:160px;max-height:64px;object-fit:contain;display:block;margin:0 auto;}
  @media print {
    html, body { margin: 0; padding: 0; background: #fff; }
    .doc { width: 100% !important; max-width: 100% !important; padding: 0 !important; }
    th, tr.total td, .pay-box {
      -webkit-print-color-adjust:exact;print-color-adjust:exact;
    }
  }
`;

function getStatusProjectName(s){
  const pid = s && s.projectId ? s.projectId : (data.activeTab !== 'starred' ? data.activeTab : null);
  const p = pid ? findProject(pid) : null;
  return (p && p.name ? String(p.name).trim() : '');
}

function statusExportHtml(s){
  const prof = loadProfile();
  s = normalizeStatusForm(JSON.parse(JSON.stringify(s)));
  const items = s.items || [];
  const payType = s.paySheba ? 'شبا' : (s.payCard ? 'کارت' : '');
  let total = 0;
  let rows = '';
  items.forEach(it=>{
    const c = parseFloat(toEnglishDigits(String(it.contractPrice||'')).replace(/[^\d.]/g,'')) || 0;
    total += c;
    const qtyLabel = it.unit ? toPersianDigits(String(it.qty||''))+' '+escapeHtml(it.unit) : escapeHtml(formatStatusMoney(it.qty));
    rows += '<tr>'
      + '<td>'+escapeHtml(it.desc||'')+'</td>'
      + '<td class="num">'+(it.percent!==''&&it.percent!=null ? ('<span dir="ltr" style="unicode-bidi:isolate">٪'+escapeHtml(toPersianDigits(it.percent))+'</span>') : '')+'</td>'
      + '<td class="num">'+escapeHtml(formatStatusMoney(it.unitPrice))+'</td>'
      + '<td class="num">'+qtyLabel+'</td>'
      + '<td class="num">'+escapeHtml(formatStatusMoney(it.contractPrice))+'</td>'
      + '<td>'+escapeHtml(it.notes||'')+'</td>'
      + '</tr>';
  });
  let payBlock = '';
  if(s.payAmount || s.payAccount || s.payName || s.payExtra){
    let line = '';
    if(s.payAmount) line += 'مبلغ '+formatStatusMoney(s.payAmount)+' تومان';
    if(s.payAccount){
      if(line) line += ' ';
      line += 'به شماره '+(payType?payType+' ':'');
      line += '<span dir="ltr" style="unicode-bidi:isolate">'+escapeHtml(toPersianDigits(String(s.payAccount)))+'</span>';
    }
    if(s.payName){
      if(line) line += ' ';
      line += 'به نام '+escapeHtml(s.payName)+' واریز گردد';
    }
    if(line && !/[.。]$/.test(line.replace(/<[^>]+>/g,'').trim())) line += '.';
    payBlock = '<div class="pay-box">';
    if(line) payBlock += '<div class="pay-line">'+line+'</div>';
    if(s.payExtra) payBlock += '<div class="extra">'+escapeHtml(s.payExtra)+'</div>';
    payBlock += '</div>';
  }
  let sig = '';
  if(prof.name || prof.signature){
    sig = '<div class="sig">';
    sig += '<div class="sig-label">نام و نام خانوادگی و امضا صادر کننده:</div>';
    if(prof.name) sig += '<div class="sig-name">'+escapeHtml(prof.name)+'</div>';
    if(prof.signature) sig += '<img src="'+prof.signature+'" alt="امضا">';
    sig += '</div>';
  }
  const projectName = getStatusProjectName(s);
  return `<div class="doc">
  <div class="head-meta">
    <div class="head-meta-right">
      <div class="org-name">${escapeHtml(projectName ? 'پروژه ' + projectName : 'پروژه')}</div>
    </div>
    <div class="head-meta-left">
      <div>تاریخ: ${escapeHtml(toPersianDigits(s.date||''))}</div>
      <div>شماره نامه: ${escapeHtml(formatLetterNoDisplay(s.letterNo||''))}</div>
    </div>
  </div>
  <h1>${escapeHtml(s.personName || 'صورت وضعیت')}</h1>
  <table>
    <colgroup>
      <col class="c-desc"><col class="c-pct"><col class="c-unit">
      <col class="c-qty"><col class="c-sum"><col class="c-notes">
    </colgroup>
    <thead><tr>
      <th>شرح وضعیت</th><th>درصد انجام</th><th>قیمت واحد<br>(تومان)</th>
      <th>مقدار انجام شده</th><th>مجموع هزینه<br>(تومان)</th><th>توضیحات</th>
    </tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td colspan="4" style="text-align:left">جمع کل</td><td class="num">${escapeHtml(formatStatusMoney(total))}</td><td></td></tr>
    </tbody>
  </table>
  ${payBlock}
  ${sig}
</div>`;
}

function generateStatusPdf(){
  if(!statusFormState) return;
  const inner = statusExportHtml(statusFormState);
  const rawTitle = (statusFormState.personName || 'صورت وضعیت').trim();
  const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const doc = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8">
<title>${escapeHtml(safeTitle)}</title>
<link href="https://fonts.cdnfonts.com/css/iranyekan" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 12mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  ${STATUS_DOC_CSS}
</style></head>
<body>
${inner}
<script>
  window.onload = function(){
    setTimeout(function(){ window.print(); }, 450);
  };
<\/script>

<\/body><\/html>`;

  const w = window.open('', '_blank');
  if(!w){
    showToast('اجازهٔ باز شدن پنجره را بدهید');
    return;
  }
  w.document.open();
  w.document.write(doc);
  w.document.close();
}

async function generateStatusJpeg(){
  if(!statusFormState) return;
  if(typeof html2canvas !== 'function'){ showToast('ابزار تصویر در دسترس نیست'); return; }
  const wrap = document.createElement('div');
  // عرض ثابت ضروری است؛ width:100% روی والد بدون اندازه باعث تصویر خالی/خراب می‌شود
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;background:#fff;z-index:-1;box-sizing:border-box;';
  wrap.innerHTML = '<style>' + STATUS_DOC_CSS + '.doc{width:900px !important;max-width:900px !important;padding:20px !important;}</style>'
    + statusExportHtml(statusFormState);
  document.body.appendChild(wrap);
  showToast('در حال ساخت تصویر…');
  try{
    await new Promise(r=>setTimeout(r,350));
    const target = wrap.querySelector('.doc') || wrap;
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: 900,
      windowWidth: 900
    });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    const name = (statusFormState.personName || 'status')
      .replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    a.download = name + '.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('تصویر ذخیره شد');
  }catch(e){
    console.error(e);
    showToast('خطا در ساخت تصویر');
  }finally{
    wrap.remove();
  }
}



/* صورت‌وضعیت‌ها / share / collab DOM در فاز ۵–۷ از shell حذف شده‌اند.
   فقط elementهای موجود bind می‌شوند تا Startup با null.onclick نشکند. */
function bindClick(id, handler){
  const el = document.getElementById(id);
  if(el) el.onclick = handler;
}
bindClick('closeStatusFormPage', requestCloseStatusForm);
bindClick('closeStatusListPage', ()=> closeStatusList());
bindClick('statusListAddBtn', ()=>{ openStatusForm(null); });
bindClick('closeStatusExportPage', ()=> closeStatusExport());
bindClick('closeContractStatusPage', ()=> closeContractStatusPage());
bindClick('closeContractTemplatesPage', ()=>closeContractTemplatesPage());
bindClick('closeContractsPage', ()=>closeContractsPage());
bindClick('contractAddBtn', ()=>openContractForm(null));
bindClick('closeContractFormPage', ()=>requestCloseContractForm());
bindClick('closeStatusTestPage', ()=>closeStatusTestPage());
bindClick('closeContractApprovalPage', ()=>closeContractApprovalPage());
bindClick('closeActivityFormPage', requestCloseActivityForm);
bindClick('closeShareFormPage', ()=>requestCloseShareForm(document.getElementById('shareFormBody')?.querySelector('input')));

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
const routedModuleId = String(location.hash || '').match(/^#\/?projects?\/[^/?&#]+\/([^/?&#]+)/i)?.[1] || 'dashboard';
if(routedProjectId && findProject(routedProjectId)){
  data.activeTab = routedProjectId;
  if(routedModuleId!=='contracts') replaceWorkspaceRoute(routedProjectId, 'dashboard');
}else if(data.activeTab && data.activeTab !== 'starred' && findProject(data.activeTab)){
  replaceWorkspaceRoute(data.activeTab, 'dashboard');
}else{
  data.activeTab = null;
}
if(routedProjectId && routedModuleId==='contracts'){
  enterWorkspaceSurface(); workspaceSubpage='contracts'; setBottomNavActive('Reports');
  showOnlyWorkspacePage('contractsPage'); updateWorkspaceContextBar();
}else renderAll();

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

  getViewMode(){ return data?.viewMode || 'simple'; },
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
    return setActiveProject(projectId,{updateRoute:true,render:true,moduleId});
  },
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
  escapeHtml,
  findActivityTemplate,
  formatJalaliDisplay,
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
  todayJalaliStr,
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

