import { projectContext } from './projectContext.js';
import { moduleRegistry } from './moduleRegistry.js';

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

  queueSync(){
    if(this.syncQueued) return;
    this.syncQueued = true;
    queueMicrotask(() => {
      this.syncQueued = false;
      this.sync();
    });
  }

  start(){
    if(this.started) return;
    this.started = true;
    const sync = () => this.queueSync();
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
      this.queueSync();
    }
  }

  navigate(projectId, moduleId = 'dashboard', { replace = false } = {}){
    if(!projectId) return false;
    const route = `#/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(moduleId || 'dashboard')}`;
    const method = replace ? 'replaceState' : 'pushState';
    const routeChanged = window.location.hash !== route;
    if(routeChanged){
      window.history[method]({ projectId, moduleId }, '', route);
    }
    // The History API does not emit hashchange or popstate. Normal programmatic
    // navigation synchronizes immediately. Legacy renderAll(), however, calls a
    // same-route replace while it is still rendering the old dashboard. Queue
    // that remount to the next microtask so the modular dashboard becomes the
    // single final renderer instead of being appended to by the legacy renderer.
    if(this.started){
      if(!routeChanged && replace) this.queueSync();
      else this.sync();
    }
    return true;
  }

  sync(){
    const route = parseRoute();
    this.lastSyncedHash = window.location.hash;
    projectContext.setProjectId(route.projectId);
    const module = moduleRegistry.get(route.moduleId) || moduleRegistry.get('dashboard');
    window.KarhaRoute = { ...route, module };
    if(module && route.projectId){
      this.currentMounted = module.mount({ projectId: route.projectId, route, registry: moduleRegistry });
    } else {
      this.currentMounted = null;
    }
    window.dispatchEvent(new CustomEvent('karha:workspace-route-synced', {
      detail: { ...route, moduleId: route.moduleId }
    }));
  }
}

export const appRouter = new AppRouter();
