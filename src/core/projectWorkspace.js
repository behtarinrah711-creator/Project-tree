import { projectContext } from './projectContext.js';
import { projectRepository } from '../data/projectRepository.js';

function normalizeProject(project){
  if(!project) return null;
  return {
    ...project,
    id: project.id ?? project.projectId ?? null,
    name: project.name ?? project.title ?? 'پروژه بدون نام',
  };
}

export function listProjects(){
  const legacy = window.KarhaLegacy;
  const fromLegacy = legacy?.getProjectsList?.();
  if(Array.isArray(fromLegacy) && fromLegacy.length) return fromLegacy.map(normalizeProject);
  return projectRepository.getProjectsList().map(normalizeProject);
}

export function getProject(projectId = projectContext.getProjectId()){
  if(!projectId) return null;
  const legacy = window.KarhaLegacy;
  const project = legacy?.getProject?.(projectId);
  return normalizeProject(project) || normalizeProject(projectRepository.getActiveProject(projectId));
}

export function getActiveProject(){
  return getProject(projectContext.getProjectId());
}

export function selectProject(projectId, { moduleId = 'dashboard' } = {}){
  const project = getProject(projectId);
  if(!project) return false;

  const legacy = window.KarhaLegacy;
  if(typeof legacy?.selectProject === 'function'){
    return legacy.selectProject(project.id, { moduleId });
  }

  projectContext.setProjectId(project.id);
  const route = `#/projects/${encodeURIComponent(project.id)}/${encodeURIComponent(moduleId)}`;
  if(window.location.hash !== route) window.location.hash = route;
  return true;
}
