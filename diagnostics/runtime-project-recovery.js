const STORAGE_KEY='gtasks-clone-v2';
const firebaseConfig={
  apiKey:'AIzaSyBbRk4MsdHtj-gWnjbJExvQgW0sY6Z4uK8',
  authDomain:'tree-d92af.firebaseapp.com',
  projectId:'tree-d92af',
  storageBucket:'tree-d92af.firebasestorage.app',
  messagingSenderId:'401523332370',
  appId:'1:401523332370:web:3a524a2b86b967ca4d8fcb'
};

const $=id=>document.getElementById(id);
const status=$('status');
const output=$('output');
const setStatus=(text,kind='')=>{status.className=`muted ${kind}`;status.textContent=text;};
const asArray=v=>Array.isArray(v)?v:[];
const idOf=v=>v==null?null:String(v);
const projectIdOf=p=>idOf(p?.id ?? p?.projectId);
const normalize=s=>String(s||'').trim().toLowerCase();

function parseLocal(){
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw) return {rawPresent:false,snapshot:null,projects:[]};
  try{
    const snapshot=JSON.parse(raw);
    const projects=Array.isArray(snapshot)?snapshot:asArray(snapshot?.projects);
    return {rawPresent:true,snapshot,projects};
  }catch(error){
    return {rawPresent:true,snapshot:null,projects:[],error:error.message};
  }
}

function flattenTasks(tasks){
  const records=[];
  const byId=new Map();
  const visit=(items,rootTaskId=null,parentId=null)=>{
    asArray(items).forEach(item=>{
      if(!item || item.id==null) return;
      const id=String(item.id);
      const rec={
        id,
        kind:rootTaskId?'subtask':'task',
        rootTaskId:rootTaskId||id,
        parentId,
        title:item.title ?? item.name ?? item.text ?? null,
        trashed:item.trashed===true,
        pendingDelete:item.pendingDelete===true,
        done:item.done===true,
        deletedAt:item.deletedAt ?? null,
        deletedType:item.deletedType ?? null,
        deletedParentId:item.deletedParentId ?? null,
      };
      records.push(rec);byId.set(id,rec);
      visit(item.subtasks,rec.rootTaskId,id);
    });
  };
  visit(tasks);
  return {records,byId};
}

const TEMPLATE_FIELDS=['templateId','contractTemplateId','formTemplateId','templateID','contractTemplateID'];
const CONTACT_FIELDS=['contractorId','employerId','contactId','employerContactId','partyId','contractorContactId'];
const ACTIVITY_CONTACT_FIELDS=['contractorId','contactId','contractorContactId','partyId','personId'];

function summarizeTemplate(t){
  return {id:idOf(t.id),title:t.title??t.name??null,activityId:idOf(t.activityId),trashed:t.trashed===true,hidden:t.hidden===true,deletedAt:t.deletedAt??null};
}

function summarizeContract(contract){
  const contactRefs=[];
  CONTACT_FIELDS.forEach(field=>{
    const value=idOf(contract?.[field]);
    if(value) contactRefs.push({field,id:value});
  });
  return {
    contractId:idOf(contract?.id),
    activityId:idOf(contract?.activityId),
    projectItemId:idOf(contract?.projectItemId),
    templateIds:TEMPLATE_FIELDS.map(field=>({field,id:idOf(contract?.[field])})).filter(x=>x.id),
    contactRefs,
    trashed:contract?.trashed===true,
  };
}

function analyzeProject(project,source){
  if(!project) return null;
  const tasks=asArray(project.tasks);
  const contracts=asArray(project.contracts).filter(x=>x && !x.trashed);
  const templates=asArray(project.contractTemplates);
  const activities=asArray(project.activityTemplates);
  const contacts=asArray(project.contacts);
  const {records,byId}=flattenTasks(tasks);
  const templateById=new Map(templates.filter(x=>x?.id!=null).map(x=>[String(x.id),x]));
  const contactIds=new Set(contacts.filter(x=>x?.id!=null).map(x=>String(x.id)));
  const contractReports=contracts.map(contract=>{
    const contractId=idOf(contract.id);
    const activityId=idOf(contract.activityId);
    const projectItemId=idOf(contract.projectItemId);
    const taskMatch=projectItemId?byId.get(projectItemId)||null:null;
    const templateRefs=[];
    TEMPLATE_FIELDS.forEach(field=>{
      const value=idOf(contract[field]);
      if(value) templateRefs.push({field,id:value,match:templateById.has(value),template:templateById.get(value)?summarizeTemplate(templateById.get(value)):null});
    });
    const contactRefs=[];
    CONTACT_FIELDS.forEach(field=>{
      const value=idOf(contract[field]);
      if(value) contactRefs.push({field,id:value,match:contactIds.has(value)});
    });
    return {contractId,activityId,projectItemId,taskMatch,templateRefs,contactRefs};
  });

  const activityReports=activities.map(activity=>{
    const activityId=idOf(activity?.id);
    const activityContactRefs=[];
    ACTIVITY_CONTACT_FIELDS.forEach(field=>{
      const value=idOf(activity?.[field]);
      if(value) activityContactRefs.push({field,id:value,match:contactIds.has(value)});
    });
    const relatedContracts=contractReports.filter(report=>activityId && report.activityId===activityId);
    const relatedTemplates=templates
      .filter(template=>activityId && idOf(template?.activityId)===activityId)
      .map(summarizeTemplate);
    const contractContactIds=new Set(relatedContracts.flatMap(report=>report.contactRefs.map(ref=>ref.id)));
    return {
      activityId,
      name:activity?.name ?? activity?.title ?? null,
      trashed:activity?.trashed===true,
      activityContactRefs,
      relatedContractIds:relatedContracts.map(report=>report.contractId),
      relatedContracts,
      relatedTemplateIds:relatedTemplates.map(template=>template.id),
      relatedTemplates,
      contractorContactIntersection:activityContactRefs
        .filter(ref=>contractContactIds.has(ref.id))
        .map(ref=>ref.id),
    };
  });

  return {
    source,
    projectId:projectIdOf(project),
    name:project.name ?? null,
    counts:{tasks:tasks.length,records:records.length,visible:records.filter(x=>!x.trashed&&!x.pendingDelete).length,trashed:records.filter(x=>x.trashed).length,done:records.filter(x=>x.done).length,contracts:contracts.length,templates:templates.length,activities:activities.length,contacts:contacts.length},
    contractSource:{source,total:contracts.length,contractIds:contracts.map(c=>idOf(c.id)).filter(Boolean),contracts:contracts.map(summarizeContract)},
    contractReports,
    activityReports,
    referencedTrashed:contractReports.filter(x=>x.taskMatch?.trashed).map(x=>({contractId:x.contractId,projectItemId:x.projectItemId,task:x.taskMatch})),
    unresolvedProjectItems:contractReports.filter(x=>x.projectItemId&&!x.taskMatch).map(x=>({contractId:x.contractId,projectItemId:x.projectItemId})),
  };
}

async function ensureFirebase(){
  if(!window.firebase) throw new Error('Firebase SDK unavailable');
  if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  return {auth:firebase.auth(),db:firebase.firestore()};
}

function waitForAuth(auth){
  return new Promise(resolve=>{
    let done=false;
    const finish=user=>{if(done)return;done=true;try{unsub?.();}catch{}resolve(user||null);};
    const unsub=auth.onAuthStateChanged(finish,()=>finish(null));
    setTimeout(()=>finish(auth.currentUser||null),2500);
  });
}

async function readCloudProjects(db,user){
  if(!user) return {user:null,projects:[],errors:['not-authenticated']};
  const email=normalize(user.email);
  const queries=[['ownerUid',db.collection('projects').where('ownerUid','==',user.uid)]];
  if(email){queries.push(['ownerEmail',db.collection('projects').where('ownerEmail','==',email)]);queries.push(['sharedWith',db.collection('projects').where('sharedWith','array-contains',email)]);}
  const byId=new Map();const errors=[];
  for(const [name,q] of queries){
    try{const snap=await q.get();snap.docs.forEach(doc=>{if(!byId.has(doc.id))byId.set(doc.id,{id:doc.id,...doc.data(),__source:name});});}
    catch(error){errors.push(`${name}: ${error.code||error.message}`);}
  }
  return {user:{uid:user.uid,email:user.email||null},projects:[...byId.values()],errors};
}

async function hydrateCloudTasks(db,project){
  const snap=await db.collection('projects').doc(project.id).collection('tasks').get();
  return snap.docs.map(doc=>({id:doc.id,...doc.data()}));
}

function pickByGuideName(projects,name){
  const wanted=String(name||'').trim();
  return asArray(projects).filter(p=>String(p?.name||'').trim()===wanted);
}

function buildContractCrossSource(analyses){
  const byProject=new Map();
  analyses.forEach(analysis=>{
    if(!analysis?.projectId) return;
    if(!byProject.has(analysis.projectId)) byProject.set(analysis.projectId,[]);
    byProject.get(analysis.projectId).push(analysis.contractSource);
  });
  return [...byProject.entries()].map(([projectId,sources])=>{
    const allIds=new Set(sources.flatMap(source=>source.contractIds));
    const presence=[...allIds].map(contractId=>({
      contractId,
      sources:sources.filter(source=>source.contractIds.includes(contractId)).map(source=>source.source),
      missingFrom:sources.filter(source=>!source.contractIds.includes(contractId)).map(source=>source.source),
    }));
    return {projectId,sources,presence};
  });
}

async function run(){
  setStatus('در حال خواندن داده‌ها…');output.value='';
  const guideName=$('projectName').value.trim();
  const local=parseLocal();
  const localMatches=pickByGuideName(local.projects,guideName);
  let cloud={user:null,projects:[],errors:[]};let cloudMatches=[];let firebaseError=null;
  try{
    const {auth,db}=await ensureFirebase();
    const user=await waitForAuth(auth);
    cloud=await readCloudProjects(db,user);
    cloudMatches=pickByGuideName(cloud.projects,guideName);
    for(const p of cloudMatches){
      try{p.tasks=await hydrateCloudTasks(db,p);p.__tasksHydrated=true;}catch(error){p.__tasksHydrated=false;p.__taskReadError=error.code||error.message;}
    }
  }catch(error){firebaseError=error.message;}

  const ids=new Set([...localMatches,...cloudMatches].map(projectIdOf).filter(Boolean));
  const analyses=[];
  localMatches.forEach(p=>analyses.push(analyzeProject(p,'localStorage')));
  cloudMatches.forEach(p=>analyses.push(analyzeProject(p,`firestore:${p.__source||'readable-project'}${p.__tasksHydrated?'+tasks':''}`)));
  const crossSourceConflicts=[];
  ids.forEach(id=>{
    const matches=analyses.filter(a=>a?.projectId===id);
    if(matches.length>1){
      const signatures=matches.map(a=>({source:a.source,counts:a.counts,refs:a.contractReports.map(r=>({contractId:r.contractId,activityId:r.activityId,projectItemId:r.projectItemId,templateRefs:r.templateRefs.map(t=>t.id)}))}));
      crossSourceConflicts.push({projectId:id,sources:signatures});
    }
  });

  const report={
    diagnosticVersion:2,
    generatedAt:new Date().toISOString(),
    readOnly:true,
    mutationsPerformed:false,
    guideProjectName:guideName,
    local:{storageKey:STORAGE_KEY,present:local.rawPresent,parseError:local.error||null,totalProjects:local.projects.length,matchingProjects:localMatches.map(p=>({projectId:projectIdOf(p),name:p.name}))},
    cloud:{authenticated:!!cloud.user,user:cloud.user,errors:cloud.errors,firebaseError,totalReadableProjects:cloud.projects.length,matchingProjects:cloudMatches.map(p=>({projectId:projectIdOf(p),name:p.name,projectSource:p.__source,tasksHydrated:!!p.__tasksHydrated,taskReadError:p.__taskReadError||null}))},
    analyses,
    contractSourceComparison:buildContractCrossSource(analyses),
    crossSourceConflicts,
    recoveryCandidates:analyses.flatMap(a=>a.referencedTrashed.map(x=>({source:a.source,projectId:a.projectId,...x}))),
    unresolvedReferences:analyses.flatMap(a=>a.unresolvedProjectItems.map(x=>({source:a.source,projectId:a.projectId,...x}))),
  };
  output.value=JSON.stringify(report,null,2);
  if(!analyses.length) setStatus('پروژه با این نام در localStorage یا پروژه‌های قابل‌خواندن Firebase پیدا نشد.','warn');
  else if(report.recoveryCandidates.length) setStatus(`پیدا شد: ${report.recoveryCandidates.length} تسک/زیرتسک ارجاع‌شده و soft-deleted. فقط گزارش شده؛ هیچ تغییری انجام نشد.`,'ok');
  else if(report.unresolvedReferences.length) setStatus(`ارجاع قرارداد پیدا شد ولی ${report.unresolvedReferences.length} projectItemId در داده خوانده‌شده resolve نشد. گزارش را کپی کن.`,'warn');
  else setStatus('تشخیص کامل شد؛ مسیر activity → contract و منبع قراردادها هم در گزارش آمده است.','ok');
}

$('runBtn').addEventListener('click',()=>run().catch(error=>{setStatus(error.message,'err');output.value=JSON.stringify({error:error.message,mutationsPerformed:false},null,2);}));
$('copyBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(output.value);setStatus('گزارش کپی شد.','ok');}catch{output.select();document.execCommand('copy');setStatus('گزارش کپی شد.','ok');}});
