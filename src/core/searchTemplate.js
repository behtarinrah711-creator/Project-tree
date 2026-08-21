/* Search Template — shared selection UI.
 * Public API: window.KarhaSearchTemplate
 * The component is intentionally data-agnostic. Context-specific persistence
 * and entity creation remain supplied by callers through callbacks.
 */
(function(){
  let state=null;
  let historyPushed=false;
  let searchModePushed=false;

  const hooks=()=>window.KarhaSearchTemplateHooks||{};

  function initials(name){
    const t=String(name||'').trim();
    if(!t)return '؟';
    const p=t.split(/\s+/).filter(Boolean);
    return p.length>=2?(p[0][0]+p[1][0]).slice(0,2):t.slice(0,2);
  }
  function avatarClass(name){
    let h=0; const s=String(name||'');
    for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0;
    return 'c'+(h%6);
  }
  function firstLetter(name){
    const t=String(name||'').trim();
    return t?t[0]:'#';
  }
  function starSvg(on){
    if(on)return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.3l-6.2 3.7 1.7-7.1L2 9.2l7.2-.6 2.8-6.6 2.8 6.6 7.2.6-5.5 4.7 1.7 7.1z"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 17.3l-6.2 3.7-6.2 3.7 1.7-7.1L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7.1z"/></svg>';
  }

  function isOpen(){
    const page=document.getElementById('searchTemplatePage');
    return !!(page && !page.classList.contains('hidden'));
  }
  function isSearchMode(){
    const top=document.getElementById('searchTemplateTopbar');
    return !!(top && top.classList.contains('search-mode'));
  }
  function render(){
    const body=document.getElementById('searchTemplateBody');
    if(!body||!state)return;
    body.innerHTML='';
    const q=String(state.query||'').trim().toLocaleLowerCase('fa');
    const items=state.items.filter(it=>!q||String(it.name||'').toLocaleLowerCase('fa').includes(q));
    if(!items.length){body.innerHTML='<div class="stpl-empty">موردی یافت نشد.</div>';return;}
    const starred=items.filter(it=>!!it.starred);
    const rest=items.filter(it=>!it.starred);
    const append=(label,list,selected)=>{
      if(!list.length)return;
      const lab=document.createElement('div');
      lab.className='stpl-section-label'+(selected?' stpl-selected-label':'');
      lab.textContent=label; body.appendChild(lab);
      if(selected){list.forEach(it=>body.appendChild(row(it)));return;}
      const groups={};
      list.forEach(it=>{const L=firstLetter(it.name);(groups[L]||(groups[L]=[])).push(it);});
      Object.keys(groups).sort((a,b)=>a.localeCompare(b,'fa')).forEach(L=>{
        const letter=document.createElement('div');letter.className='stpl-letter';letter.textContent=L;body.appendChild(letter);
        groups[L].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fa')).forEach(it=>body.appendChild(row(it)));
      });
    };
    if(starred.length)append(state.selectedTitle,starred,true);
    append(state.listTitle,rest,false);
  }
  function row(item){
    const r=document.createElement('div');r.className='stpl-row';r.dataset.id=String(item.id||'');
    const av=document.createElement('div');av.className='stpl-avatar '+avatarClass(item.name);av.textContent=initials(item.name);
    const name=document.createElement('div');name.className='stpl-name';name.textContent=item.name||'—';r.append(av,name);
    if(state.showStar){
      const star=document.createElement('button');star.type='button';star.className='stpl-star'+(item.starred?' on':'');star.innerHTML=starSvg(!!item.starred);
      star.onclick=e=>{e.preventDefault();e.stopPropagation();item.starred=!item.starred;const ref=state.items.find(x=>String(x.id)===String(item.id));if(ref)ref.starred=item.starred;hooks().setStarred?.(state.contextKey,item.id,item.starred);render();};
      r.appendChild(star);
    }
    r.onclick=()=>{
      const handler=state?.onSelect;
      close(false);
      if(handler)try{handler(item);}catch(e){}
    };
    return r;
  }
  function exitSearch(){
    const top=document.getElementById('searchTemplateTopbar'),inp=document.getElementById('searchTemplateInput');
    if(top)top.classList.remove('search-mode');
    if(inp){inp.value='';try{inp.blur();}catch(e){}}
    if(state){state.query='';render();}
  }
  function enterSearch(){
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
    const page=document.getElementById('searchTemplatePage');
    if(page){page.classList.add('hidden');page.setAttribute('aria-hidden','true');}
    state=null;
    const top=document.getElementById('searchTemplateTopbar'),inp=document.getElementById('searchTemplateInput');
    if(top)top.classList.remove('search-mode');
    if(inp){inp.value='';try{inp.blur();}catch(e){}}
    const steps=!fromPop?((historyPushed?1:0)+(searchModePushed?1:0)):0;
    historyPushed=false;searchModePushed=false;
    if(steps>0){
      suppressParentBack();
      try{if(steps===1)history.back();else history.go(-steps);}catch(e){}
    }
  }
  function back(){
    if(!isOpen())return false;
    if(isSearchMode()){
      exitSearch();
      if(searchModePushed){searchModePushed=false;suppressParentBack();try{history.back();}catch(e){}}
      return true;
    }
    close(false);return true;
  }
  function open(opts={}){
    const page=document.getElementById('searchTemplatePage');if(!page)return;
    const contextKey=String(opts.contextKey||opts.listTitle||'default');
    const starMap=hooks().getStarMap?.(contextKey)||{};
    state={
      title:opts.title||'انتخاب',
      listTitle:opts.listTitle||'موارد',
      selectedTitle:opts.selectedTitle||((opts.listTitle||'موارد')+' منتخب'),
      contextKey,
      items:(Array.isArray(opts.items)?opts.items:[]).map(it=>({id:it.id,name:it.name,starred:!!starMap[String(it.id)],_raw:it})),
      onSelect:typeof opts.onSelect==='function'?opts.onSelect:null,
      onAdd:typeof opts.onAdd==='function'?opts.onAdd:null,
      showStar:opts.showStar!==false,
      showAdd:opts.showAdd!==false&&typeof opts.onAdd==='function',
      query:''
    };
    const title=document.getElementById('searchTemplateTitle');if(title)title.textContent=state.title;
    const fab=document.getElementById('searchTemplateFab');if(fab)fab.style.display=state.showAdd?'flex':'none';
    const top=document.getElementById('searchTemplateTopbar');if(top)top.classList.remove('search-mode');
    const inp=document.getElementById('searchTemplateInput');if(inp)inp.value='';
    page.classList.remove('hidden');page.setAttribute('aria-hidden','false');render();
    searchModePushed=false;
    if(!historyPushed){try{history.pushState({karhaSearchTemplate:true},'',location.href);historyPushed=true;}catch(e){}}
  }
  function init(){
    const backBtn=document.getElementById('searchTemplateBack'),searchBtn=document.getElementById('searchTemplateSearchBtn');
    const inp=document.getElementById('searchTemplateInput'),fab=document.getElementById('searchTemplateFab');
    if(backBtn)backBtn.onclick=back;
    if(searchBtn)searchBtn.onclick=enterSearch;
    if(inp)inp.oninput=()=>{if(state){state.query=inp.value||'';render();}};
    if(fab)fab.onclick=()=>{if(state?.onAdd)try{state.onAdd();}catch(e){}};
  }
  window.KarhaSearchTemplate={open,close,back,isOpen,isSearchMode,enterSearch,exitSearch,render};
  window.addEventListener('popstate',()=>{
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
})();
