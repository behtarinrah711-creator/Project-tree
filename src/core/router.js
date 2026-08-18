import { projectContext } from './projectContext.js';
import { moduleRegistry } from './moduleRegistry.js';

function parseRoute(){
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  const projectIndex = parts.findIndex(part => part === 'project' || part === 'projects');
  const projectId = projectIndex >= 0 ? parts[projectIndex + 1] : projectContext.getProjectId();
  const moduleId = projectIndex >= 0 ? (parts[projectIndex + 2] || 'dashboard') : (parts[0] || 'dashboard');
  return { projectId: projectId || null, moduleId };
}

export class AppRouter{
  constructor(){ this.currentMounted = null; }

  start(){
    const sync = () => this.sync();
    window.addEventListener('hashchange', sync);
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', sync, { once: true });
    } else {
      queueMicrotask(sync);
    }
  }

  sync(){
    const route = parseRoute();
    projectContext.setProjectId(route.projectId);
    const module = moduleRegistry.get(route.moduleId) || moduleRegistry.get('dashboard');
    window.KarhaRoute = { ...route, module };
    if(module && route.projectId){
      this.currentMounted = module.mount({ projectId: route.projectId, route, registry: moduleRegistry });
    }
  }
}

export const appRouter = new AppRouter();
