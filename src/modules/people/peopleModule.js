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

function findActivity(project, id){
  const list = Array.isArray(project?.activityTemplates) ? project.activityTemplates : [];
  return list.find(a => String(a.id) === String(id)) || null;
}

function textMatch(text,q){
  return !q || String(text || '').toLocaleLowerCase('fa').includes(q);
}

function openLegacyContactForm(contact){
  if(typeof window.openContactForm === 'function'){
    window.openContactForm(contact);
    return true;
  }
  const legacy=window.KarhaLegacy;
  if(typeof legacy?.openContactForm === 'function'){
    legacy.openContactForm(contact);
    return true;
  }
  return false;
}

function softDeleteContact(projectId, contactId){
  const projects=projectRepository.getProjectsList();
  const project=projects.find(p => String(p.id ?? p.projectId) === String(projectId));
  if(!project) return false;
  const contact=(project.contacts || []).find(c => String(c.id) === String(contactId));
  if(!contact) return false;
  contact.trashed=true;
  projectRepository.saveProjectsList(projects);
  return true;
}

export const peopleModule = {
  id:'people',
  title:'کارکنان و پیمانکاران',
  route:'people',

  mount({projectId} = {}){
    this.render(projectId);
    return { projectId:getProjectId(projectId), moduleId:'people' };
  },

  render(projectId = null){
    const body=document.getElementById('contactsPageBody');
    if(!body) return;

    const activeId=getProjectId(projectId);
    const project=getProject(activeId);
    body.innerHTML='';

    if(!project){
      body.innerHTML='<div class="mgmt-empty">برای نمایش مخاطبین، یک پروژه را انتخاب کنید.</div>';
      return;
    }

    const contacts=Array.isArray(project.contacts)
      ? project.contacts.filter(c => !c.trashed)
      : [];

    if(!contacts.length){
      const empty=document.createElement('div');
      empty.className='mgmt-empty';
      empty.textContent='هنوز مخاطبی ثبت نشده است.';
      body.appendChild(empty);
      return;
    }

    const search=document.createElement('input');
    search.type='search';
    search.className='workspace-search-input';
    search.placeholder='جستجوی مخاطب، فعالیت یا نوع مخاطب…';
    search.autocomplete='off';

    const searchWrap=document.createElement('div');
    searchWrap.className='workspace-search';
    searchWrap.appendChild(search);

    const list=document.createElement('div');
    list.className='contacts-list';

    const rows=[];
    contacts.forEach(contact=>{
      const row=document.createElement('div');
      row.className='contact-row';

      const main=document.createElement('div');
      main.className='contact-main';

      const displayName=[contact.type,contact.firstName,contact.lastName]
        .filter(Boolean).join(' ').trim() || contact.name || 'مخاطب جدید';

      const name=document.createElement('div');
      name.className='contact-name';
      name.textContent=displayName;

      const activities=Array.isArray(contact.activities) ? contact.activities.filter(Boolean) : [];
      const activityText=activities
        .map(id=>findActivity(project,id))
        .filter(Boolean)
        .map(a=>a.name || '')
        .filter(Boolean)
        .join('، ');

      const activityLine=document.createElement('div');
      activityLine.className='contact-activities';
      activityLine.textContent=activityText || 'بدون فعالیت';

      main.append(name,activityLine);

      if(contact.pending){
        const status=document.createElement('div');
        status.className='contact-status';
        status.textContent='در انتظار تکمیل';
        main.appendChild(status);
      }

      const actions=document.createElement('div');
      actions.className='contact-actions';

      const edit=document.createElement('button');
      edit.type='button';
      edit.className='contact-action-btn';
      edit.textContent='ویرایش';
      edit.addEventListener('click',event=>{
        event.stopPropagation();
        openLegacyContactForm(contact);
      });

      const del=document.createElement('button');
      del.type='button';
      del.className='contact-action-btn danger';
      del.textContent='حذف';
      del.addEventListener('click',event=>{
        event.stopPropagation();
        if(!confirm('آیا از حذف این مخاطب اطمینان دارید؟')) return;
        if(softDeleteContact(activeId,contact.id)) this.render(activeId);
      });

      actions.append(del,edit);
      row.append(main,actions);
      row.dataset.searchText=(displayName+' '+activityText+' '+(contact.type||'')).toLocaleLowerCase('fa');
      row.addEventListener('click',()=>openLegacyContactForm(contact));
      rows.push(row);
      list.appendChild(row);
    });

    search.addEventListener('input',()=>{
      const q=String(search.value||'').trim().toLocaleLowerCase('fa');
      rows.forEach(row=>{ row.hidden=!textMatch(row.dataset.searchText,q); });
    });

    body.append(searchWrap,list);
  }
};

export default peopleModule;
