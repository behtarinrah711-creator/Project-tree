const LEGACY_KEYS = ['gtasks-clone-v2', 'projects', 'karha_projects', 'karha.projects'];

function safeJsonParse(raw, fallback){
  if(!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function normalizeProjects(value){
  if(Array.isArray(value)) return value;
  if(value && Array.isArray(value.projects)) return value.projects;
  return [];
}

export class ProjectRepository{
  constructor(storage = window.localStorage){ this.storage = storage; }
  all(){
    for(const key of LEGACY_KEYS){
      const projects = normalizeProjects(safeJsonParse(this.storage.getItem(key), null));
      if(projects.length) return projects;
    }
    return [];
  }
  find(projectId){
    if(!projectId) return null;
    return this.all().find(project => String(project.id) === String(projectId) || String(project.projectId) === String(projectId)) || null;
  }
  scoped(projectId, collection){
    const project = this.find(projectId);
    if(!project) return [];
    return Array.isArray(project[collection]) ? project[collection] : [];
  }
}

export const projectRepository = new ProjectRepository();
