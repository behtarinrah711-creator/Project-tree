import { projectRepository } from './projectRepository.js';

/**
 * Project-scoped persistence boundary for project items.
 *
 * Project items intentionally remain in Project.tasks. This repository keeps
 * the existing data shape and delegates storage-key handling to
 * ProjectRepository.
 */
export class ProjectItemRepository{
  constructor(projectRepo = projectRepository){
    this.projectRepository = projectRepo;
  }

  list(projectId){
    return this.projectRepository.scoped(projectId, 'tasks');
  }

  get(projectId, itemId){
    if(!itemId) return null;
    return this.list(projectId).find(item =>
      String(item.id) === String(itemId)
    ) || null;
  }

  save(projectId, item){
    if(!projectId || !item) return null;

    const saved=this.projectRepository.updateProject(projectId, project => {
      const tasks=Array.isArray(project.tasks) ? [...project.tasks] : [];
      const index=tasks.findIndex(current => String(current.id) === String(item.id));
      if(index >= 0) tasks[index]=item;
      else tasks.push(item);
      return {...project,tasks};
    });

    return saved ? item : null;
  }

  update(projectId, itemId, updater){
    if(!projectId || !itemId) return null;
    const current=this.get(projectId,itemId);
    if(!current) return null;

    const updated=typeof updater === 'function' ? updater(current) : updater;
    if(!updated) return null;
    return this.save(projectId,updated);
  }

  softDelete(projectId, itemId){
    return this.update(projectId,itemId,item => ({
      ...item,
      trashed:true,
      deletedAt:Date.now(),
      deletedType:'task',
    }));
  }
}

export const projectItemRepository = new ProjectItemRepository();
