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
