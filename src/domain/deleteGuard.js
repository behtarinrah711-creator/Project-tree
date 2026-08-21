/**
 * Referential delete guard. Only ID fields that exist on the current schema
 * can block a delete. No inferred relationships.
 */

function live(items){
  return (Array.isArray(items) ? items : []).filter(item => item && !item.trashed);
}

function walkTasks(tasks, visit){
  (Array.isArray(tasks) ? tasks : []).forEach(task => {
    if(!task) return;
    visit(task);
    walkTasks(task.subtasks, visit);
  });
}

export function findActivityReferences(projects, activityId){
  const target = String(activityId ?? '');
  if(!target) return [];
  const refs = [];
  const seen = new Set();
  const add = (project, kind, recordId, label) => {
    const key = `${project?.id || ''}|${kind}|${recordId}|${label}`;
    if(seen.has(key)) return;
    seen.add(key);
    refs.push({ projectId: project?.id || '', projectName: project?.name || '', kind, recordId, label });
  };

  (Array.isArray(projects) ? projects : []).forEach(project => {
    if(!project || project.trashed) return;

    live(project.contacts).forEach(contact => {
      if(Array.isArray(contact.activities) && contact.activities.some(id => String(id) === target)){
        add(project, 'contact', contact.id, 'مخاطب');
      }
    });

    walkTasks(live(project.tasks), item => {
      if(item.trashed) return;
      if(Array.isArray(item.activities) && item.activities.some(id => String(id) === target)){
        add(project, item.subtasks ? 'task' : 'task', item.id, 'آیتم پروژه');
      }
    });

    live(project.contractTemplates).forEach(template => {
      if(String(template.activityId || '') === target){
        add(project, 'contractTemplate', template.id, 'قالب قرارداد');
      }
    });

    live(project.contracts).forEach(contract => {
      const ids = [
        contract.activityId,
        ...(Array.isArray(contract.activityIds) ? contract.activityIds : []),
      ].map(id => String(id || '')).filter(Boolean);
      if(ids.includes(target)){
        add(project, 'contract', contract.id, 'قرارداد');
      }
    });

    live(project.contractStatusReports).forEach(report => {
      if(String(report.activityId || '') === target){
        add(project, 'contractStatusReport', report.id, 'صورت وضعیت قرارداد');
      }
    });
  });

  return refs;
}

export function canDeleteActivity(projects, activityId){
  const refs = findActivityReferences(projects, activityId);
  return refs.length ? { ok:false, refs } : { ok:true, refs:[] };
}
