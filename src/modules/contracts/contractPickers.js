import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { cloneTemplateIntoContract } from './realContractDomain.js';

function getProject(projectId=null){
  const id=projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.();
  return id ? projectRepository.getActiveProject(id) : null;
}
function contacts(p){ return Array.isArray(p?.contacts)?p.contacts.filter(c=>!c.trashed):[]; }
function activities(p){ return Array.isArray(p?.activityTemplates)?p.activityTemplates.filter(a=>!a.trashed):[]; }
function templates(p){ return Array.isArray(p?.contractTemplates)?p.contractTemplates.filter(t=>!t.trashed):[]; }
function findContact(p,id){return contacts(p).find(c=>String(c.id)===String(id))||null;}
function findActivity(p,id){return activities(p).find(a=>String(a.id)===String(id))||null;}
function findProjectItems(p){
  const out=[];
  const roots=Array.isArray(p?.tasks)?p.tasks:[];
  const walk=(items,path=[],rootId='')=>{
    (items||[]).forEach(x=>{
      const id=x.id; const next=[...path,x.title||x.name||''].filter(Boolean);
      out.push({id,path:next.join(' / '),rootId:rootId||id,raw:x});
      walk(x.children,next,rootId||id);
    });
  };
  walk(roots);
  return out;
}
function openSearch(opts){
  if(typeof window?.openSearchTemplate==='function') return window.openSearchTemplate(opts);
  return false;
}

export function selectContractor(projectId,state,item){
  const p=getProject(projectId); if(!p||!state||!item)return false;
  const contact=findContact(p,item.id);
  const aid=String(state.activityId||'');
  if(aid && !(contact?.activities||[]).some(x=>String(x)===aid)) return false;
  state.contractorId=item.id; state.contactId=item.id;
  if(typeof window?.syncContractPartyData==='function') window.syncContractPartyData(state,p);
  return true;
}
export function selectEmployer(projectId,state,item){
  const p=getProject(projectId); if(!p||!state||!item)return false;
  state.employerId=item.id;
  if(typeof window?.syncContractPartyData==='function') window.syncContractPartyData(state,p);
  return true;
}
export function selectActivity(projectId,state,item){
  const p=getProject(projectId); if(!p||!state||!item)return false;
  state.activityId=item.id; state.activityIds=[item.id];
  const ts=templates(p).filter(t=>String(t.activityId)===String(item.id));
  if(ts.length===1){
    state.templateId=ts[0].id;
    state.items=cloneTemplateIntoContract(ts[0]);
    state.paymentItems=JSON.parse(JSON.stringify(ts[0].paymentItems||[]));
  }else{
    state.templateId='';state.items=[];state.paymentItems=[];
  }
  return true;
}
export function selectProjectItem(projectId,state,item){
  const p=getProject(projectId);
  if(!p||!state||!item)return false;
  const raw=item._raw||item;
  state.projectItemId=raw.id;
  state.projectItemRootTaskId=raw.rootId||'';
  state.projectItemPath=item.name||raw.path||'';
  const ids=Array.isArray(raw.activities) ? raw.activities.filter(Boolean).map(String) : [];
  state.activityId='';
  state.activityIds=ids;
  state.templateId='';
  state.items=[];
  state.paymentItems=[];
  return true;
}

export function openContractorPicker(projectId,state,onChange,onAdd){
  const p=getProject(projectId); if(!p)return false;
  const aid=String(state?.activityId||'');
  const list=contacts(p).filter(c=>!aid || (c.activities||[]).some(x=>String(x)===aid));
  return openSearch({
    title:'انتخاب پیمانکار',listTitle:'پیمانکاران',selectedTitle:'پیمانکاران منتخب',
    contextKey:'contractor:'+aid,
    items:list.map(c=>({id:c.id,name:c.name||[c.firstName,c.lastName].filter(Boolean).join(' ')})),
    showStar:true,showAdd:true,onSelect:item=>{
      if(selectContractor(projectId,state,item)){onChange?.(state);}
    },onAdd:onAdd
  });
}
export function openEmployerPicker(projectId,state,onChange,onAdd){
  const p=getProject(projectId); if(!p)return false;
  return openSearch({
    title:'انتخاب کارفرما',listTitle:'کارفرمایان',selectedTitle:'کارفرمایان منتخب',
    contextKey:'employer',items:contacts(p).map(c=>({id:c.id,name:c.name||[c.firstName,c.lastName].filter(Boolean).join(' ')})),
    showStar:true,showAdd:true,
    onSelect:item=>{selectEmployer(projectId,state,item);onChange?.(state);},
    onAdd:onAdd
  });
}
export function openActivityPicker(projectId,state,onChange,onAdd){
  const p=getProject(projectId); if(!p)return false;
  const ids=Array.isArray(state?.activityIds)?state.activityIds.map(String):[];
  const acts=activities(p).filter(a=>ids.some(id=>String(a.id)===id));
  return openSearch({
    title:'انتخاب فعالیت',listTitle:'فعالیت‌ها',selectedTitle:'فعالیت‌های منتخب',
    contextKey:'activity:projectItem:'+String(state?.projectItemId||''),
    items:acts.map(a=>({id:a.id,name:a.name||a.title||'فعالیت'})),
    showStar:true,showAdd:true,
    onSelect:item=>{if(selectActivity(projectId,state,item)){onChange?.(state);}},
    onAdd:onAdd
  });
}
export function openProjectItemPicker(projectId,state,onChange,onAddActivity){
  const p=getProject(projectId); if(!p)return false;
  const all=findProjectItems(p);
  return openSearch({
    title:'انتخاب آیتم پروژه',listTitle:'آیتم‌های پروژه',selectedTitle:'آیتم‌های منتخب',
    contextKey:'projectItem',
    items:all.map(x=>({id:x.id,name:x.path,_raw:x})),
    showStar:true,showAdd:false,
    onSelect:item=>{
      if(!selectProjectItem(projectId,state,item))return;
      onChange?.(state);
      openActivityPicker(projectId,state,onChange,onAddActivity);
    }
  });
}
export function openStaticChoicePicker(title,listTitle,options,currentValue,onPick){
  return openSearch({
    title,listTitle,selectedTitle:listTitle+' منتخب',
    contextKey:'static:'+title,
    items:(options||[]).filter(o=>String(o.value||'')!=='')
      .map(o=>({id:String(o.value),name:String(o.label||o.value)})),
    showStar:false,showAdd:false,
    onSelect:item=>onPick?.(item.id)
  });
}
