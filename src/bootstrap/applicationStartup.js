import { appRouter } from '../core/router.js';
import { moduleRegistry } from '../core/moduleRegistry.js';
import { projectContext } from '../core/projectContext.js';
import { projectRepository } from '../data/projectRepository.js';
import { projectModules } from '../modules/index.js';
import { listProjects, getProject, getActiveProject, selectProject } from '../core/projectWorkspace.js';
import { taskRuntimeModule } from '../modules/tasks/taskRuntimeModule.js';
import { projectSelection, bindProjectSelectionRow } from '../core/projectSelection.js';
import { loadLegacyRuntime } from './legacyBootstrap.js';

/** Start the modular API, then the classic legacy runtime, then routing. */
export async function startApplication({
  windowRef = window,
  registry = moduleRegistry,
  modules = projectModules,
  router = appRouter,
  loadLegacy = loadLegacyRuntime,
} = {}){
  modules.forEach(moduleDefinition => registry.register(moduleDefinition));

  const application = Object.freeze({
    modules: registry,
    projectContext,
    projectRepository,
    taskRuntime: taskRuntimeModule,
    projectSelection,
    bindProjectSelectionRow,
    projectWorkspace: Object.freeze({ listProjects, getProject, getActiveProject, selectProject }),
  });
  windowRef.KarhaApp = application;

  await loadLegacy();
  router.start();
  windowRef.dispatchEvent(new windowRef.CustomEvent('karha:ready'));
  return application;
}
