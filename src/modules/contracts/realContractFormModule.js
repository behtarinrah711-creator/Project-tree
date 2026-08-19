import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import * as realContractDomain from './realContractDomain.js';
import { saveRealContract } from './realContractPersistence.js';

let state=null;
let dirty=false;
let editingId=null;
let inlineAddState=null;

function activeProject(projectId=null){
  const id=projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.();
  return id ? projectRepository.getActiveProject(id) : null;
}
function legacy(name,...args){
  if(typeof window?.[name]==='function') return window[name](...args);
  if(typeof window?.KarhaLegacy?.[name]==='function') return window.KarhaLegacy[name](...args);
  return undefined;
}
function helper(name,...args){ return legacy(name,...args); }
function renderContractForm(){
 const body=document.getElementById('contractFormBody');if(!body||!state)return;
 const scrollHost=body.closest('.page-body')||body;
 const savedScroll=scrollHost.scrollTop||0;
 body.innerHTML='';const p=getCurrentProject();if(!p)return;const contacts=helper("getContacts",p).filter(c=>!c.trashed);const s=state;
 const activity=helper("findActivityTemplate",s.activityId,p);
 const actName=activity?.name||activity?.title||'';
 // تمپلیت فرم — همه فیلدها زیر هم، یک ردیف در هر سطر
 const ft=ftCreateRoot(body);
 // شماره قرارداد
 ftTextRow(ft,'شماره قرارداد',s.contractNo||'',v=>s.contractNo=v,{readonly:!s.contractNo,placeholder:s.contractNo?'':'توسط سیستم تولید می‌شود'});
 // تاریخ تنظیم
 ftDateRow(ft,'تاریخ تنظیم قرارداد',s.contractDate||helper("todayJalaliStr",),v=>s.contractDate=v,{maxToday:true});
 // محل انعقاد
 const projectPlaceEarly=p.location||p.address||p.projectLocation||p.siteLocation||'';
 if(!s.contractPlace) s.contractPlace=projectPlaceEarly;
 ftTextRow(ft,'محل انعقاد قرارداد',s.contractPlace||'',v=>s.contractPlace=v,{placeholder:'پیش‌فرض: محل پروژه'});
 // آیتم پروژه — تمپلیت جستجو
 ftSelectRow(ft,'آیتم پروژه',s.projectItemPath||'',()=>helper("openProjectItemSearchTemplate",),{placeholder:'انتخاب'});
 // کارفرما — تمپلیت جستجو
 ftSelectRow(ft,'کارفرما',s.employerId?helper("getContactDisplayName",helper("findContact",s.employerId,p)):'',()=>helper("openEmployerSearchTemplate",),{placeholder:'انتخاب'});
 // پیمانکار — تمپلیت جستجو
 ftSelectRow(ft,'پیمانکار',s.contractorId?helper("getContactDisplayName",helper("findContact",s.contractorId,p)):'',()=>helper("openContractorSearchTemplate",),{placeholder:'انتخاب'});
 // فعالیت از Project Item تعیین می‌شود؛ انتخاب مستقل Activity در فرم قرارداد وجود ندارد.
 // قالب قرارداد (بر اساس Activity انتخاب‌شده)

 const templates=helper("getContractTemplates",p).filter(t=>!t.trashed);
 const filteredTemplates=templates.filter(t=>String(t.activityId)===String(s.activityId));
 if(s.activityId&&filteredTemplates.length>1){
   const tLabel=(filteredTemplates.find(t=>t.id===s.templateId)||{}).title||'';
   ftSelectRow(ft,'قالب قرارداد',tLabel,()=>{
     helper("openStaticChoiceSearchTemplate",'انتخاب قالب قرارداد','قالب‌ها',
       filteredTemplates.map(t=>({value:t.id,label:t.title||'قالب قرارداد'})),
       s.templateId,
       (id)=>{
         s.templateId=id;
         const t=filteredTemplates.find(x=>x.id===id);
         if(t){ s.items=cloneTemplateIntoContract(t); s.paymentItems=JSON.parse(JSON.stringify(t.paymentItems||[])); }
         dirty=true; renderContractForm();
       });
   },{placeholder:'انتخاب'});
 }else if(s.activityId&&filteredTemplates.length===1&&!s.templateId){
   s.templateId=filteredTemplates[0].id;
   s.items=cloneTemplateIntoContract(filteredTemplates[0]);
   s.paymentItems=JSON.parse(JSON.stringify(filteredTemplates[0].paymentItems||[]));
 }
 // تاریخ شروع / پایان — هر کدام یک ردیف
 ftDateRow(ft,'تاریخ شروع قرارداد',s.startDate||'',v=>s.startDate=v,{});
 ftDateRow(ft,'تاریخ پایان قرارداد',s.endDate||'',v=>s.endDate=v,{});
 // مبلغ و درصد — هر کدام یک ردیف + نامبرپد
 ftNumberRow(ft,'مبلغ کل قرارداد',s.amount,v=>{s.amount=helper("toEnglishDigits",String(v)).replace(/[^\d]/g,'');},{suffix:'تومان',maxLen:16,group:true,placeholder:'وارد کنید'});
 ftNumberRow(ft,'درصد حسن انجام کار',s.retentionPercent,v=>{s.retentionPercent=helper("toEnglishDigits",String(v)).replace(/[^\d]/g,'');},{prefix:'٪',maxLen:3,group:false,placeholder:'وارد کنید'});
 const ra=(Number(s.amount)||0)*(Number(s.retentionPercent)||0)/100;
 const netAmount=Math.max(0,(Number(s.amount)||0)-ra);
 s.retentionAmount=String(Math.round(ra||0));
 s.amountAfterRetention=String(Math.round(netAmount||0));
 ftCalcRow(ft,'مبلغ حسن انجام کار: '+(ra?helper("formatCost",ra):'۰')+' تومان');
 ftCalcRow(ft,'مبلغ قرارداد پس از کسر حسن انجام کار: '+(netAmount?helper("formatCost",netAmount):'۰')+' تومان');
 // مبنای شروع و مدت نگهداری — تمپلیت جستجو
 const basisOpts=[{value:'پایان قرارداد',label:'تاریخ پایان قرارداد'},{value:'تحویل موقت',label:'تحویل موقت'},{value:'تحویل قطعی',label:'تحویل قطعی'},{value:'تسویه نهایی',label:'تسویه نهایی'}];
 ftSelectRow(ft,'مبنای شروع مدت نگهداری حسن انجام کار',s.retentionBasis||'',()=>{
   helper("openStaticChoiceSearchTemplate",'مبنای شروع نگهداری','گزینه‌ها',basisOpts,s.retentionBasis,(v)=>{
     s.retentionBasis=v; dirty=true; renderContractForm();
   });
 },{placeholder:'انتخاب'});
 const durOpts=['یک هفته','دو هفته','سه هفته','چهار هفته','یک ماه','یک ماه و نیم','دو ماه','دو ماه و نیم','سه ماه','چهار ماه','پنج ماه','شش ماه'].map(x=>({value:x,label:x}));
 ftSelectRow(ft,'مدت نگهداری حسن انجام کار',s.retentionDuration||'',()=>{
   helper("openStaticChoiceSearchTemplate",'مدت نگهداری','مدت‌ها',durOpts,s.retentionDuration,(v)=>{
     s.retentionDuration=v; dirty=true; renderContractForm();
   });
 },{placeholder:'انتخاب'});

 helper("renderPaymentStages",body,s);
 const sec3=document.createElement('div');sec3.className='real-contract-section contract-clause-heading';const sec3Title=document.createElement('span');sec3Title.textContent='مواد قرارداد';sec3.append(sec3Title);body.appendChild(sec3);
 if(!s.items.length){const n=document.createElement('div');n.className='contract-form-note';n.textContent=s.activityId?'برای این فعالیت هنوز قالب قراردادی ثبت نشده است.':'پس از انتخاب فعالیت، مواد قرارداد از قالب آن خوانده می‌شوند.';body.appendChild(n);}else{renumberRealContractItems(s.items);const items=document.createElement('div');items.className='real-contract-items';(s.items||[]).forEach((it,i)=>items.appendChild(renderRealContractItem(it,s.items,i,false)));items.appendChild(renderContractRootInlineAddRow('real',items));body.appendChild(items);}
 const previewSec=document.createElement('div');previewSec.className='real-contract-section';previewSec.textContent='پیش‌نمایش متن قرارداد';body.appendChild(previewSec);
 const preview=document.createElement('div');preview.className='contract-doc-preview';const esc=v=>helper("escapeHtml",String(v||''));const partyBlank=v=>esc(v).trim()||'................................................';
 let clauseHtml='';(s.items||[]).forEach((it,i)=>{clauseHtml+='<div class="doc-clause"><b>'+helper("toPersianDigits",String(i+1))+'.</b> '+esc(it.text||'........................................................');(it.children||[]).forEach((ch,j)=>{clauseHtml+='<div class="doc-child"><b>'+helper("toPersianDigits",String(i+1)+'-'+String(j+1))+'.</b> '+esc(ch.text||'........................................................')+'</div>';});clauseHtml+='</div>';});
 let payHtml='';(s.paymentStages||[]).forEach((x,i)=>{payHtml+='<div><b>'+helper("toPersianDigits",String(i+1))+'.</b> پس از '+helper("toPersianDigits",String(x.progress||'۰'))+'٪ پیشرفت، '+helper("toPersianDigits",String(x.paymentPercent||'۰'))+'٪ از مبلغ قرارداد پرداخت می‌شود'+(x.description?' — '+esc(x.description):'')+'</div>';});
 const itemPath=s.projectItemPath||'';
 preview.innerHTML='<div class="doc-title">'+esc('قرارداد '+actName)+'</div><div class="doc-meta"><div>شماره قرارداد: <span class="doc-line">'+partyBlank(s.contractNo)+'</span></div><div>تاریخ تنظیم: <span class="doc-line">'+partyBlank(helper("formatJalaliDisplay",s.contractDate))+'</span></div><div>تاریخ شروع: <span class="doc-line">'+partyBlank(helper("formatJalaliDisplay",s.startDate))+'</span></div><div>تاریخ پایان: <span class="doc-line">'+partyBlank(helper("formatJalaliDisplay",s.endDate))+'</span></div><div>محل انعقاد: <span class="doc-line">'+partyBlank(s.contractPlace)+'</span></div></div><div class="doc-parties"><div class="party"><span class="doc-party-label">این قرارداد فی‌مابین کارفرما:</span> '+partyBlank(s.employerName)+'</div><div class="party"><span class="doc-party-label">و پیمانکار:</span> '+partyBlank(s.contractorName)+'</div><div class="party">موضوع فعالیت: '+partyBlank(actName)+'</div><div class="party">آیتم پروژه: '+partyBlank(itemPath)+'</div><div class="party">مبلغ کل قرارداد: '+(s.amount?helper("formatCost",s.amount):'................................')+' تومان</div><div class="party">حسن انجام کار: ٪'+helper("toPersianDigits",String(s.retentionPercent||'۰'))+'، معادل '+helper("formatCost",ra)+' تومان</div><div class="party">مبنای شروع نگهداری حسن انجام کار: '+partyBlank(s.retentionBasis)+'</div><div class="party">مدت نگهداری: '+partyBlank(s.retentionDuration)+'</div></div><div class="doc-clauses">'+(clauseHtml||'<div class="doc-clause">........................................................</div>')+'</div><div class="doc-payment"><b>شرایط پرداخت</b>'+(payHtml||'<div>........................................................</div>')+'</div><div class="doc-signatures"><div class="signature-box">امضا و اثر انگشت کارفرما<br>................................</div><div class="signature-box">امضا و اثر انگشت پیمانکار<br>................................</div></div>';body.appendChild(preview);
 const actions=document.getElementById('contractFormActions');actions.innerHTML='';const bar=document.createElement('div');bar.className='real-contract-savebar';
 const save=document.createElement('button');save.className='if-save';save.textContent='ذخیره';save.onclick=()=>helper("saveRealContract",false);
 const draft=document.createElement('button');draft.className='if-draft';draft.textContent='پیش‌نویس';draft.onclick=()=>{
   try{
     localStorage.setItem(REAL_CONTRACT_DRAFT_KEY,JSON.stringify(state));
     dirty=false;
     helper("showToast",'پیش‌نویس ذخیره شد');
     helper("closeContractForm",);
   }catch(e){helper("showToast",'ذخیره پیش‌نویس انجام نشد');}
 };
 const cancel=document.createElement('button');cancel.className='if-cancel';cancel.textContent='انصراف';cancel.onclick=()=>helper("closeContractForm",);
 bar.append(save,draft,cancel);actions.appendChild(bar);
 // جلوگیری از پرش به ابتدای فرم بعد از انتخاب گزینه
 helper("requestAnimationFrame",()=>{ try{ scrollHost.scrollTop=savedScroll; }catch(e){} });
 setTimeout(()=>{ try{ scrollHost.scrollTop=savedScroll; }catch(e){} },0);
}

function renderContractItem(item,arr,index,isChild=false){
  const card=document.createElement('div');
  card.className='contract-item-card contract-work-item'+(isChild?' contract-item-card-child':'') + (!isChild ? (' contract-group-' + (index%2===0?'even':'odd')) : '');
  card.dataset.contractDragId=item.id;
  const row=document.createElement('div');
  row.className='contract-item-row contract-work-row';
  const grip=document.createElement('span');
  grip.className='contract-item-grip drag-grip contract-work-grip';
  grip.title='جابه‌جایی';
  grip.innerHTML=helper("svgGrip",);
  grip.onpointerdown=e=>startContractItemDrag(e,item.id,arr,card.parentElement,card,'template');
  row.appendChild(grip);

  const num=document.createElement('div');
  num.className='contract-item-number contract-work-number';
  num.textContent=helper("toPersianDigits",item.number||'');
  row.appendChild(num);

  const input=document.createElement('textarea');
  input.className='contract-item-input contract-work-input';
  input.value=item.text||'';
  input.placeholder=isChild?'متن بند را وارد کنید…':'متن ماده را وارد کنید…';
  input.rows=1;
  input.oninput=()=>{
    item.text=input.value;
    contractTemplateFormDirty=true;
    input.style.height='auto';
    input.style.height=Math.max(38,input.scrollHeight)+'px';
  };
  helper("requestAnimationFrame",()=>{input.style.height='auto';input.style.height=Math.max(38,input.scrollHeight)+'px';});
  row.appendChild(input);

  const del=document.createElement('button');
  del.type='button';del.className='contract-item-btn danger contract-inline-delete';del.title='حذف ماده یا بند';del.textContent='حذف';
  del.onclick=e=>{
    e.preventDefault();e.stopPropagation();
    arr.splice(index,1);
    contractTemplateFormDirty=true;
    renumberContractItems(contractTemplateFormState.items);
    renderContractTemplateForm();
  };
  row.appendChild(del);
  card.appendChild(row);

  if(!isChild){
    const children=Array.isArray(item.children)?item.children:[];
    if(contractTemplateInlineAddState?.parentId===item.id){
      card.appendChild(renderContractInlineAddRow('template',item.id));
    }else{
      const addRow=document.createElement('button');
      addRow.type='button'; addRow.className='contract-add-child-row'; addRow.title='افزودن بند';
      addRow.innerHTML=helper("svgPlus",);
      addRow.onclick=e=>{
        e.preventDefault();e.stopPropagation();
        contractTemplateInlineAddState={parentId:item.id};
        renderContractTemplateForm();
        setTimeout(()=>document.querySelector('.contract-inline-add-input')?.focus(),0);
      };
      card.appendChild(addRow);
    }
    const childWrap=document.createElement('div');
    childWrap.className='contract-child-list contract-work-child-list';
    children.forEach((child,j)=>childWrap.appendChild(renderContractItem(child,children,j,true)));
    card.appendChild(childWrap);
  }
  return card;
}

function renderRealContractItem(item,arr,index,isChild=false){
 const card=document.createElement('div');
 card.className='real-contract-item contract-work-item'+(isChild?' contract-item-card-child':'') + (!isChild ? (' contract-group-' + (index%2===0?'even':'odd')) : '');
 card.dataset.realContractDragId=item.id;
 const row=document.createElement('div');row.className='real-contract-item-row contract-work-row';
 const grip=document.createElement('span');grip.className='real-contract-grip contract-work-grip';grip.innerHTML=helper("svgGrip",);grip.title='جابه‌جایی';
 grip.onpointerdown=e=>startContractItemDrag(e,item.id,arr,card.parentElement,card,'real');
 row.appendChild(grip);
 const num=document.createElement('div');num.className='real-contract-num contract-work-number';num.textContent=helper("toPersianDigits",item.number||'');row.appendChild(num);
 const inp=document.createElement('textarea');inp.className='real-contract-text contract-work-input';inp.value=item.text||'';inp.placeholder=isChild?'متن بند را وارد کنید…':'متن ماده را وارد کنید…';inp.oninput=()=>{
  window.KarhaContractItemInteractions?.updateItemText?.(item,inp.value,{dirty});
  dirty=true;
};row.appendChild(inp);
 const del=document.createElement('button');del.className='real-contract-btn danger contract-inline-delete';del.textContent='حذف';del.title='حذف ماده یا بند';
 del.onclick=e=>{
  e.preventDefault();e.stopPropagation();
  window.KarhaContractItemInteractions?.removeItem?.(arr,index,{items:state.items,dirty});
  dirty=true;renderContractForm();
};
 row.appendChild(del);card.appendChild(row);
 if(!isChild){
   if(inlineAddState?.parentId===item.id) card.appendChild(renderContractInlineAddRow('real',item.id));
   else{
     const addRow=document.createElement('button');addRow.type='button';addRow.className='contract-add-child-row';addRow.title='افزودن بند';addRow.innerHTML=helper("svgPlus",);
     addRow.onclick=e=>{e.preventDefault();e.stopPropagation();inlineAddState={parentId:item.id};renderContractForm();setTimeout(()=>document.querySelector('.real-contract-inline-add-input')?.focus(),0);};
     card.appendChild(addRow);
   }
   const childWrap=document.createElement('div');childWrap.className='real-contract-child contract-work-child-list';
   (item.children||[]).forEach((c,j)=>childWrap.appendChild(renderRealContractItem(c,item.children,j,true)));
   card.appendChild(childWrap);
 }
 return card;
}


function makeInlineContractItem(text){
  return {
    id:'rc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
    text:String(text||'').trim(), number:'',
    children:[]
  };
}
function focusInlineAdd(){
  setTimeout(()=>{
    const el=document.querySelector('#realContractRootInlineAddInput, .real-contract-inline-add-input');
    if(el)el.focus();
  },0);
}
function commitContractInlineAdd(kind,parentId,input,keepFocus){
  if(kind!=='real') return helper("commitContractInlineAdd",kind,parentId,input,keepFocus);
  const value=String(input?.value||'').trim();
  if(!value||!state)return false;
  if(parentId){
    const parent=realContractDomain.findProjectContractItem
      ? realContractDomain.findProjectContractItem(state.items,parentId)
      : (function find(items,id){for(const x of items||[]){if(String(x.id)===String(id))return x;const y=find(x.children,id);if(y)return y;}return null;})(state.items,parentId);
    if(parent){
      if(!Array.isArray(parent.children))parent.children=[];
      parent.children.push(makeInlineContractItem(value));
    }else return false;
  }else state.items.push(makeInlineContractItem(value));
  realContractDomain.renumberRealContractItems(state.items);
  dirty=true;
  input.value='';
  if(keepFocus){
    inlineAddState={parentId:parentId??null};
    renderContractForm();
    focusInlineAdd();
  }else{
    inlineAddState=null;
    renderContractForm();
  }
  return true;
}

function renderContractInlineAddRow(kind,parentId=null){
  const row=document.createElement('div');
  row.className='inline-add-row active contract-inline-add-row';
  const input=document.createElement('input');
  input.className=kind==='template'?'contract-inline-add-input':'real-contract-inline-add-input';
  input.placeholder=parentId?'بند جدید…':'ماده جدید…';
  let ignoreBlur=false;
  const commit=(keepFocus)=>{
    const ok=commitContractInlineAdd(kind,parentId,input,keepFocus);
    if(ok) ignoreBlur=true;
    setTimeout(()=>{ignoreBlur=false;},100);
  };
  input.onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit(true);}
    if(e.key==='Escape'){
      if(kind==='template') contractTemplateInlineAddState=null;
      else inlineAddState=null;
      kind==='template'?renderContractTemplateForm():renderContractForm();
    }
  };
  input.onblur=()=>{
    if(ignoreBlur) return;
    setTimeout(()=>{
      if(ignoreBlur) return;
      if(document.activeElement===input) return;
      if(input.value.trim()) commit(false);
    },120);
  };
  row.appendChild(input);
  const x=document.createElement('button');
  x.type='button'; x.className='x-btn';
  x.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  x.onclick=()=>{
    if(kind==='template') contractTemplateInlineAddState=null;
    else inlineAddState=null;
    kind==='template'?renderContractTemplateForm():renderContractForm();
  };
  row.appendChild(x);
  return row;
}

function renderContractRootInlineAddRow(kind, wrap){
  const activeState=kind==='template'?contractTemplateInlineAddState:inlineAddState;
  const row=document.createElement('div');
  if(!(activeState && activeState.parentId===null)){
    row.className='inline-add-row';
    row.innerHTML='<span class="plus-circle">'+helper("svgPlus",)+'</span><span>افزودن ماده</span>';
    row.onclick=()=>{
      if(kind==='template') contractTemplateInlineAddState={parentId:null};
      else inlineAddState={parentId:null};
      kind==='template'?renderContractTemplateForm():renderContractForm();
      focusContractInlineAdd();
    };
    return row;
  }
  row.className='inline-add-row active contract-inline-add-row contract-root-inline-add-row-active';
  let confBtn=null;
  if(typeof isFloatingConfirmUser==='function' && isFloatingConfirmUser()){
    confBtn=document.createElement('button'); confBtn.type='button'; confBtn.className='inline-confirm-btn'; confBtn.title='تایید';
    confBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l3.5 3.5L16 6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    confBtn.onmousedown=e=>e.preventDefault(); row.appendChild(confBtn);
  }
  const check=document.createElement('span'); check.className='empty-check'; row.appendChild(check);
  const input=document.createElement('input'); input.id=kind==='template'?'contractRootInlineAddInput':'realContractRootInlineAddInput'; input.placeholder='ماده جدید…';
  let ignoreBlur=false;
  const commit=(keepFocus)=>{
    if(!input.value.trim()) return;
    const st=kind==='template'?contractTemplateFormState:state; if(!st)return;
    const text=input.value.trim(); input.value=''; const item=makeContractItem(text); st.items.push(item);
    if(kind==='template') renumberContractItems(st.items); else renumberRealContractItems(st.items);
    if(kind==='template') contractTemplateFormDirty=true; else dirty=true;
    const card=kind==='template'?renderContractItem(item,st.items,st.items.length-1,false):renderRealContractItem(item,st.items,st.items.length-1,false);
    wrap.insertBefore(card,row); persist();
    if(keepFocus){ignoreBlur=true;setTimeout(()=>{ignoreBlur=false;input.focus();},0);}
  };
  input.onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit(true);}
    if(e.key==='Escape'){if(kind==='template')contractTemplateInlineAddState=null;else inlineAddState=null;kind==='template'?renderContractTemplateForm():renderContractForm();}
  };
  if(confBtn) confBtn.onclick=e=>{e.preventDefault();e.stopPropagation();commit(true);};
  input.onblur=()=>{if(ignoreBlur)return;setTimeout(()=>{if(ignoreBlur||document.activeElement===input)return;if(input.value.trim())commit(false);},120);};
  row.appendChild(input);
  const x=document.createElement('button'); x.className='x-btn'; x.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  x.onclick=()=>{if(kind==='template')contractTemplateInlineAddState=null;else inlineAddState=null;kind==='template'?renderContractTemplateForm():renderContractForm();}; row.appendChild(x);
  setTimeout(()=>input.focus(),0); return row;
}

export const realContractFormModule={
  commitContractInlineAdd,
  focusInlineAdd,
  open(id=null,projectId=null){
    const p=activeProject(projectId);
    if(!p)return false;
    editingId=id||null;
    state=realContractDomain.makeRealContractDraft(
      id ? realContractDomain.findProjectContract(id,p) : null,
      helper("todayJalaliStr")
    );
    dirty=false; inlineAddState=null;
    const title=document.getElementById('contractFormTitle');
    if(title) title.textContent=id?'ویرایش قرارداد':'قرارداد جدید';
    renderContractForm();
    return true;
  },
  render(){ return !!state && renderContractForm(); },
  save(projectId=null,silent=false){
    const p=activeProject(projectId);
    if(!p || !state) return false;
    const result=saveRealContract(p.id,state,{
      showToast:(m)=>helper("showToast",m),
      todayJalaliStr:()=>helper("todayJalaliStr"),
      findActivityTemplate:(id,project)=>helper("findActivityTemplate",id,project),
      syncContractPartyData:(draft,project)=>helper("syncContractPartyData",draft,project),
      toEnglishDigits:(v)=>helper("toEnglishDigits",v)
    });
    if(!result.ok) return false;
    state=result.contract;
    dirty=false;
    helper("closeContractForm");
    if(!silent) helper("showToast",'قرارداد ذخیره شد');
    return true;
  },

  getState(){ return state; },
  isDirty(){ return dirty; },
  setDirty(v=true){ dirty=!!v; },
  setState(v){ state=v; },
  close(){ helper("closeContractForm"); }
};
export default realContractFormModule;

if(typeof window!=='undefined') window.KarhaRealContractForm=realContractFormModule;
