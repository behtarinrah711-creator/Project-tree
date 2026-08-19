import { appRouter } from '../core/router.js';
import { moduleRegistry } from '../core/moduleRegistry.js';
import { projectContext } from '../core/projectContext.js';
import { projectRepository } from '../data/projectRepository.js';
import { projectModules } from '../modules/index.js';
import { listProjects, getProject, getActiveProject, selectProject } from '../core/projectWorkspace.js';
import { taskRuntimeModule } from '../modules/tasks/taskRuntimeModule.js';
import { loadLegacyRuntime } from './legacyBootstrap.js';
import { bindShellControls } from './shellControls.js';

// Shell navigation and authentication must remain available even when the
// project/task runtime has no active project or fails later during startup.
bindShellControls();

projectModules.forEach(moduleDefinition => moduleRegistry.register(moduleDefinition));

window.KarhaApp = Object.freeze({
  modules: moduleRegistry,
  projectContext,
  projectRepository,
  taskRuntime: taskRuntimeModule,
  projectWorkspace: Object.freeze({ listProjects, getProject, getActiveProject, selectProject }),
});

await loadLegacyRuntime();
appRouter.start();
window.dispatchEvent(new CustomEvent('karha:ready'));
