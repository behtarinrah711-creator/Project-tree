import { appRouter } from '../core/router.js';
import { moduleRegistry } from '../core/moduleRegistry.js';
import { projectContext } from '../core/projectContext.js';
import { projectRepository } from '../data/projectRepository.js';
import { projectModules } from '../modules/index.js';
import { listProjects, getProject, getActiveProject, selectProject } from '../core/projectWorkspace.js';
import { taskRuntimeModule } from '../modules/tasks/taskRuntimeModule.js';
import { loadLegacyRuntime } from './legacyBootstrap.js';
import { reconcileDrawerProjectList } from '../core/drawerProjectList.js';
import { startCloudProjectRecovery } from '../core/cloudProjectRecovery.js';

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
    router,
    projectContext,
    projectRepository,
    taskRuntime: taskRuntimeModule,
    reconcileDrawerProjectList,
    projectWorkspace: Object.freeze({ listProjects, getProject, getActiveProject, selectProject }),
  });
  windowRef.KarhaApp = application;

  await loadLegacy();
  router.start();
  // Recovery runs beside the legacy listeners and only adds readable project
  // records back into the live array. This covers pre-ownerUid cloud documents
  // and protects login from listener-order races without changing cloud data.
  startCloudProjectRecovery({windowRef,projectContext,router});
  windowRef.dispatchEvent(new windowRef.CustomEvent('karha:ready'));
  return application;
}
