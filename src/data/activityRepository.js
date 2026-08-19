import { projectRepository } from './projectRepository.js';

/**
 * Project-scoped persistence boundary for activity templates.
 *
 * Activity templates intentionally remain in Project.activityTemplates. This
 * repository centralizes access to that existing collection and delegates all
 * persistence and storage-key handling to ProjectRepository.
 */
export class ActivityRepository{
  constructor(projectRepo = projectRepository){
    this.projectRepository = projectRepo;
  }

  list(projectId){
    return this.projectRepository.scoped(projectId, 'activityTemplates');
  }

  get(projectId, activityId){
    if(!activityId) return null;
    return this.list(projectId).find(activity =>
      String(activity.id) === String(activityId)
    ) || null;
  }

  save(projectId, activity){
    if(!projectId || !activity) return null;

    const saved=this.projectRepository.updateProject(projectId, project => {
      const activities=Array.isArray(project.activityTemplates)
        ? [...project.activityTemplates]
        : [];
      const index=activities.findIndex(item => String(item.id) === String(activity.id));
      if(index >= 0) activities[index]=activity;
      else activities.push(activity);
      return {...project, activityTemplates:activities};
    });

    return saved ? activity : null;
  }

  update(projectId, activityId, updater){
    if(!projectId || !activityId) return null;
    const current=this.get(projectId, activityId);
    if(!current) return null;

    const updated=typeof updater === 'function' ? updater(current) : updater;
    if(!updated) return null;

    const saved=this.projectRepository.updateProject(projectId, project => {
      if(!Array.isArray(project.activityTemplates)) return project;
      const index=project.activityTemplates.findIndex(activity =>
        String(activity.id) === String(activityId)
      );
      if(index < 0) return project;

      const activities=[...project.activityTemplates];
      activities[index]=updated;
      return {...project, activityTemplates:activities};
    });

    return saved ? updated : null;
  }

  softDelete(projectId, activityId){
    return this.update(projectId, activityId, activity => ({
      ...activity,
      trashed:true,
    }));
  }
}

export const activityRepository = new ActivityRepository();
