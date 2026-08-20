import { appRouter } from '../core/router.js';
import { moduleRegistry } from '../core/moduleRegistry.js';
import { projectContext } from '../core/projectContext.js';
import { projectRepository } from '../data/projectRepository.js';
import { loadProjectModules } from '../modules/loadProjectModules.js';
import { listProjects, getProject, getActiveProject, selectProject } from '../core/projectWorkspace.js';
import { taskRuntimeModule } from '../modules/tasks/taskRuntimeModule.js';
import { loadLegacyRuntime } from './legacyBootstrap.js';
import { reconcileDrawerProjectList } from '../core/drawerProjectList.js';
import { startCloudProjectRecovery } from '../core/cloudProjectRecovery.js';
import { installProjectRouteSurfaceSync } from '../core/projectRouteSurface.js';
import { installProjectRecoveryRetention } from '../core/projectRecoveryRetention.js';

/** Start the modular API, then the classic legacy runtime, then routing. */
export async function startApplication({
  windowRef = window,
  registry = moduleRegistry,
  modules = null,
  loadModules = loadProjectModules,
  router = appRouter,
  loadLegacy = loadLegacyRuntime,
} = {}){
  // Establish the stable application boundary before optional feature modules
  // touch the network. Drawer/project/auth infrastructure must remain available
  // even if one feature chunk temporarily returns 5xx from static hosting.
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

  const moduleDefinitions = Array.isArray(modules) ? modules : await loadModules();
  moduleDefinitions.forEach(moduleDefinition => registry.register(moduleDefinition));

  await loadLegacy();
  // Legacy still owns visibility of the internal page shells. Install one
  // explicit handoff before Router starts so Dashboard navigation always
  // exposes the mounted project/task surface instead of leaving Reports,
  // Settings or another internal page covering it.
  installProjectRouteSurfaceSync({windowRef,documentRef:windowRef.document});
  // Preserve the last known-good project set across the migration boundary.
  // A later legacy Firestore snapshot must not erase projects already restored
  // by the authenticated recovery bridge during this same session.
  installProjectRecoveryRetention({windowRef});
  router.start();
  // Recovery runs beside the legacy listeners and only adds readable project
  // records back into the live array. This covers pre-ownerUid cloud documents
  // and protects login from listener-order races without changing cloud data.
  startCloudProjectRecovery({windowRef,projectContext,router});
  windowRef.dispatchEvent(new windowRef.CustomEvent('karha:ready'));
  return application;
}
