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
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
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
