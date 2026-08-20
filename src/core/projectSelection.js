function sameId(left, right){
  return String(left ?? '') === String(right ?? '');
}

/** One ordered transaction for every project-selection entry point. */
export class ProjectSelectionLifecycle{
  constructor(){ this.adapter=null; }

  configure(adapter){
    this.adapter=adapter;
    return this;
  }

  select(requestedProjectId, {moduleId='dashboard'}={}){
    const adapter=this.adapter;
    if(!adapter || requestedProjectId===null || requestedProjectId===undefined) return false;
    const project=(adapter.getProjects?.() || []).find(candidate =>
      candidate && sameId(candidate.id ?? candidate.projectId, requestedProjectId)
    );
    if(!project || project.trashed || project.archived) return false;

    const projectId=project.id ?? project.projectId;
    adapter.setActiveProjectId(projectId);
    adapter.setProjectContext(projectId);
    adapter.setRoute(projectId,moduleId);
    adapter.persist(projectId);
    adapter.closeDrawer();
    adapter.renderWorkspace(projectId);
    adapter.renderDrawer(projectId);
    return true;
  }
}

export const projectSelection = new ProjectSelectionLifecycle();

export function bindProjectSelectionRow(row, lifecycle=projectSelection){
  row.onclick=event=>{
    event.preventDefault();
    event.stopPropagation();
    return lifecycle.select(event.currentTarget.dataset.projectId,{moduleId:'dashboard'});
  };
  return row;
}
