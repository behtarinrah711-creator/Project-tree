import { projectContext } from './projectContext.js';
import { moduleRegistry } from './moduleRegistry.js';
import { getSession } from './session.js';
import { isProjectVisibleForSession } from './projectVisibility.js';
import { isCondemnedRoute } from '../modules/condemned/index.js';

export function parseRoute(){
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  const projectIndex = parts.findIndex(part => part === 'project' || part === 'projects');
  const decode = value => { try{ return decodeURIComponent(value); }catch{ return value; } };
  const projectId = projectIndex >= 0 ? decode(parts[projectIndex + 1]) : projectContext.getProjectId();
  const moduleId = projectIndex >= 0 ? decode(parts[projectIndex + 2] || 'dashboard') : decode(parts[0] || 'dashboard');
  return { projectId: projectId || null, moduleId };
}

export class AppRouter{
  constructor(){
    this.currentMounted = null;
    this.started = false;
    this.syncQueued = false;
    this.lastSyncedHash = null;
  }

  start(){
    if(this.started) return;
    this.started = true;
    const sync = () => {
      if(this.syncQueued) return;
      this.syncQueued = true;
      queueMicrotask(() => {
        this.syncQueued = false;
        this.sync();
      });
    };
    const syncPopState = () => {
      // Legacy child UI layers (picker/search/numpad/form history) deliberately
      // push same-URL history entries. Traversing those entries must not remount
      // the routed module underneath them. Only synchronize a pop when the hash
      // route itself actually changed.
      if(window.location.hash === this.lastSyncedHash) return;
      sync();
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', syncPopState);
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', sync, { once: true });
    } else {
      queueMicrotask(sync);
    }
  }

  navigate(projectId, moduleId = 'dashboard', { replace = false } = {}){
    if(!projectId) return false;
    const route = `#/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(moduleId || 'dashboard')}`;
    const method = replace ? 'replaceState' : 'pushState';
    if(window.location.hash !== route){
      window.history[method]({ projectId, moduleId }, '', route);
    }
    // The History API does not emit hashchange or popstate. Routing owns the
    // complete programmatic-navigation lifecycle, so synchronize it here once
    // startup has installed the route listeners. Pre-start route setup is
    // consumed by start()'s initial synchronization after Legacy is loaded.
    if(this.started) this.sync();
    return true;
  }

  sync(){
    const route = parseRoute();
    this.lastSyncedHash = window.location.hash;
    const session = getSession();
    const rawProject = route.projectId
      ? (window.KarhaApp?.projectRepository?.find?.(route.projectId) || null)
      : null;
    const allowed = !rawProject || isProjectVisibleForSession(rawProject, session);
    const projectId = allowed ? route.projectId : null;
    projectContext.setProjectId(projectId);
    if(projectId && window.KarhaAppData && window.KarhaAppData.getActiveTab?.() !== projectId){
      window.KarhaAppData.setActiveTab(projectId);
      window.KarhaAppData.persistLocal?.();
    }
    // Phase 5: condemned deep links → dashboard of the same project (not global home).
    let moduleId = route.moduleId;
    if(isCondemnedRoute(moduleId)){
      moduleId = 'dashboard';
      if(projectId){
        const safe = `#/projects/${encodeURIComponent(projectId)}/dashboard`;
        if(window.location.hash !== safe){
          window.history.replaceState({ projectId, moduleId: 'dashboard' }, '', safe);
        }
      }
    }
    const module = moduleRegistry.get(moduleId) || moduleRegistry.get('dashboard');
    window.KarhaRoute = { ...route, projectId, moduleId, module };
    if(module && projectId){
      this.currentMounted = module.mount({ projectId, route: { ...route, projectId, moduleId }, registry: moduleRegistry });
    } else {
      this.currentMounted = null;
    }
    window.dispatchEvent(new CustomEvent('karha:workspace-route-synced', {
      detail: { projectId, moduleId }
    }));
  }
}

export const appRouter = new AppRouter();
