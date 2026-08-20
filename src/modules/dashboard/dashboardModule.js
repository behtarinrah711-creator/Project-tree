import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { projectItemRepository } from '../../data/projectItemRepository.js';

function getProjectId(explicitProjectId=null){
  return explicitProjectId || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.() || null;
}
function getProject(projectId=null){
  const id=getProjectId(projectId);
  if(!id) return null;
  const liveProject=window?.KarhaLegacy?.getProject?.(id);
  return liveProject || projectRepository.getActiveProject(id);
}
function legacy(name,...args){
  if(typeof window?.KarhaLegacy?.[name]==='function') return window.KarhaLegacy[name](...args);
  if(typeof window?.[name]==='function') return window[name](...args);
  return undefined;
}

export const dashboardModule={
  id:'dashboard',
  title:'داشبورد پروژه',
  route:'projects',

  mount({projectId}={}){
    this.render(projectId);
    return {projectId:getProjectId(projectId),moduleId:'dashboard'};
  },

  render(projectId=null){
    const content=document.getElementById('content');
    if(!content)return;
    content.innerHTML='';
    const p=getProject(projectId);
    if(!p || p.archived || p.trashed){
      content.innerHTML='<div class="workspace-no-project">برای ورود به Workspace، از منوی سه‌خطی بالای صفحه یک پروژه را انتخاب کنید. تب «پروژه‌ها» فقط محتوای کاری پروژه فعال را نمایش می‌دهد.</div>';
      return;
    }

    // Existing task UI remains the source of truth for task interaction;
    // this module owns the project dashboard renderer and project scoping.

  if(legacy('getViewMode') === 'cost'){
    const summary = document.createElement('div');
    summary.className = 'cost-summary';
    summary.innerHTML = '<span>مجموع هزینه</span><span class="cost-sum-val"><span class="cost-unit">تومان</span> '+legacy("formatCost",legacy("projectCostSum",p))+'</span>';
    content.appendChild(summary);
  }

  // The legacy/cloud runtime owns the live project object.  Reading the
  // repository again here can return the previous localStorage snapshot while
  // a cloud hydration or debounced save is still in flight, which made an
  // otherwise healthy project appear to have no tasks.
  const projectTasks = Array.isArray(p.tasks) ? p.tasks : projectItemRepository.list(p.id);
  const visibleTasks = projectTasks.filter(t => !legacy("isPendingDeleted",'task', p.id, t.id) && !t.trashed);
  const active = visibleTasks.filter(t=>!t.done);
  const completedTasks = visibleTasks.filter(t=>t.done).sort((a,b)=> (b.completedAt||0) - (a.completedAt||0));
  // فرزندان تکمیل‌شده زیر والد باز
  const doneSubsUnderOpen = [];
  active.forEach(t=>{
    (t.subtasks||[]).forEach(s=>{
      if(!s.trashed && s.done && !legacy("isPendingDeleted",'sub', p.id, t.id, s.id))
        doneSubsUnderOpen.push({ t, s });
    });
  });
  const completedCount = completedTasks.length + doneSubsUnderOpen.length;

  if(!active.length && !completedCount){
    content.appendChild(legacy("elFromHtml",'<div class="empty-state">کاری در این پروژه نیست. با دکمهٔ + یکی اضافه کنید.</div>'));
  }

  const activeWrap = document.createElement('div');
  activeWrap.className = 'active-tasks-wrap';
  // والد + فقط فرزندان باز
  active.forEach(t => activeWrap.appendChild(legacy("renderTaskBlock",p, t, { onlyOpenSubs: true })));
  content.appendChild(activeWrap);

  content.appendChild(legacy("renderInlineAddRow",p));

  if(completedCount){
    const header = document.createElement('div');
    header.className = 'completed-header';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'completed-title';
    titleSpan.textContent = 'تکمیل‌شده ('+completedCount+')';
    header.appendChild(titleSpan);
    if(p.completedOpen){
      const clearBtn = document.createElement('button');
      clearBtn.className = 'completed-clear-btn';
      clearBtn.textContent = 'حذف همه';
      clearBtn.onclick = (e)=>{
        e.stopPropagation();
        legacy("openConfirm",'همه موارد تکمیل‌شده این پروژه حذف شوند؟', ()=>{
          completedTasks.forEach(t=>projectItemRepository.update(p.id,t.id,item=>({...item,trashed:true})));
          doneSubsUnderOpen.forEach(({t,s})=>projectItemRepository.update(p.id,t.id,item=>({
            ...item,
            subtasks:(item.subtasks||[]).map(child=>String(child.id)===String(s.id)?{...child,trashed:true}:child),
          })));
          window.KarhaLegacy?.projectItemRuntime?.persistItems(p.id);
          legacy('renderAll');
          legacy("showToast",'تکمیل‌شده‌ها حذف شدند');
        }, 'حذف همه');
      };
      header.appendChild(clearBtn);
    }
    const chev = document.createElement('span');
    chev.className = 'chev'+(p.completedOpen?'':' collapsed');
    chev.innerHTML = legacy("svgChevron",);
    header.appendChild(chev);
    header.onclick = ()=>{ p.completedOpen = !p.completedOpen; legacy("markDirty",p.id); legacy("persist",); legacy('renderAll'); };
    content.appendChild(header);

    const list = document.createElement('div');
    list.className = 'completed-list' + (p.completedOpen ? '' : ' hidden');
    completedTasks.forEach(t => list.appendChild(legacy("renderTaskBlock",p, t)));
    // هر فرزند تکمیل‌شده جداگانه با برچسب والد
    doneSubsUnderOpen.forEach(({t, s})=>{
      list.appendChild(legacy("renderTaskBlock",p, t, { hideParent: true, onlyDoneSubs: true, singleSubId: s.id }));
    });
    content.appendChild(list);
  }

  }
};

export default dashboardModule;
