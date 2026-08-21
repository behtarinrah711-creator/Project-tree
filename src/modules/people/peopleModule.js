import { projectContext } from '../../core/projectContext.js';
import { contactRepository } from '../../data/contactRepository.js';
import { projectRepository } from '../../data/projectRepository.js';
import { openContactForm } from './contactFormModule.js';

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

function openPeopleContactForm(contact){
  return openContactForm(contact);
}

function softDeleteContact(projectId, contactId){
  const check = window.KarhaLegacy?.canDeleteProjectRecord?.('contact', contactId);
  if(check && check.ok === false){
    window.KarhaLegacy?.showRecordDeleteBlocked?.('contact', check.refs);
    return false;
  }
  const deleted=Boolean(contactRepository.softDelete(projectId, contactId));
  if(deleted) window.KarhaLegacy?.contactFormRuntime?.persistContacts?.(projectId);
  return deleted;
}


export const peopleModule = {
  id:'people',
  title:'کارکنان و پیمانکاران',
  route:'people',
  openContactForm,

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

    const contacts=contactRepository.list(activeId).filter(c => !c.trashed);

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
        openPeopleContactForm(contact);
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
      row.addEventListener('click',()=>openPeopleContactForm(contact));
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
