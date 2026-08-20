export const projectModuleImporters = [
  ['dashboard', () => import('./dashboard/index.js')],
  ['contracts', () => import('./contracts/index.js')],
  ['statuses', () => import('./statuses/index.js')],
  ['minutes', () => import('./minutes/index.js')],
  ['letters', () => import('./letters/index.js')],
  ['accounting', () => import('./accounting/index.js')],
  ['purchases', () => import('./purchases/index.js')],
  ['reports', () => import('./reports/index.js')],
  ['people', () => import('./people/index.js')],
  ['activities', () => import('./activities/index.js')],
];

export async function loadProjectModules({
  importers = projectModuleImporters,
  onError = (id, error) => console.warn(`project module failed to load: ${id}`, error),
} = {}){
  const settled = await Promise.allSettled(
    importers.map(async ([id, load]) => {
      const namespace = await load();
      const moduleDefinition = namespace?.default || namespace?.[id] || Object.values(namespace || {}).find(value => value && typeof value === 'object' && value.id);
      if(!moduleDefinition) throw new Error(`module definition missing: ${id}`);
      return moduleDefinition;
    })
  );

  const modules = [];
  settled.forEach((result, index) => {
    if(result.status === 'fulfilled') modules.push(result.value);
    else onError(importers[index][0], result.reason);
  });
  return modules;
}
