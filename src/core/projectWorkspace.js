import { projectContext } from './projectContext.js';
import { projectRepository } from '../data/projectRepository.js';
import { getSession } from './session.js';
import { isProjectVisibleForSession, projectsVisibleForSession } from './projectVisibility.js';

function normalizeProject(project){
  if(!project) return null;
  return {
    ...project,
    id: project.id ?? project.projectId ?? null,
    name: project.name ?? project.title ?? 'پروژه بدون نام',
  };
}

export function listProjects(){
  const session = getSession();
  const legacy = window.KarhaLegacy;
  const fromLegacy = legacy?.getProjectsList?.();
  const source = Array.isArray(fromLegacy) && fromLegacy.length
    ? fromLegacy
    : projectRepository.getProjectsList();
  return projectsVisibleForSession(source, session).map(normalizeProject);
}

export function getProject(projectId = projectContext.getProjectId()){
  if(!projectId) return null;
  const legacy = window.KarhaLegacy;
  const project = normalizeProject(legacy?.getProject?.(projectId))
    || normalizeProject(projectRepository.getActiveProject(projectId));
  return isProjectVisibleForSession(project, getSession()) ? project : null;
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
