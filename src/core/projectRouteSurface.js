const WORKSPACE_PAGE_IDS = [
  'projectsPage','profilePage','collabPage','calendarPage','statusListPage','statusFormPage',
  'statusExportPage','createPage','reportsPage','accountingPage','settingsPage','projectActivitiesPage',
  'contactsPage','projectTrashPage','contractsPage','contractFormPage','contractTemplateFormPage',
  'contractTemplatesPage','statusTestPage','contractStatusPage','contractApprovalPage','activityFormPage',
  'shareFormPage',
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

/**
 * Router owns project/module navigation after the migrations, while the legacy
 * shell still owns visibility of Reports/Accounting/Settings page shells.
 * When navigation lands on Dashboard, make that shell handoff explicit so a
 * previously visible internal page cannot keep covering the freshly mounted
 * project/task content.
 */
export function installProjectRouteSurfaceSync({
  windowRef = globalThis.window,
  documentRef = windowRef?.document || globalThis.document,
} = {}){
  if(!windowRef?.addEventListener || !documentRef) return false;
  if(windowRef.__karhaProjectRouteSurfaceSyncInstalled) return false;
  windowRef.__karhaProjectRouteSurfaceSyncInstalled = true;

  windowRef.addEventListener('karha:workspace-route-synced', event => {
    const projectId = event?.detail?.projectId;
    const moduleId = event?.detail?.moduleId || 'dashboard';
    if(!projectId || moduleId !== 'dashboard') return;
    showProjectsDashboardSurface({ documentRef });
  });
  return true;
}
