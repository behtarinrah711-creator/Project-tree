import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';

function getProjectId(explicit = null){
  return explicit
    || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.()
    || null;
}

function getProject(projectId){
  return projectId ? projectRepository.getActiveProject(projectId) : null;
}

function getActivities(project){
  return Array.isArray(project?.activityTemplates)
    ? project.activityTemplates.filter(a => !a.trashed)
    : [];
}

function getContractTemplates(project){
  return Array.isArray(project?.contractTemplates)
    ? project.contractTemplates.filter(t => !t.trashed)
    : [];
}

function getContracts(project){
  return Array.isArray(project?.contracts)
    ? project.contracts.filter(c => !c.trashed)
    : [];
}

function openLegacyActivityForm(activity){
  if(typeof window.openActivityEditForm === 'function'){
    window.openActivityEditForm(activity);
    return true;
  }
  if(typeof window.KarhaLegacy?.openActivityEditForm === 'function'){
    window.KarhaLegacy.openActivityEditForm(activity);
    return true;
  }
  return false;
}

function deleteActivity(projectId, activityId){
  const projects=projectRepository.getProjectsList();
  const project=projects.find(p => String(p.id ?? p.projectId) === String(projectId));
  if(!project) return false;

  const activity=(project.activityTemplates || [])
    .find(a => String(a.id) === String(activityId));
  if(!activity) return false;

  activity.trashed=true;
  projectRepository.saveProjectsList(projects);
  return true;
}

export const activitiesModule = {
  id:'activities',
  title:'فعالیت‌ها',
  route:'activities',

  mount({projectId} = {}){
    this.render(projectId);
    return { projectId:getProjectId(projectId), moduleId:'activities' };
  },

  render(projectId = null){
    const body=document.getElementById('projectActivitiesPageBody');
    if(!body) return;

    const activeId=getProjectId(projectId);
    const project=getProject(activeId);
    body.innerHTML='';

    if(!project){
      body.innerHTML='<div class="mgmt-empty">برای نمایش فعالیت‌ها، یک پروژه را انتخاب کنید.</div>';
      return;
    }

    const activities=getActivities(project);

    if(!activities.length){
      const empty=document.createElement('div');
      empty.className='mgmt-empty';
      empty.textContent='هنوز فعالیتی ثبت نشده است.';
      body.appendChild(empty);
      return;
    }

    const searchWrap=document.createElement('div');
    searchWrap.className='workspace-search';

    const search=document.createElement('input');
    search.type='search';
    search.className='workspace-search-input';
    search.placeholder='جستجوی فعالیت…';
    search.autocomplete='off';
    searchWrap.appendChild(search);

    const list=document.createElement('div');
    list.className='activity-list';

    const rows=[];

    activities.forEach(activity=>{
      const row=document.createElement('div');
      row.className='activity-row';

      const main=document.createElement('div');
      main.className='activity-main';

      const name=document.createElement('div');
      name.className='activity-name';
      name.textContent=activity.name || 'فعالیت بدون نام';

      const templateCount=getContractTemplates(project)
        .filter(t=>String(t.activityId)===String(activity.id)).length;

      const contractCount=getContracts(project)
        .filter(c=>String(c.activityId)===String(activity.id)).length;

      const meta=document.createElement('div');
      meta.className='activity-contract-meta';
      meta.textContent=templateCount
        ? `قالب قرارداد: ${templateCount} · قرارداد واقعی: ${contractCount}`
        : 'بدون قالب قرارداد';

      main.append(name,meta);

      const actions=document.createElement('div');
      actions.className='activity-actions';

      const edit=document.createElement('button');
      edit.type='button';
      edit.className='activity-action';
      edit.title='ویرایش';
      edit.textContent='ویرایش';
      edit.addEventListener('click',e=>{
        e.stopPropagation();
        openLegacyActivityForm(activity);
      });

      const del=document.createElement('button');
      del.type='button';
      del.className='activity-action danger';
      del.title='حذف';
      del.textContent='حذف';
      del.addEventListener('click',e=>{
        e.stopPropagation();
        if(!confirm('آیا از حذف این فعالیت اطمینان دارید؟')) return;
        if(deleteActivity(activeId,activity.id)) this.render(activeId);
      });

      actions.append(edit,del);
      row.append(main,actions);

      row.dataset.searchText=
        `${activity.name || ''} ${meta.textContent}`.toLocaleLowerCase('fa');

      row.addEventListener('click',()=>openLegacyActivityForm(activity));

      rows.push(row);
      list.appendChild(row);
    });

    search.addEventListener('input',()=>{
      const q=String(search.value || '').trim().toLocaleLowerCase('fa');
      rows.forEach(row=>{
        row.hidden=!!q && !row.dataset.searchText.includes(q);
      });
    });

    body.append(searchWrap,list);
  }
};

export default activitiesModule;
