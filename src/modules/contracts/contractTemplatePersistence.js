import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';

function activeId(projectId=null){
  return projectId || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.() || null;
}

export function saveContractTemplate(projectId, template, activityName=''){
  const id=activeId(projectId);
  if(!id || !template) return false;

  const projects=projectRepository.getProjectsList() || [];
  const index=projects.findIndex(p=>String(p.id ?? p.projectId)===String(id));
  if(index<0) return false;

  const project=projects[index];
  if(!Array.isArray(project.contractTemplates)) project.contractTemplates=[];

  const normalized=JSON.parse(JSON.stringify(template));
  normalized.title=`قرارداد ${activityName || normalized.title || ''}`.trim();
  normalized.items=(normalized.items||[])
    .filter(x=>String(x?.text||'').trim())
    .map(x=>({
      ...x,
      children:(x.children||[]).filter(c=>String(c?.text||'').trim())
    }));
  normalized.paymentItems=[];
  normalized.updatedAt=Date.now();
  normalized.trashed=false;

  const itemIndex=project.contractTemplates.findIndex(
    x=>String(x.id)===String(normalized.id)
  );

  if(itemIndex>=0) project.contractTemplates[itemIndex]=normalized;
  else project.contractTemplates.push(normalized);

  projectRepository.saveProjectsList(projects);
  return normalized;
}

export function deleteContractTemplate(projectId, templateId){
  const id=activeId(projectId);
  if(!id || !templateId) return false;

  const projects=projectRepository.getProjectsList() || [];
  const project=projects.find(p=>String(p.id ?? p.projectId)===String(id));
  if(!project || !Array.isArray(project.contractTemplates)) return false;

  const item=project.contractTemplates.find(x=>String(x.id)===String(templateId));
  if(!item) return false;

  item.trashed=true;
  item.deletedAt=Date.now();
  projectRepository.saveProjectsList(projects);
  return true;
}
