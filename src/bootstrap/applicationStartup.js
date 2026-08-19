import { appRouter } from '../core/router.js';
import { moduleRegistry } from '../core/moduleRegistry.js';
import { projectContext } from '../core/projectContext.js';
import { projectRepository } from '../data/projectRepository.js';
import { projectModules } from '../modules/index.js';
import { listProjects, getProject, getActiveProject, selectProject } from '../core/projectWorkspace.js';
import { taskRuntimeModule } from '../modules/tasks/taskRuntimeModule.js';
import { loadLegacyRuntime } from './legacyBootstrap.js';

export async function startApplication({
  registry = moduleRegistry,
  modules = projectModules,
  router = appRouter,
  legacyLoader = loadLegacyRuntime,
  windowRef = window,
} = {}){
  modules.forEach(moduleDefinition => registry.register(moduleDefinition));

  windowRef.KarhaApp = Object.freeze({
    modules: registry,
    projectContext,
    projectRepository,
    taskRuntime: taskRuntimeModule,
    projectWorkspace: Object.freeze({ listProjects, getProject, getActiveProject, selectProject }),
  });

  await legacyLoader();
  router.start();
  windowRef.dispatchEvent(new windowRef.CustomEvent('karha:ready'));
  return windowRef.KarhaApp;
}
