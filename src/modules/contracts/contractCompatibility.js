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

