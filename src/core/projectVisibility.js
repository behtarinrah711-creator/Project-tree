/**
 * Guest visibility: cloud-owned projects stay hidden until the owning
 * session is known. Shared-project policy is unchanged in this phase.
 */
export function isProjectVisibleForSession(project, session){
  if(!project) return false;
  if(!session || session.ready === false) return true;
  if(session.uid) return true;
  return !project.ownerUid;
}

export function projectsVisibleForSession(projects, session){
  const list = Array.isArray(projects) ? projects : [];
  return list.filter(project => isProjectVisibleForSession(project, session));
}
