const WORKSPACE_PAGE_IDS = [
  'projectsPage','profilePage','calendarPage','createPage','reportsPage','accountingPage','settingsPage',
  'projectActivitiesPage','contactsPage','projectTrashPage','contractsPage','contractFormPage',
  'contractTemplateFormPage','contractTemplatesPage','activityFormPage',
];

export function showProjectsDashboardSurface({ documentRef = globalThis.document } = {}){
  if(!documentRef) return false;
  WORKSPACE_PAGE_IDS.forEach(id => documentRef.getElementById?.(id)?.classList?.add?.('hidden'));
  documentRef.querySelectorAll?.('.bottom-nav-item')?.forEach?.(item => item.classList?.remove?.('active'));
  documentRef.getElementById?.('bottomProjectsBtn')?.classList?.add?.('active');
  const topbar = documentRef.getElementById?.('topbar');
  topbar?.classList?.remove?.('workspace-context');
  topbar?.classList?.remove?.('root-workspace-context');
  const tabbar = documentRef.getElementById?.('tabbar');
  tabbar?.setAttribute?.('aria-hidden', 'false');
  return true;
}

export function installProjectRouteSurfaceSync({
  windowRef = globalThis.window,
  documentRef = windowRef?.document || globalThis.document,
} = {}){
  if(!windowRef?.addEventListener || !documentRef) return false;
  if(windowRef.__karhaProjectRouteSurfaceSyncInstalled) return false;
  windowRef.__karhaProjectRouteSurfaceSyncInstalled = true;
  windowRef.addEventListener('karha:workspace-route-synced', event => {
    const moduleId = event?.detail?.moduleId;
    if(moduleId === 'dashboard' || moduleId === 'tasks' || !moduleId){
      showProjectsDashboardSurface({ documentRef });
    }
  });
  return true;
}
