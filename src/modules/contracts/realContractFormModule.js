import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import * as realContractDomain from './realContractDomain.js';
import { saveRealContract } from './realContractPersistence.js';
import * as contractPickers from './contractPickers.js';
import * as paymentStages from './paymentStagesModule.js';
import * as itemInteractions from './contractItemInteractions.js';

const DRAFT_KEY='karha_real_contract_form_draft_v1';

let state=null;
let dirty=false;
let editingId=null;
let inlineAddState=null;

function activeProject(projectId=null){
  const id=projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.();
  return id ? projectRepository.getActiveProject(id) : null;
}
function shared(){ return window.KarhaSharedUI; }
function contacts(project){ return Array.isArray(project?.contacts)?project.contacts.filter(c=>!c.trashed):[]; }
function contactName(contact){ return contact?[contact.firstName,contact.lastName].filter(Boolean).join(' ')||contact.name||'مخاطب':'مخاطب'; }
function findContact(project,id){ return contacts(project).find(c=>String(c.id)===String(id))||null; }
function findActivity(project,id){ return (project?.activityTemplates||[]).find(a=>String(a.id)===String(id)&&!a.trashed)||null; }
function contractTemplates(project){ return (project?.contractTemplates||[]).filter(t=>!t.trashed); }
function markChanged(){ dirty=true; renderContractForm(); }

function formRoot(parent){const root=document.createElement('div');root.className='form-template';parent.appendChild(root);return root;}
function textRow(root,label,value,onChange,opts={}){const row=document.createElement('div');row.className='ft-row ft-stack';const lab=document.createElement('div');lab.className='ft-label';lab.textContent=label;const input=document.createElement('input');input.type='text';input.className='ft-input';input.value=String(value??'');input.placeholder=opts.placeholder||label;input.readOnly=!!opts.readonly;input.oninput=()=>{onChange?.(input.value);dirty=true;};row.append(lab,input);root.appendChild(row);return row;}
function selectRow(root,label,value,onOpen,opts={}){const row=document.createElement('div');row.className='ft-row ft-tap';const lab=document.createElement('div');lab.className='ft-label';lab.textContent=label+':';const val=document.createElement('div');val.className='ft-value'+(value?'':' ft-placeholder');val.textContent=value||(opts.placeholder||'انتخاب');row.append(lab,val);row.onclick=e=>{e.preventDefault();onOpen?.();};root.appendChild(row);return row;}
function dateRow(root,label,value,onChange,opts={}){return selectRow(root,label,value?shared().formatJalaliDisplay(value):'',()=>shared().openJalaliPicker(value||shared().todayJalali(),v=>{onChange(v);markChanged();},{maxToday:!!opts.maxToday}),{placeholder:'انتخاب تاریخ'});}
function numberRow(root,label,value,onChange,opts={}){let display='';if(value!==''&&value!=null){const raw=shared().toEnglishDigits(String(value)).replace(/[^\d]/g,'');display=(opts.prefix||'')+(opts.group===false?shared().toPersianDigits(raw):shared().formatCost(raw))+(opts.suffix?' '+opts.suffix:'');}return selectRow(root,label,display,()=>shared().openNumpad(value||'',raw=>{onChange(raw);markChanged();},{suffix:opts.suffix||'',prefix:opts.prefix||'',maxLen:opts.maxLen||16,group:opts.group!==false}),{placeholder:opts.placeholder||'وارد کنید'});}
function calcRow(root,text){const row=document.createElement('div');row.className='ft-calc';row.textContent=text;root.appendChild(row);return row;}
function pickerChanged(){ dirty=true; renderContractForm(); }
function openContractPicker(kind){
 const p=activeProject(); if(!p||!state)return false;
 const addContact=()=>{
  if(typeof window?.KarhaSearchTemplate?.close==='function') window.KarhaSearchTemplate.close(false);
  else shared().closeSearchTemplate();
  if(typeof window?.openContactForm==='function') window.openContactForm(null,kind==='contractor'?{activityId:state.activityId}:undefined);
  else shared().showToast('افزودن مخاطب در دسترس نیست');
 };
 if(kind==='contractor') return contractPickers.openContractorPicker(p.id,state,pickerChanged,addContact);
 if(kind==='employer') return contractPickers.openEmployerPicker(p.id,state,pickerChanged,addContact);
 return contractPickers.openProjectItemPicker(p.id,state,pickerChanged);
}
function renderContractForm(){
 const body=document.getElementById('contractFormBody');if(!body||!state)return;
 const scrollHost=body.closest('.page-body')||body;
 const savedScroll=scrollHost.scrollTop||0;
 body.innerHTML='';const p=activeProject();if(!p)return;const s=state;
 const activity=findActivity(p,s.activityId);
 const actName=activity?.name||activity?.title||'';
 // تمپلیت فرم — همه فیلدها زیر هم، یک ردیف در هر سطر
 const ft=formRoot(body);
 // شماره قرارداد
 textRow(ft,'شماره قرارداد',s.contractNo||'',v=>s.contractNo=v,{readonly:!s.contractNo,placeholder:s.contractNo?'':'توسط سیستم تولید می‌شود'});
 // تاریخ تنظیم
 dateRow(ft,'تاریخ تنظیم قرارداد',s.contractDate||shared().todayJalali(),v=>s.contractDate=v,{maxToday:true});
 // محل انعقاد
 const projectPlaceEarly=p.location||p.address||p.projectLocation||p.siteLocation||'';
 if(!s.contractPlace) s.contractPlace=projectPlaceEarly;
 textRow(ft,'محل انعقاد قرارداد',s.contractPlace||'',v=>s.contractPlace=v,{placeholder:'پیش‌فرض: محل پروژه'});
 // آیتم پروژه — تمپلیت جستجو
 selectRow(ft,'آیتم پروژه',s.projectItemPath||'',()=>openContractPicker('projectItem'),{placeholder:'انتخاب'});
 // کارفرما — تمپلیت جستجو
 selectRow(ft,'کارفرما',s.employerId?contactName(findContact(p,s.employerId)):'',()=>openContractPicker('employer'),{placeholder:'انتخاب'});
 // پیمانکار — تمپلیت جستجو
 selectRow(ft,'پیمانکار',s.contractorId?contactName(findContact(p,s.contractorId)):'',()=>openContractPicker('contractor'),{placeholder:'انتخاب'});
 // فعالیت از Project Item تعیین می‌شود؛ انتخاب مستقل Activity در فرم قرارداد وجود ندارد.
 // قالب قرارداد (بر اساس Activity انتخاب‌شده)

 const templates=contractTemplates(p);
 const filteredTemplates=templates.filter(t=>String(t.activityId)===String(s.activityId));
 if(s.activityId&&filteredTemplates.length>1){
   const tLabel=(filteredTemplates.find(t=>t.id===s.templateId)||{}).title||'';
   selectRow(ft,'قالب قرارداد',tLabel,()=>{
     contractPickers.openStaticChoicePicker('انتخاب قالب قرارداد','قالب‌ها',
       filteredTemplates.map(t=>({value:t.id,label:t.title||'قالب قرارداد'})),
       s.templateId,
       (id)=>{
         s.templateId=id;
         const t=filteredTemplates.find(x=>x.id===id);
         if(t){ s.items=realContractDomain.cloneTemplateIntoContract(t); s.paymentItems=JSON.parse(JSON.stringify(t.paymentItems||[])); }
         dirty=true; renderContractForm();
       });
   },{placeholder:'انتخاب'});
 }else if(s.activityId&&filteredTemplates.length===1&&!s.templateId){
   s.templateId=filteredTemplates[0].id;
   s.items=realContractDomain.cloneTemplateIntoContract(filteredTemplates[0]);
   s.paymentItems=JSON.parse(JSON.stringify(filteredTemplates[0].paymentItems||[]));
 }
 // تاریخ شروع / پایان — هر کدام یک ردیف
 dateRow(ft,'تاریخ شروع قرارداد',s.startDate||'',v=>s.startDate=v,{});
 dateRow(ft,'تاریخ پایان قرارداد',s.endDate||'',v=>s.endDate=v,{});
 // مبلغ و درصد — هر کدام یک ردیف + نامبرپد
 numberRow(ft,'مبلغ کل قرارداد',s.amount,v=>{s.amount=shared().toEnglishDigits(String(v)).replace(/[^\d]/g,'');},{suffix:'تومان',maxLen:16,group:true,placeholder:'وارد کنید'});
 numberRow(ft,'درصد حسن انجام کار',s.retentionPercent,v=>{s.retentionPercent=shared().toEnglishDigits(String(v)).replace(/[^\d]/g,'');},{prefix:'٪',maxLen:3,group:false,placeholder:'وارد کنید'});
 const ra=(Number(s.amount)||0)*(Number(s.retentionPercent)||0)/100;
 const netAmount=Math.max(0,(Number(s.amount)||0)-ra);
 s.retentionAmount=String(Math.round(ra||0));
 s.amountAfterRetention=String(Math.round(netAmount||0));
 calcRow(ft,'مبلغ حسن انجام کار: '+(ra?shared().formatCost(ra):'۰')+' تومان');
 calcRow(ft,'مبلغ قرارداد پس از کسر حسن انجام کار: '+(netAmount?shared().formatCost(netAmount):'۰')+' تومان');
 // مبنای شروع و مدت نگهداری — تمپلیت جستجو
 const basisOpts=[{value:'پایان قرارداد',label:'تاریخ پایان قرارداد'},{value:'تحویل موقت',label:'تحویل موقت'},{value:'تحویل قطعی',label:'تحویل قطعی'},{value:'تسویه نهایی',label:'تسویه نهایی'}];
 selectRow(ft,'مبنای شروع مدت نگهداری حسن انجام کار',s.retentionBasis||'',()=>{
   contractPickers.openStaticChoicePicker('مبنای شروع نگهداری','گزینه‌ها',basisOpts,s.retentionBasis,(v)=>{
     s.retentionBasis=v; dirty=true; renderContractForm();
   });
 },{placeholder:'انتخاب'});
 const durOpts=['یک هفته','دو هفته','سه هفته','چهار هفته','یک ماه','یک ماه و نیم','دو ماه','دو ماه و نیم','سه ماه','چهار ماه','پنج ماه','شش ماه'].map(x=>({value:x,label:x}));
 selectRow(ft,'مدت نگهداری حسن انجام کار',s.retentionDuration||'',()=>{
   contractPickers.openStaticChoicePicker('مدت نگهداری','مدت‌ها',durOpts,s.retentionDuration,(v)=>{
     s.retentionDuration=v; dirty=true; renderContractForm();
   });
 },{placeholder:'انتخاب'});

 paymentStages.renderPaymentStages(body,s,{onDirty:()=>{dirty=true;},onNumpad:(value,onCommit,opts)=>shared().openNumpad(value,onCommit,opts),onRender:renderContractForm});
 const sec3=document.createElement('div');sec3.className='real-contract-section contract-clause-heading';const sec3Title=document.createElement('span');sec3Title.textContent='مواد قرارداد';sec3.append(sec3Title);body.appendChild(sec3);
 if(!s.items.length){const n=document.createElement('div');n.className='contract-form-note';n.textContent=s.activityId?'برای این فعالیت هنوز قالب قراردادی ثبت نشده است.':'پس از انتخاب فعالیت، مواد قرارداد از قالب آن خوانده می‌شوند.';body.appendChild(n);}else{realContractDomain.renumberRealContractItems(s.items);const items=document.createElement('div');items.className='real-contract-items';(s.items||[]).forEach((it,i)=>items.appendChild(renderRealContractItem(it,s.items,i,false)));items.appendChild(renderContractRootInlineAddRow(items));body.appendChild(items);}
 const previewSec=document.createElement('div');previewSec.className='real-contract-section';previewSec.textContent='پیش‌نمایش متن قرارداد';body.appendChild(previewSec);
 const preview=document.createElement('div');preview.className='contract-doc-preview';const esc=v=>shared().escapeHtml(String(v||''));const partyBlank=v=>esc(v).trim()||'................................................';
 let clauseHtml='';(s.items||[]).forEach((it,i)=>{clauseHtml+='<div class="doc-clause"><b>'+shared().toPersianDigits(String(i+1))+'.</b> '+esc(it.text||'........................................................');(it.children||[]).forEach((ch,j)=>{clauseHtml+='<div class="doc-child"><b>'+shared().toPersianDigits(String(i+1)+'-'+String(j+1))+'.</b> '+esc(ch.text||'........................................................')+'</div>';});clauseHtml+='</div>';});
 let payHtml='';(s.paymentStages||[]).forEach((x,i)=>{payHtml+='<div><b>'+shared().toPersianDigits(String(i+1))+'.</b> پس از '+shared().toPersianDigits(String(x.progress||'۰'))+'٪ پیشرفت، '+shared().toPersianDigits(String(x.paymentPercent||'۰'))+'٪ از مبلغ قرارداد پرداخت می‌شود'+(x.description?' — '+esc(x.description):'')+'</div>';});
 const itemPath=s.projectItemPath||'';
 preview.innerHTML='<div class="doc-title">'+esc('قرارداد '+actName)+'</div><div class="doc-meta"><div>شماره قرارداد: <span class="doc-line">'+partyBlank(s.contractNo)+'</span></div><div>تاریخ تنظیم: <span class="doc-line">'+partyBlank(shared().formatJalaliDisplay(s.contractDate))+'</span></div><div>تاریخ شروع: <span class="doc-line">'+partyBlank(shared().formatJalaliDisplay(s.startDate))+'</span></div><div>تاریخ پایان: <span class="doc-line">'+partyBlank(shared().formatJalaliDisplay(s.endDate))+'</span></div><div>محل انعقاد: <span class="doc-line">'+partyBlank(s.contractPlace)+'</span></div></div><div class="doc-parties"><div class="party"><span class="doc-party-label">این قرارداد فی‌مابین کارفرما:</span> '+partyBlank(s.employerName)+'</div><div class="party"><span class="doc-party-label">و پیمانکار:</span> '+partyBlank(s.contractorName)+'</div><div class="party">موضوع فعالیت: '+partyBlank(actName)+'</div><div class="party">آیتم پروژه: '+partyBlank(itemPath)+'</div><div class="party">مبلغ کل قرارداد: '+(s.amount?shared().formatCost(s.amount):'................................')+' تومان</div><div class="party">حسن انجام کار: ٪'+shared().toPersianDigits(String(s.retentionPercent||'۰'))+'، معادل '+shared().formatCost(ra)+' تومان</div><div class="party">مبنای شروع نگهداری حسن انجام کار: '+partyBlank(s.retentionBasis)+'</div><div class="party">مدت نگهداری: '+partyBlank(s.retentionDuration)+'</div></div><div class="doc-clauses">'+(clauseHtml||'<div class="doc-clause">........................................................</div>')+'</div><div class="doc-payment"><b>شرایط پرداخت</b>'+(payHtml||'<div>........................................................</div>')+'</div><div class="doc-signatures"><div class="signature-box">امضا و اثر انگشت کارفرما<br>................................</div><div class="signature-box">امضا و اثر انگشت پیمانکار<br>................................</div></div>';body.appendChild(preview);
 const actions=document.getElementById('contractFormActions');actions.innerHTML='';const bar=document.createElement('div');bar.className='real-contract-savebar';
 const save=document.createElement('button');save.className='if-save';save.textContent='ذخیره';save.onclick=()=>realContractFormModule.save();
 const draft=document.createElement('button');draft.className='if-draft';draft.textContent='پیش‌نویس';draft.onclick=()=>{
   try{
     localStorage.setItem(DRAFT_KEY,JSON.stringify(state));
     dirty=false;
     shared().showToast('پیش‌نویس ذخیره شد');
     realContractFormModule.close();
   }catch(e){shared().showToast('ذخیره پیش‌نویس انجام نشد');}
 };
 const cancel=document.createElement('button');cancel.className='if-cancel';cancel.textContent='انصراف';cancel.onclick=()=>realContractFormModule.close();
 bar.append(save,draft,cancel);actions.appendChild(bar);
 // جلوگیری از پرش به ابتدای فرم بعد از انتخاب گزینه
 requestAnimationFrame(()=>{ try{ scrollHost.scrollTop=savedScroll; }catch(e){} });
 setTimeout(()=>{ try{ scrollHost.scrollTop=savedScroll; }catch(e){} },0);
}

function renderRealContractItem(item,arr,index,isChild=false){
 const card=document.createElement('div');
 card.className='real-contract-item contract-work-item'+(isChild?' contract-item-card-child':'') + (!isChild ? (' contract-group-' + (index%2===0?'even':'odd')) : '');
 card.dataset.realContractDragId=item.id;
 const row=document.createElement('div');row.className='real-contract-item-row contract-work-row';
 const grip=document.createElement('span');grip.className='real-contract-grip contract-work-grip';grip.innerHTML=shared().svgGrip();grip.title='جابه‌جایی';
 grip.onpointerdown=e=>itemInteractions.attachPointerDrag({handle:e.currentTarget,list:arr,id:item.id,kind:'real',state:{items:state.items},onRender:markChanged});
 row.appendChild(grip);
 const num=document.createElement('div');num.className='real-contract-num contract-work-number';num.textContent=shared().toPersianDigits(item.number||'');row.appendChild(num);
 const inp=document.createElement('textarea');inp.className='real-contract-text contract-work-input';inp.value=item.text||'';inp.placeholder=isChild?'متن بند را وارد کنید…':'متن ماده را وارد کنید…';inp.oninput=()=>{
  itemInteractions.updateItemText(item,inp.value,{dirty});
  dirty=true;
};row.appendChild(inp);
 const del=document.createElement('button');del.className='real-contract-btn danger contract-inline-delete';del.textContent='حذف';del.title='حذف ماده یا بند';
 del.onclick=e=>{
  e.preventDefault();e.stopPropagation();
  itemInteractions.removeItem(arr,index,{items:state.items,dirty});
  dirty=true;renderContractForm();
};
 row.appendChild(del);card.appendChild(row);
 if(!isChild){
   if(inlineAddState?.parentId===item.id) card.appendChild(renderContractInlineAddRow(item.id));
   else{
     const addRow=document.createElement('button');addRow.type='button';addRow.className='contract-add-child-row';addRow.title='افزودن بند';addRow.innerHTML=shared().svgPlus();
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
function commitContractInlineAdd(parentId,input,keepFocus){
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

function renderContractInlineAddRow(parentId=null){
  const row=document.createElement('div');
  row.className='inline-add-row active contract-inline-add-row';
  const input=document.createElement('input');
  input.className='real-contract-inline-add-input';
  input.placeholder=parentId?'بند جدید…':'ماده جدید…';
  let ignoreBlur=false;
  const commit=(keepFocus)=>{
    const ok=commitContractInlineAdd(parentId,input,keepFocus);
    if(ok) ignoreBlur=true;
    setTimeout(()=>{ignoreBlur=false;},100);
  };
  input.onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit(true);}
    if(e.key==='Escape'){
      inlineAddState=null;
      renderContractForm();
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
    inlineAddState=null;
    renderContractForm();
  };
  row.appendChild(x);
  return row;
}

function renderContractRootInlineAddRow(wrap){
  const activeState=inlineAddState;
  const row=document.createElement('div');
  if(!(activeState && activeState.parentId===null)){
    row.className='inline-add-row';
    row.innerHTML='<span class="plus-circle">'+shared().svgPlus()+'</span><span>افزودن ماده</span>';
    row.onclick=()=>{
      inlineAddState={parentId:null};
      renderContractForm();
      focusInlineAdd();
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
  const input=document.createElement('input'); input.id='realContractRootInlineAddInput'; input.placeholder='ماده جدید…';
  let ignoreBlur=false;
  const commit=(keepFocus)=>{
    if(!input.value.trim()) return;
    if(!state)return;
    const text=input.value.trim(); input.value=''; const item=makeInlineContractItem(text); state.items.push(item);
    realContractDomain.renumberRealContractItems(state.items);
    dirty=true;
    const card=renderRealContractItem(item,state.items,state.items.length-1,false);
    wrap.insertBefore(card,row);
    if(keepFocus){ignoreBlur=true;setTimeout(()=>{ignoreBlur=false;input.focus();},0);}
  };
  input.onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit(true);}
    if(e.key==='Escape'){inlineAddState=null;renderContractForm();}
  };
  if(confBtn) confBtn.onclick=e=>{e.preventDefault();e.stopPropagation();commit(true);};
  input.onblur=()=>{if(ignoreBlur)return;setTimeout(()=>{if(ignoreBlur||document.activeElement===input)return;if(input.value.trim())commit(false);},120);};
  row.appendChild(input);
  const x=document.createElement('button'); x.className='x-btn'; x.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  x.onclick=()=>{inlineAddState=null;renderContractForm();}; row.appendChild(x);
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
      shared().todayJalali()
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
      showToast:shared().showToast,
      todayJalaliStr:shared().todayJalali,
      findActivityTemplate:(id,project)=>findActivity(project,id),
      syncContractPartyData:realContractDomain.syncContractPartyData,
      toEnglishDigits:shared().toEnglishDigits
    });
    if(!result.ok) return false;
    state=result.contract;
    dirty=false;
    realContractFormModule.close();
    if(!silent) shared().showToast('قرارداد ذخیره شد');
    return true;
  },

  getState(){ return state; },
  isDirty(){ return dirty; },
  setDirty(v=true){ dirty=!!v; },
  setState(v){ state=v; },
  reset(){ state=null;dirty=false;editingId=null;inlineAddState=null; },
  close(){ window.KarhaLegacy?.closeContractForm?.(); }
};
export default realContractFormModule;

if(typeof window!=='undefined') window.KarhaRealContractForm=realContractFormModule;
