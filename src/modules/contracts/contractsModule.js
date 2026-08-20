import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { contractRepository } from '../../data/contractRepository.js';

function resolveProjectId(explicit=null){
  return explicit || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.() || null;
}
function project(id){
  return id ? projectRepository.getActiveProject(id) : null;
}
function list(p,key){
  return Array.isArray(p?.[key]) ? p[key].filter(x=>!x.trashed) : [];
}
function findActivity(p,id){
  return (p?.activityTemplates||[]).find(a=>String(a.id)===String(id)) || null;
}
function findContact(p,id){
  return (p?.contacts||[]).find(c=>String(c.id)===String(id)) || null;
}
function money(v){
  if(v===null||v===undefined||v==='') return 'بدون مبلغ';
  try { return new Intl.NumberFormat('fa-IR').format(Number(v)); } catch { return String(v); }
}
function searchInput(placeholder,onInput){
  const wrap=document.createElement('div');
  wrap.className='workspace-search';
  const input=document.createElement('input');
  input.type='search'; input.className='workspace-search-input';
  input.placeholder=placeholder; input.autocomplete='off';
  input.addEventListener('input',()=>onInput(String(input.value||'').trim().toLocaleLowerCase('fa')));
  wrap.appendChild(input);
  return {wrap,input};
}
function legacy(name,...args){
  if(typeof window[name]==='function'){ window[name](...args); return true; }
  if(typeof window.KarhaLegacy?.[name]==='function'){
    window.KarhaLegacy[name](...args); return true;
  }
  return false;
}
function softDelete(projectId,key,id){
  const projects=projectRepository.getProjectsList();
  const p=projects.find(x=>String(x.id??x.projectId)===String(projectId));
  if(!p)return false;
  const item=(p[key]||[]).find(x=>String(x.id)===String(id));
  if(!item)return false;
  item.trashed=true; item.deletedAt=Date.now();
  projectRepository.saveProjectsList(projects);
  return true;
}

export const contractsModule={
  id:'contracts', title:'قراردادها', route:'contracts',

  mount({projectId: explicitProjectId}={}){
    this.render(explicitProjectId);
    return {projectId:explicitProjectId || resolveProjectId(),moduleId:'contracts'};
  },

  render(explicitProjectId=null){
    const id=resolveProjectId(explicitProjectId);
    const p=project(id);
    const body=document.getElementById('contractsPageBody');
    if(!body)return;
    body.innerHTML='';
    if(!p){
      body.innerHTML='<div class="contract-empty">ابتدا یک پروژه را انتخاب کنید.</div>';
      return;
    }

    const listWrap=document.createElement('div');
    listWrap.className='contract-list';
    const head=document.createElement('div');
    head.className='contract-list-head';
    const contracts=contractRepository.list(id).filter(c=>!c.trashed);
    head.innerHTML=`<span class="title">قراردادهای واقعی پیمانکاران</span><span class="mgmt-count">${new Intl.NumberFormat('fa-IR').format(contracts.length)}</span>`;
    body.append(head);

    const search=searchInput('جستجوی قرارداد، پیمانکار یا فعالیت…',q=>{
      [...listWrap.children].forEach(row=>row.hidden=!row.dataset.searchText.includes(q));
    });
    body.append(search.wrap,listWrap);

    if(!contracts.length){
      const e=document.createElement('div'); e.className='contract-empty';
      e.innerHTML='هنوز قرارداد واقعی ثبت نشده است.<br>از علامت + یک قرارداد ایجاد کنید.';
      body.appendChild(e); return;
    }

    contracts.forEach(c=>{
      const a=findActivity(p,c.activityId);
      const contact=findContact(p,c.contractorId||c.contactId);
      const title=c.title || ('قرارداد '+(a?.name||''));
      const person=contact ? ([contact.firstName,contact.lastName].filter(Boolean).join(' ')||contact.name) : 'بدون مخاطب';
      const meta=[person,a?.name||'بدون فعالیت',money(c.amount)].join(' · ');

      const row=document.createElement('div'); row.className='contract-row';
      row.dataset.searchText=(title+' '+meta).toLocaleLowerCase('fa');

      const main=document.createElement('div'); main.className='contract-main';
      const t=document.createElement('div'); t.className='contract-title'; t.textContent=title;
      const m=document.createElement('div'); m.className='contract-meta'; m.textContent=meta;
      main.append(t,m);

      const actions=document.createElement('div'); actions.className='contract-actions';
      const edit=document.createElement('button'); edit.className='contract-action'; edit.textContent='✎'; edit.title='ویرایش';
      edit.onclick=e=>{e.stopPropagation();legacy('openContractForm',c.id);};
      const del=document.createElement('button'); del.className='contract-action danger'; del.textContent='×'; del.title='حذف';
      del.onclick=e=>{
        e.stopPropagation();
        if(!confirm('آیا از حذف این قرارداد اطمینان دارید؟'))return;
        if(contractRepository.softDelete(id,c.id))this.render(id);
      };
      actions.append(edit,del); row.append(main,actions);
      main.onclick=()=>legacy('openContractForm',c.id);
      listWrap.appendChild(row);
    });
  },

  renderTemplates(explicitProjectId=null){
    const id=resolveProjectId(explicitProjectId);
    const p=project(id);
    const body=document.getElementById('contractTemplatesPageBody');
    if(!body)return;
    body.innerHTML='';
    if(!p){
      body.innerHTML='<div class="contract-empty">ابتدا یک پروژه را انتخاب کنید.</div>'; return;
    }
    const templates=list(p,'contractTemplates');
    const head=document.createElement('div');
    head.className='contract-list-head';
    head.innerHTML=`<span class="title">قالب‌های قرارداد این پروژه</span><span class="mgmt-count">${new Intl.NumberFormat('fa-IR').format(templates.length)}</span>`;
    body.appendChild(head);

    if(!templates.length){
      const e=document.createElement('div'); e.className='contract-empty';
      e.textContent='هنوز قالب قراردادی ثبت نشده است.'; body.appendChild(e); return;
    }

    const listWrap=document.createElement('div'); listWrap.className='contract-template-list';
    const search=searchInput('جستجوی قالب قرارداد…',q=>{
      [...listWrap.children].forEach(row=>row.hidden=!row.dataset.searchText.includes(q));
    });
    body.append(search.wrap,listWrap);

    templates.forEach(t=>{
      const a=findActivity(p,t.activityId);
      const title=a?`قرارداد ${a.name}`:(t.title||'قرارداد');
      const meta=(a?.name||'بدون فعالیت')+' · '+new Intl.NumberFormat('fa-IR').format(Array.isArray(t.items)?t.items.length:0)+' ماده اصلی';
      const row=document.createElement('div'); row.className='contract-template-row';
      row.dataset.searchText=(title+' '+meta).toLocaleLowerCase('fa');
      const main=document.createElement('div'); main.className='contract-template-main';
      const tt=document.createElement('div'); tt.className='contract-template-title'; tt.textContent=title;
      const mm=document.createElement('div'); mm.className='contract-template-meta'; mm.textContent=meta;
      main.append(tt,mm);
      const actions=document.createElement('div'); actions.className='contract-template-actions';
      const del=document.createElement('button'); del.type='button'; del.className='contract-template-action danger'; del.title='حذف'; del.textContent='×';
      del.onclick=e=>{
        e.preventDefault();e.stopPropagation();
        if(!confirm('آیا از حذف این قالب قرارداد اطمینان دارید؟'))return;
        if(softDelete(id,'contractTemplates',t.id))this.renderTemplates(id);
      };
      actions.appendChild(del); row.append(main,actions);
      row.onclick=()=>legacy('openContractTemplateForm',t.id);
      listWrap.appendChild(row);
    });
  }
};

export default contractsModule;
