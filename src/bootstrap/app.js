import { appRouter } from '../core/router.js';
import { moduleRegistry } from '../core/moduleRegistry.js';
import { projectContext } from '../core/projectContext.js';
import { projectRepository } from '../data/projectRepository.js';
import { projectModules } from '../modules/index.js';

projectModules.forEach(moduleDefinition => moduleRegistry.register(moduleDefinition));
appRouter.start();

window.KarhaApp = Object.freeze({
  modules: moduleRegistry,
  projectContext,
  projectRepository,
});
