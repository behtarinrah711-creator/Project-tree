/**
 * Phase 4.2 — Domain entry for markDirty / persist.
 * After legacy boots, applicationStartup registers the real implementations
 * so dirty flags and cloud flush stay single-sourced in legacy until full extract.
 * Auth is not handled here.
 */

let impl = {
  markDirty(_projectId){},
  persist(_options){},
};

export function registerPersistImpl(next = {}){
  if(typeof next.markDirty === 'function') impl.markDirty = next.markDirty;
  if(typeof next.persist === 'function') impl.persist = next.persist;
}

export function markDirty(projectId){
  return impl.markDirty(projectId);
}

export function persist(options){
  return impl.persist(options);
}
