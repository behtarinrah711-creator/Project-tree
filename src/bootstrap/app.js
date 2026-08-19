import { appRouter } from '../core/router.js';
import { moduleRegistry } from '../core/moduleRegistry.js';
import { projectContext } from '../core/projectContext.js';
import { projectRepository } from '../data/projectRepository.js';
import { projectModules } from '../modules/index.js';
import { listProjects, getProject, getActiveProject, selectProject } from '../core/projectWorkspace.js';
import { SITE_VERSION } from '../core/siteVersion.js';

projectModules.forEach(moduleDefinition => moduleRegistry.register(moduleDefinition));
appRouter.start();

const siteVersion=document.getElementById('siteVersion');
if(siteVersion) siteVersion.textContent=SITE_VERSION;

window.KarhaApp = Object.freeze({
  modules: moduleRegistry,
  projectContext,
  projectRepository,
  projectWorkspace: Object.freeze({ listProjects, getProject, getActiveProject, selectProject }),
});
