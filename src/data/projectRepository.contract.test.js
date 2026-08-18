// Static contract test for the project repository API.
// This file intentionally contains no browser-only execution.
const requiredMethods = [
  'getProjectsList',
  'getActiveProject',
  'scoped',
  'saveProjectsList',
  'updateProject',
];

export function assertProjectRepositoryContract(repository){
  for(const method of requiredMethods){
    if(typeof repository?.[method] !== 'function'){
      throw new Error(`ProjectRepository contract missing: ${method}`);
    }
  }
  return true;
}
