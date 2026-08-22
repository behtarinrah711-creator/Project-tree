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
import { installProjectRouteSurfaceSync } from '../core/projectRouteSurface.js';
import { installProjectRecoveryRetention } from '../core/projectRecoveryRetention.js';
import { installBackGestureGuard } from '../core/backGestureGuard.js';
import { installContractFormExitBridge } from '../modules/contracts/contractFormExitBridge.js';
import { installLogoutSessionGuard } from './logoutSessionGuard.js';
import { getSession, installSessionObserver } from '../core/session.js';
import { activityApi } from '../domain/activityApi.js';
import { contactApi } from '../domain/contactApi.js';
import { contractApi } from '../domain/contractApi.js';
import { taskApi } from '../domain/taskApi.js';
import { projectApi } from '../domain/projectApi.js';
import * as mergePolicy from '../domain/mergePolicy.js';

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
    getSession,
    activityApi,
    contactApi,
    contractApi,
    taskApi,
    projectApi,
    mergePolicy,
  });
  windowRef.KarhaApp = application;

  await loadLegacy();
  // Observe uid only. Does not own login, logout, or cloud migrate.
  installSessionObserver({windowRef});
  // Child overlays (search template / numpad / Jalali picker) own their Back
  // gesture and must never cascade into closing the parent contract form.
  installBackGestureGuard({windowRef,documentRef:windowRef.document});
  // Contract forms use a reusable baseline/dirty policy. New records may save
  // drafts; edits never draft and save changes back to the same contract.
  installContractFormExitBridge({windowRef});
  // Logout is a session boundary. Clear Project-tree's local user cache only
  // when Firebase actually transitions from an authenticated user to guest,
  // then reload so legacy in-memory recovery state cannot resurrect it.
  installLogoutSessionGuard({windowRef});
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
