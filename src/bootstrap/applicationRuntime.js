/** C4 runtime orchestrator: owner implementations are imported as ES modules. */
import { canDeleteProjectRecord, data, findProject, formatCost, getActiveTab, getCurrentProjectScopeId, getProjectIdFromRoute, getViewMode, isPendingDeleted, loadData, markDirty, persist, projectCostSum, projectsVisibleForAuth, renderDrawerProjectList, setActiveTab, showRecordDeleteBlocked, showToast, svgChevron, svgPlus, toEnglishDigits, toPersianDigits, uid } from '../core/applicationFoundation.js';
import { openContractForm, openContractTemplateForm, renumberContractItems, requestCloseContractTemplateForm } from '../modules/contracts/contractCompatibility.js';
import { openNumpadGeneric, setInternalFormMode, showIncompleteFormExitChoice } from '../ui/workspaceFormPresentation.js';
import { applyRoutedSurface, goHomeProjects, handleWorkspaceContextAction, handleWorkspaceContextBack, clearMenuRoot, clearWorkspaceSubpage, menuRootMode, menuRootPage, renderAll, renderSettingsWorkspace, renderTabs, setBottomNavActive, showOnlyWorkspacePage, svgGrip, updateWorkspaceContextBar, workspaceSubpage, setWorkspaceSubpage } from '../ui/workspacePresentationRuntime.js';
import { findActivityTemplate, getActivityTemplates, getContacts, getCurrentProject, navigateFooter, openConfirm, renderProjectActivitiesPage, taskUI } from '../modules/runtime/featureComposition.js';
import { pushWorkspaceHistory } from '../core/childHistoryController.js';
import { closeSearchTemplate } from '../modules/contracts/searchTemplateModule.js';

/* migrated from /tmp/original-runtime.js */
/* ---------- init ---------- */
// Install the complete, deliberate module/legacy boundary before the first
// render. Dashboard and routed module mounts may call it during startup.
installLegacyCompatibilityBoundary();
loadData();
window.KarhaApp?.taskRuntime?.configure({
  uid,
  afterMutation(projectId){
    const project=findProject(projectId);
    const stored=window.KarhaApp?.projectRepository?.find(projectId);
    if(project && stored) project.tasks=Array.isArray(stored.tasks)?stored.tasks:[];
    if(project) markDirty(projectId);
    persist({ local:false });
  }
});
const routedProjectId = getProjectIdFromRoute();
if(routedProjectId && findProject(routedProjectId)){
  // Router.start() restores this exact project/module after Legacy loads.
}else if(getActiveTab() && getActiveTab() !== 'starred' && findProject(getActiveTab())){
  window.KarhaApp?.projectWorkspace?.selectProject?.(getActiveTab(),{moduleId:'dashboard',replace:true});
}else{
  setActiveTab(null);
}

// قراردادها: صفحه قالب‌ها و فرم مستقل قالب قرارداد
(function(){
  const add=document.getElementById('contractTemplateAddBtn'); if(add) add.onclick=()=>openContractTemplateForm(null);
  const back=document.getElementById('closeContractTemplateFormPage'); if(back) back.onclick=()=>requestCloseContractTemplateForm(false);
})();

// Modular architecture bridge: keeps the remaining legacy runtime project-scoped
// while individual modules are migrated out of this file.

function installLegacyCompatibilityBoundary(){
window.KarhaApp?.registerFormRuntimes?.({
  uid: uid,
  getCurrentProjectId: getCurrentProjectScopeId,
  showToast: showToast,
  enterActivityForm: function(){ setInternalFormMode(true); setWorkspaceSubpage('activityForm'); showOnlyWorkspacePage('activityFormPage'); setBottomNavActive('Settings'); renderTabs(); updateWorkspaceContextBar(); },
  leaveActivityForm: function(){ setInternalFormMode(false); document.getElementById('activityFormPage')?.classList.add('hidden'); setWorkspaceSubpage('activities'); showOnlyWorkspacePage('projectActivitiesPage'); renderProjectActivitiesPage(); updateWorkspaceContextBar(); },
  pushWorkspaceHistory: pushWorkspaceHistory,
  findProject: findProject,
  markDirty: markDirty,
  persist: persist,
  getCurrentProject: getCurrentProject,
  getActivityTemplates: getActivityTemplates,
  openNumpadGeneric: openNumpadGeneric,
  setInternalFormMode: setInternalFormMode,
  showIncompleteFormExitChoice: showIncompleteFormExitChoice,
  closeContactsToSettings: function(){ clearWorkspaceSubpage(); renderSettingsWorkspace(); showOnlyWorkspacePage('settingsPage'); },
}) || {};
window.KarhaInstallLegacyFacade({

  getViewMode(){ return getViewMode(); },
  renderAll,
  elFromHtml(html){
    const template=document.createElement('template');
    template.innerHTML=String(html||'').trim();
    return template.content.firstElementChild;
  },
  formatCost,
  projectCostSum,
  isPendingDeleted,
  markDirty,
  persist,
  openConfirm,
  showToast,
  svgChevron,
  renderInlineAddRow: (...args) => taskUI.renderInlineAddRow(...args),
  renderTaskBlock: (...args) => taskUI.renderTaskBlock(...args),
  applyRoutedSurface,
  getWorkspaceChromeState(){
    const project=getCurrentProject();
    return { menuRootMode, workspaceSubpage, project: project ? { id:project.id, name:project.name } : null };
  },
  navigateFooter,
  renderDrawerProjectList,
  clearWorkspaceSubpage,
  clearMenuRoot,
  handleWorkspaceContextBack,
  handleWorkspaceContextAction,
  getProjectsList(){
    return projectsVisibleForAuth(Array.isArray(data?.projects) ? data.projects : []);
  },
  getProject(projectId){
    return typeof findProject === 'function' ? findProject(projectId) : null;
  },
  openContractForm,
  closeSearchTemplate,
  escapeHtml(str){
    if(window.KarhaHtmlEscape && typeof window.KarhaHtmlEscape.escapeHtml === 'function')
      return window.KarhaHtmlEscape.escapeHtml(str);
    return String(str ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  },
  findActivityTemplate,
  formatJalaliDisplay(str){
    if(window.KarhaUI && typeof window.KarhaUI.formatJalaliDisplay === 'function')
      return window.KarhaUI.formatJalaliDisplay(str);
    if(!str) return '';
    return String(str);
  },
  getContacts,
  openNumpadGeneric,
  openJalaliPicker(currentValue, onPick, options){
    return window.KarhaUI?.openJalaliPicker?.(currentValue, onPick, options);
  },
  canDeleteProjectRecord,
  showRecordDeleteBlocked,
  showIncompleteFormExitChoice,
  pushWorkspaceHistory,
  svgGrip,
  svgPlus,
  toEnglishDigits,
  toPersianDigits,
  todayJalaliStr(){
    if(window.KarhaUI && typeof window.KarhaUI.todayJalaliStr === 'function')
      return window.KarhaUI.todayJalaliStr();
    return '';
  },
  renumberContractItems,
  goHomeProjects,
});
}
