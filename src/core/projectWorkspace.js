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

/**
 * Phase 4.3 — repository-first read.
 * After applyCloudSnapshot updates the repository, UI reads repository first.
 * Live legacy is fallback for projects not yet written to the store.
 */
function liveProject(projectId){
  try{
    return window.KarhaLegacy?.getProject?.(projectId) || null;
  }catch{
    return null;
  }
}

function liveList(){
  try{
    const list = window.KarhaLegacy?.getProjectsList?.();
    return Array.isArray(list) ? list : null;
  }catch{
    return null;
  }
}

export function listProjects(){
  const session = getSession();
  const fromRepo = projectRepository.getProjectsList();
  const fromLive = liveList();
  // Repository is source of truth; merge in live-only dirty projects by id
  const byId = new Map();
  (fromRepo || []).forEach(p => {
    if(p) byId.set(String(p.id ?? p.projectId), p);
  });
  (fromLive || []).forEach(p => {
    if(!p) return;
    const key = String(p.id ?? p.projectId);
    if(!byId.has(key)) byId.set(key, p);
    // Prefer live only when repository missing fields after incomplete hydrate —
    // if both exist, prefer repository (updated by applyCloudSnapshot).
  });
  return projectsVisibleForSession(Array.from(byId.values()), session).map(normalizeProject);
}

export function getProject(projectId = projectContext.getProjectId()){
  if(!projectId) return null;
  const fromRepo = normalizeProject(projectRepository.getActiveProject(projectId));
  const fromLive = normalizeProject(liveProject(projectId));
  // Prefer repository when present (post-applyCloudSnapshot). Fall back to live.
  const project = fromRepo || fromLive;
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
