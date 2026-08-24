const WORKSPACE_PAGE_IDS = [
  'projectsPage','profilePage','calendarPage','createPage','reportsPage','accountingPage','settingsPage',
  'projectActivitiesPage','contactsPage','projectTrashPage','contractsPage','contractFormPage',
  'contractTemplateFormPage','contractTemplatesPage','activityFormPage',
];

export const PROJECT_ROUTE_SURFACES = Object.freeze({
  dashboard: Object.freeze({ pageId:null, footer:'Projects', subpage:null }),
  tasks: Object.freeze({ pageId:null, footer:'Projects', subpage:null }),
  reports: Object.freeze({ pageId:'reportsPage', footer:'Reports', subpage:null }),
  contracts: Object.freeze({ pageId:'contractsPage', footer:'Reports', subpage:'contracts' }),
  accounting: Object.freeze({ pageId:'accountingPage', footer:'Accounting', subpage:null }),
  people: Object.freeze({ pageId:'settingsPage', footer:'Settings', subpage:null }),
  activities: Object.freeze({ pageId:'projectActivitiesPage', footer:'Settings', subpage:'activities' }),
});

export function getProjectRouteSurface(moduleId){
  return PROJECT_ROUTE_SURFACES[moduleId] || PROJECT_ROUTE_SURFACES.dashboard;
}

export function applyProjectRouteSurface(moduleId, { documentRef = globalThis.document } = {}){
  if(!documentRef) return false;
  const surface = getProjectRouteSurface(moduleId);
  WORKSPACE_PAGE_IDS.forEach(id => documentRef.getElementById?.(id)?.classList?.add?.('hidden'));
  documentRef.querySelectorAll?.('.bottom-nav-item')?.forEach?.(item => item.classList?.remove?.('active'));
  documentRef.getElementById?.(`bottom${surface.footer}Btn`)?.classList?.add?.('active');
  if(surface.pageId) documentRef.getElementById?.(surface.pageId)?.classList?.remove?.('hidden');
  const isWorkspace = surface.footer !== 'Projects';
  const topbar = documentRef.getElementById?.('topbar');
  if(isWorkspace) topbar?.classList?.add?.('workspace-context');
  else topbar?.classList?.remove?.('workspace-context');
  topbar?.classList?.remove?.('root-workspace-context');
  documentRef.getElementById?.('tabbar')?.setAttribute?.('aria-hidden', isWorkspace ? 'true' : 'false');
  return surface;
}

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
    const surface = applyProjectRouteSurface(moduleId, { documentRef });
    windowRef.KarhaLegacy?.applyRoutedSurface?.({ ...event?.detail, surface });
  });
  return true;
}
