/**
 * Phase 7.2 — merge owned cloud docs into local project list.
 * Sharing/collaborator fork removed (product Phase 5/6). Behavior for owner + guest preserved.
 */

export function mergeOwnedCloudSnapshots({
  ownedDocs = [],
  localProjects = [],
  dirtyProjectIds = new Set(),
  pendingCloudWrites = new Set(),
  currentUser = null,
  docToProject,
  preservedActive = null,
  preservedMode = 'simple',
  preservedStarredOrder = [],
} = {}){
  const map = {};
  const localById = {};
  (localProjects || []).forEach(lp => { localById[lp.id] = lp; });

  ownedDocs.forEach(doc => {
    map[doc.id] = docToProject(doc, localById[doc.id]);
  });

  if(localProjects){
    localProjects.forEach(localP => {
      if((dirtyProjectIds.has(localP.id) || pendingCloudWrites.has(localP.id)) && map[localP.id]){
        map[localP.id] = localP;
      }
    });
  }

  const prevOrder = (localProjects || []).map(p => p.id);

  // Keep guest/local-only and dirty owned missing briefly from snapshot
  if(localProjects){
    localProjects.forEach(localP => {
      if(map[localP.id]) return;
      if(localP.ownerUid && currentUser && localP.ownerUid !== currentUser.uid) return;
      if(localP.ownerUid && currentUser && localP.ownerUid === currentUser.uid){
        if(dirtyProjectIds.has(localP.id) || pendingCloudWrites.has(localP.id)){
          map[localP.id] = localP;
        }
        return;
      }
      map[localP.id] = localP;
    });
  }

  let projects = Object.values(map);
  if(prevOrder.length){
    const byId = {};
    projects.forEach(p => { byId[p.id] = p; });
    const ordered = [];
    prevOrder.forEach(id => {
      if(byId[id]){ ordered.push(byId[id]); delete byId[id]; }
    });
    Object.keys(byId).forEach(id => ordered.push(byId[id]));
    projects = ordered;
  }

  return {
    projects,
    activeTab: preservedActive,
    viewMode: preservedMode,
    starredOrder: Array.isArray(preservedStarredOrder) ? preservedStarredOrder.slice() : [],
  };
}
