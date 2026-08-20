function projectKey(project){
  return String(project?.id ?? project?.projectId ?? '');
}

const SELECT_HANDLER = Symbol('drawerProjectSelectHandler');

/**
 * Reconcile drawer rows by project id so an in-flight pointer interaction is
 * not detached merely because a cloud snapshot refreshed the project list.
 */
export function reconcileDrawerProjectList(list, projects, {
  activeProjectId = null,
  createRow,
  updateRow,
  onSelect,
} = {}){
  if(!list || typeof createRow !== 'function' || typeof updateRow !== 'function') return [];

  const existing = new Map();
  Array.from(list.children || []).forEach(row => {
    const id = row?.dataset?.projectId;
    if(id) existing.set(String(id), row);
  });

  const rows = (projects || []).map(project => {
    const id = projectKey(project);
    let row = existing.get(id);
    if(!row){
      row = createRow();
      row.addEventListener('click', event => {
        const clickedId = event.currentTarget?.dataset?.projectId;
        if(clickedId) event.currentTarget[SELECT_HANDLER]?.(clickedId);
      });
    }
    row.dataset.projectId = id;
    row[SELECT_HANDLER] = onSelect;
    updateRow(row, project, String(activeProjectId ?? '') === id);
    return row;
  });

  list.replaceChildren(...rows);
  return rows;
}
