function asArray(value){ return Array.isArray(value) ? value : []; }

function itemId(item){ return String(item?.id ?? ''); }

function walk(items, visit){
  for(const item of asArray(items)){
    if(!item) continue;
    if(visit(item)) return item;
    const found=walk(item.subtasks,visit);
    if(found) return found;
  }
  return null;
}

function findById(items,id){
  const key=String(id ?? '');
  if(!key) return null;
  return walk(items,item=>itemId(item)===key);
}

function pathParts(value){
  return String(value || '').split('/').map(part=>part.trim()).filter(Boolean);
}

function stablePartId(rootId,index,text){
  let hash=2166136261;
  const source=String(rootId)+'|'+String(index)+'|'+String(text || '');
  for(let i=0;i<source.length;i++){
    hash^=source.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return 'recovered_'+(hash>>>0).toString(36);
}

function inferredActivityIds(contract){
  const ids=[];
  asArray(contract?.activityIds).forEach(id=>{ if(id!=null && id!=='') ids.push(String(id)); });
  if(contract?.activityId!=null && contract.activityId!=='') ids.push(String(contract.activityId));
  return [...new Set(ids)];
}

function makeRecoveredItem(id,text,{activities=[]}={}){
  return {
    id:String(id),
    text:String(text || 'آیتم بازیابی‌شده'),
    done:false,
    starred:false,
    cost:null,
    activities:[...activities],
    subtasks:[],
    completedAt:null,
    recoveredFromContract:true,
    recoveryLocked:true,
  };
}

function appendRecoveredPath(root,parts,targetId,activityIds){
  if(!root || !targetId) return false;
  if(findById([root],targetId)) return false;
  const remaining=parts.slice(1);
  if(!remaining.length){
    if(itemId(root)===String(targetId)) return false;
    root.subtasks=asArray(root.subtasks);
    root.subtasks.push(makeRecoveredItem(targetId,parts.at(-1) || root.text,{activities:activityIds}));
    return true;
  }
  let parent=root;
  remaining.forEach((label,index)=>{
    const last=index===remaining.length-1;
    const id=last ? String(targetId) : stablePartId(root.id,index,label);
    let child=findById(parent.subtasks,id);
    if(!child){
      child=makeRecoveredItem(id,label,{activities:last ? activityIds : []});
      parent.subtasks=asArray(parent.subtasks);
      parent.subtasks.push(child);
    }else if(last && activityIds.length){
      child.activities=[...new Set([...asArray(child.activities).map(String),...activityIds])];
    }
    parent=child;
  });
  return true;
}

export function recoverContractLinkedTasks(project){
  if(!project) return {changed:false,recovered:0,contractsChecked:0};
  if(!Array.isArray(project.tasks)) project.tasks=[];
  const contracts=asArray(project.contracts).filter(contract=>contract && !contract.trashed && contract.projectItemId);
  let recovered=0;

  for(const contract of contracts){
    const targetId=String(contract.projectItemId || '');
    if(!targetId || findById(project.tasks,targetId)) continue;

    const parts=pathParts(contract.projectItemPath);
    const rootId=String(contract.projectItemRootTaskId || targetId);
    const activityIds=inferredActivityIds(contract);
    let root=findById(project.tasks,rootId);

    if(!root){
      const rootLabel=parts[0] || contract.projectItemPath || contract.title || 'آیتم بازیابی‌شده قرارداد';
      root=makeRecoveredItem(rootId,rootLabel,{activities:rootId===targetId ? activityIds : []});
      project.tasks.push(root);
      if(rootId===targetId){ recovered++; continue; }
    }

    const normalizedParts=parts.length ? parts : [root.text || 'آیتم پروژه', contract.title || 'آیتم قرارداد'];
    if(appendRecoveredPath(root,normalizedParts,targetId,activityIds)) recovered++;
  }

  return {changed:recovered>0,recovered,contractsChecked:contracts.length};
}

export function installContractLinkedTaskRecovery({windowRef=window,router=null}={}){
  if(windowRef.__karhaContractLinkedTaskRecoveryInstalled) return false;
  windowRef.__karhaContractLinkedTaskRecoveryInstalled=true;
  let repairing=false;

  const repair=()=>{
    if(repairing) return false;
    const legacy=windowRef.KarhaLegacy;
    const projects=legacy?.getProjectsList?.();
    if(!Array.isArray(projects)) return false;
    const changedProjects=[];
    projects.forEach(project=>{
      const result=recoverContractLinkedTasks(project);
      if(result.changed) changedProjects.push(project);
    });
    if(!changedProjects.length) return false;

    repairing=true;
    try{
      changedProjects.forEach(project=>{
        if(typeof legacy?.projectItemRuntime?.persistItems==='function'){
          legacy.projectItemRuntime.persistItems(project.id);
        }else{
          legacy?.persist?.();
        }
      });
      queueMicrotask(()=>{
        try{ router?.sync?.(); }catch{}
      });
    }finally{
      repairing=false;
    }
    return true;
  };

  windowRef.addEventListener?.('karha:projects-recovered',repair);
  windowRef.addEventListener?.('karha:workspace-route-synced',repair);
  windowRef.addEventListener?.('karha:ready',repair);
  return true;
}
