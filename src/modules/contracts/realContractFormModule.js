import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { localStorageAdapter } from '../../data/storageAdapter.js';
import * as realContractDomain from './realContractDomain.js';
import { saveRealContract } from './realContractPersistence.js';
import * as contractPickers from './contractPickers.js';
import * as contractTemplatesDomain from './contractTemplatesDomain.js';
import * as paymentStagesModule from './paymentStagesModule.js';
import * as contractItemInteractions from './contractItemInteractions.js';

let state = null;
let dirty = false;
let editingId = null;
let inlineAddState = null;
let activeProjectId = null;
// True only while the current browser entry is owned by this mounted form.
// A popstate consumes that entry before requestClose runs, so this is ownership
// of the real stack entry rather than merely a record that open once pushed.
let formHistoryOwned = false;
const REAL_CONTRACT_DRAFT_KEY = 'karha_real_contract_form_draft_v1';

function activeProject(projectId = null) {
  const id =
    projectId ||
    projectContext.getProjectId?.() ||
    projectContext.getActiveProjectId?.();

  if (!id) return null;

  return projectRepository.getActiveProject(id)
    || legacy('findProject', id)
    || null;
}

function legacy(name, ...args) {
  if (typeof window !== 'undefined' && typeof window[name] === 'function') return window[name](...args);
  if (typeof window !== 'undefined' && typeof window.KarhaLegacy?.[name] === 'function') return window.KarhaLegacy[name](...args);
  return undefined;
}

function helper(name, ...args) {
  return legacy(name, ...args);
}

function currentProject() {
  return activeProject(activeProjectId);
}

function openFormShell(projectId) {
  const opened = helper('openRealContractFormShell', projectId);
  if (opened === false) return false;
  if (!formHistoryOwned) {
    helper('pushWorkspaceHistory', 'contractForm');
    formHistoryOwned = true;
  }
  return true;
}

function closeFormShell(fromPopState = false) {
  helper('closeRealContractFormShell', fromPopState);
  if (formHistoryOwned) {
    helper('suppressWorkspaceBack');
    try { history.back(); } catch {}
  }
  formHistoryOwned = false;
}

function ftCreateRoot(parent) {
  const root = document.createElement('div');
  root.className = 'form-template';
  parent.appendChild(root);
  return root;
}

function ftTextRow(root, label, value, onChange, opts = {}) {
  const row = document.createElement('div');
  row.className = 'ft-row ft-stack';

  const lab = document.createElement('div');
  lab.className = 'ft-label';
  lab.textContent = label;

  const input = document.createElement('input');
  input.type = opts.inputType || 'text';
  input.className = 'ft-input';
  input.value = String(value ?? '');
  input.placeholder = opts.placeholder || label;
  if (opts.readonly) input.readOnly = true;
  input.oninput = () => {
    onChange?.(input.value);
    if (opts.dirty !== false) dirty = true;
  };

  row.append(lab, input);
  root.appendChild(row);
  return row;
}

function ftSelectRow(root, label, displayValue, onOpen, opts = {}) {
  const row = document.createElement('div');
  row.className = 'ft-row ft-tap';

  const lab = document.createElement('div');
  lab.className = 'ft-label';
  lab.textContent = label + (opts.hideColon ? '' : ':');

  const val = document.createElement('div');
  val.className = 'ft-value' + (displayValue ? '' : ' ft-placeholder');
  val.textContent = displayValue || opts.placeholder || 'انتخاب';

  row.append(lab, val);
  row.onclick = event => {
    event.preventDefault();
    onOpen?.();
  };
  root.appendChild(row);
  return row;
}

function ftDateRow(root, label, value, onChange, opts = {}) {
  const display = value ? (helper('formatJalaliDisplay', value) ?? String(value)) : '';
  return ftSelectRow(root, label, display, () => {
    helper('openJalaliPicker', value || helper('todayJalaliStr'), next => {
      onChange?.(next);
      if (opts.dirty !== false) dirty = true;
      renderContractForm();
    }, { maxToday: !!opts.maxToday });
  }, { placeholder: opts.placeholder || 'انتخاب تاریخ' });
}

function ftNumberRow(root, label, value, onChange, opts = {}) {
  let display = '';
  if (value !== '' && value != null && String(value).length) {
    const normalized = helper('toEnglishDigits', String(value)) ?? value;
    const raw = String(normalized).replace(/[^\d.]/g, '');
    const shown = opts.group === false
      ? (helper('toPersianDigits', raw) ?? raw)
      : (helper('formatCost', raw) ?? raw);
    display = (opts.prefix || '') + shown + (opts.suffix ? ` ${opts.suffix}` : '');
  }

  return ftSelectRow(root, label, display, () => {
    helper('openNumpadGeneric', value || '', raw => {
      onChange?.(raw);
      if (opts.dirty !== false) dirty = true;
      renderContractForm();
    }, {
      suffix: opts.suffix || '',
      maxLen: opts.maxLen || 16,
      group: opts.group !== false,
      prefix: opts.prefix || ''
    });
  }, { placeholder: opts.placeholder || 'وارد کنید' });
}

function ftCalcRow(root, text) {
  const row = document.createElement('div');
  row.className = 'ft-calc';
  row.textContent = text;
  root.appendChild(row);
  return row;
}

function contactDisplayName(contact) {
  if (!contact) return 'مخاطب';
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'مخاطب';
}

function pickerChanged() {
  dirty = true;
  renderContractForm();
}

function openContractPicker(kind) {
  const project = currentProject();
  if (!project || !state) return false;

  const addContact = () => {
    if (typeof window?.KarhaSearchTemplate?.close === 'function') window.KarhaSearchTemplate.close(false);
    else helper('closeSearchTemplate', false);

    const people = window?.KarhaApp?.modules?.get('people');
    if (typeof people?.openContactForm === 'function') {
      people.openContactForm(null, kind === 'contractor' ? { activityId: state.activityId } : undefined);
    } else {
      helper('showToast', 'افزودن مخاطب در دسترس نیست');
    }
  };

  if (kind === 'contractor') return contractPickers.openContractorPicker(project.id, state, pickerChanged, addContact);
  if (kind === 'employer') return contractPickers.openEmployerPicker(project.id, state, pickerChanged, addContact);
  return contractPickers.openProjectItemPicker(project.id, state, pickerChanged);
}

function makeInlineContractItem(text) {
  return {
    id: 'rc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    text: String(text || '').trim(),
    number: '',
    children: []
  };
}

function focusInlineAdd() {
  setTimeout(() => {
    document.querySelector('#realContractRootInlineAddInput, .real-contract-inline-add-input')?.focus();
  }, 0);
}

function commitContractInlineAdd(kind, parentId, input, keepFocus) {
  if (kind !== 'real' || !state) return false;
  const value = String(input?.value || '').trim();
  if (!value) return false;

  if (parentId) {
    const parent = contractItemInteractions.findItem(state.items, parentId);
    if (!parent) return false;
    if (!Array.isArray(parent.children)) parent.children = [];
    parent.children.push(makeInlineContractItem(value));
  } else {
    state.items.push(makeInlineContractItem(value));
  }

  realContractDomain.renumberRealContractItems(state.items);
  dirty = true;
  input.value = '';
  inlineAddState = keepFocus ? { parentId: parentId ?? null } : null;
  renderContractForm();
  if (keepFocus) focusInlineAdd();
  return true;
}

function renderContractInlineAddRow(parentId = null) {
  const row = document.createElement('div');
  row.className = 'inline-add-row active contract-inline-add-row';

  const input = document.createElement('input');
  input.className = 'real-contract-inline-add-input';
  input.placeholder = parentId ? 'بند جدید…' : 'ماده جدید…';

  let ignoreBlur = false;
  const commit = keepFocus => {
    const ok = commitContractInlineAdd('real', parentId, input, keepFocus);
    if (ok) {
      ignoreBlur = true;
      setTimeout(() => { ignoreBlur = false; }, 100);
    }
  };

  input.onkeydown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commit(true);
    } else if (event.key === 'Escape') {
      inlineAddState = null;
      renderContractForm();
    }
  };

  input.onblur = () => {
    if (ignoreBlur) return;
    setTimeout(() => {
      if (ignoreBlur || document.activeElement === input) return;
      if (input.value.trim()) commit(false);
    }, 120);
  };

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'x-btn';
  cancel.textContent = '×';
  cancel.onclick = () => {
    inlineAddState = null;
    renderContractForm();
  };

  row.append(input, cancel);
  return row;
}

function renderContractRootInlineAddRow() {
  if (inlineAddState?.parentId === null) {
    const row = renderContractInlineAddRow(null);
    row.classList.add('contract-root-inline-add-row-active');
    const input = row.querySelector('input');
    if (input) input.id = 'realContractRootInlineAddInput';
    setTimeout(() => input?.focus(), 0);
    return row;
  }

  const row = document.createElement('div');
  row.className = 'inline-add-row';
  row.innerHTML = '<span class="plus-circle">' + (helper('svgPlus') || '+') + '</span><span>افزودن ماده</span>';
  row.onclick = () => {
    inlineAddState = { parentId: null };
    renderContractForm();
    focusInlineAdd();
  };
  return row;
}

function renderRealContractItem(item, list, index, isChild = false) {
  const card = document.createElement('div');
  card.className = 'real-contract-item contract-work-item' + (isChild ? ' contract-item-card-child' : '') + (!isChild ? ` contract-group-${index % 2 === 0 ? 'even' : 'odd'}` : '');
  card.dataset.realContractDragId = item.id;
  card.dataset.contractDragId = item.id;

  const row = document.createElement('div');
  row.className = 'real-contract-item-row contract-work-row';

  const grip = document.createElement('span');
  grip.className = 'real-contract-grip contract-work-grip';
  grip.innerHTML = helper('svgGrip') || '⋮⋮';
  grip.title = 'جابه‌جایی';
  grip.onpointerdown = event => contractItemInteractions.attachPointerDrag({
    handle: event.currentTarget,
    list,
    id: item.id,
    kind: 'real',
    state: { items: state.items },
    onDirty: () => { dirty = true; },
    onRender: () => renderContractForm()
  });
  row.appendChild(grip);

  const number = document.createElement('div');
  number.className = 'real-contract-num contract-work-number';
  number.textContent = helper('toPersianDigits', item.number || '') ?? item.number ?? '';
  row.appendChild(number);

  const input = document.createElement('textarea');
  input.className = 'real-contract-text contract-work-input';
  input.value = item.text || '';
  input.placeholder = isChild ? 'متن بند را وارد کنید…' : 'متن ماده را وارد کنید…';
  input.oninput = () => {
    contractItemInteractions.updateItemText(item, input.value, { dirty: true });
    dirty = true;
  };
  row.appendChild(input);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'real-contract-btn danger contract-inline-delete';
  remove.textContent = 'حذف';
  remove.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    contractItemInteractions.removeItem(list, index, { items: state.items, dirty: true });
    dirty = true;
    renderContractForm();
  };
  row.appendChild(remove);
  card.appendChild(row);

  if (!isChild) {
    if (inlineAddState?.parentId === item.id) {
      card.appendChild(renderContractInlineAddRow(item.id));
    } else {
      const addChild = document.createElement('button');
      addChild.type = 'button';
      addChild.className = 'contract-add-child-row';
      addChild.title = 'افزودن بند';
      addChild.innerHTML = helper('svgPlus') || '+';
      addChild.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        inlineAddState = { parentId: item.id };
        renderContractForm();
        focusInlineAdd();
      };
      card.appendChild(addChild);
    }

    const children = document.createElement('div');
    children.className = 'real-contract-child contract-work-child-list';
    (item.children || []).forEach((child, childIndex) => {
      children.appendChild(renderRealContractItem(child, item.children, childIndex, true));
    });
    card.appendChild(children);
  }

  return card;
}

function renderContractForm() {
  const body = document.getElementById('contractFormBody');
  if (!body || !state) return false;

  const project = currentProject();
  if (!project) return false;

  const scrollHost = body.closest('.page-body') || body;
  const savedScroll = scrollHost.scrollTop || 0;
  body.innerHTML = '';

  const contacts = (helper('getContacts', project) || project.contacts || []).filter(contact => !contact.trashed);
  const findContact = id => contacts.find(contact => String(contact.id) === String(id)) || null;
  const activity = helper('findActivityTemplate', state.activityId, project);
  const activityName = activity?.name || activity?.title || '';
  const form = ftCreateRoot(body);

  ftTextRow(form, 'شماره قرارداد', state.contractNo || '', value => { state.contractNo = value; }, {
    readonly: !state.contractNo,
    placeholder: state.contractNo ? '' : 'توسط سیستم تولید می‌شود'
  });
  ftDateRow(form, 'تاریخ تنظیم قرارداد', state.contractDate || helper('todayJalaliStr'), value => { state.contractDate = value; }, { maxToday: true });

  const projectPlace = project.location || project.address || project.projectLocation || project.siteLocation || '';
  if (!state.contractPlace) state.contractPlace = projectPlace;
  ftTextRow(form, 'محل انعقاد قرارداد', state.contractPlace || '', value => { state.contractPlace = value; }, { placeholder: 'پیش‌فرض: محل پروژه' });

  ftSelectRow(form, 'آیتم پروژه', state.projectItemPath || '', () => openContractPicker('projectItem'), { placeholder: 'انتخاب' });
  ftSelectRow(form, 'پیمانکار', contactDisplayName(findContact(state.contractorId)), () => openContractPicker('contractor'), { placeholder: 'انتخاب' });
  ftSelectRow(form, 'کارفرما', contactDisplayName(findContact(state.employerId)), () => openContractPicker('employer'), { placeholder: 'انتخاب' });

  ftTextRow(form, 'عنوان قرارداد', state.title || '', value => { state.title = value; }, { placeholder: 'عنوان قرارداد' });
  ftTextRow(form, 'موضوع قرارداد', state.subject || '', value => { state.subject = value; }, { placeholder: 'موضوع قرارداد' });

  ftNumberRow(form, 'مبلغ قرارداد', state.amount || '', value => { state.amount = value; }, { suffix: 'تومان' });

  const durationDays = Number(state.durationDays || 0);
  ftNumberRow(form, 'مدت قرارداد', durationDays ? String(durationDays) : '', value => {
    state.durationDays = value ? Number(value) : '';
  }, { suffix: 'روز', group: false, maxLen: 5 });

  const startDate = state.startDate || '';
  ftDateRow(form, 'تاریخ شروع', startDate, value => { state.startDate = value; }, { maxToday: false });

  const endDate = startDate && durationDays
    ? (helper('addJalaliDays', startDate, durationDays) || '')
    : '';
  if (endDate) {
    ftCalcRow(form, 'تاریخ پایان: ' + (helper('formatJalaliDisplay', endDate) || endDate));
  }

  const advancePercent = Number(state.advancePercent || 0);
  ftNumberRow(form, 'پیش‌پرداخت', advancePercent ? String(advancePercent) : '', value => {
    state.advancePercent = value ? Number(value) : '';
  }, { suffix: '٪', group: false, maxLen: 3 });

  const amount = Number(state.amount || 0);
  if (amount && advancePercent) {
    const advance = Math.round(amount * advancePercent / 100);
    ftCalcRow(form, 'مبلغ پیش‌پرداخت: ' + (helper('formatCost', advance) || advance) + ' تومان');
  }

  const stagesSection = document.createElement('div');
  stagesSection.className = 'real-contract-section';
  const stagesTitle = document.createElement('div');
  stagesTitle.className = 'real-contract-section-title';
  stagesTitle.textContent = 'مراحل پرداخت';
  stagesSection.appendChild(stagesTitle);
  stagesSection.appendChild(paymentStagesModule.renderPaymentStages(state, {
    onChange: () => { dirty = true; },
    formatCost: value => helper('formatCost', value) || value,
    toPersianDigits: value => helper('toPersianDigits', value) || value
  }));
  form.appendChild(stagesSection);

  const itemsSection = document.createElement('div');
  itemsSection.className = 'real-contract-section';
  const itemsTitle = document.createElement('div');
  itemsTitle.className = 'real-contract-section-title';
  itemsTitle.textContent = 'مواد قرارداد';
  itemsSection.appendChild(itemsTitle);
  (state.items || []).forEach((item, index) => {
    itemsSection.appendChild(renderRealContractItem(item, state.items, index, false));
  });
  itemsSection.appendChild(renderContractRootInlineAddRow());
  form.appendChild(itemsSection);

  const notes = document.createElement('textarea');
  notes.className = 'ft-input';
  notes.placeholder = 'توضیحات';
  notes.value = state.notes || '';
  notes.oninput = () => { state.notes = notes.value; dirty = true; };
  form.appendChild(notes);

  scrollHost.scrollTop = savedScroll;
  return true;
}

function makeDefaultState(project) {
  const today = helper('todayJalaliStr') || '';
  return realContractDomain.makeRealContract({
    id: null,
    contractNo: '',
    contractDate: today,
    contractPlace: project?.location || project?.address || '',
    projectItemId: '',
    projectItemPath: '',
    contractorId: '',
    employerId: '',
    title: '',
    subject: '',
    amount: '',
    durationDays: '',
    startDate: '',
    advancePercent: '',
    paymentStages: [],
    items: [],
    notes: ''
  });
}

function readDraft(projectId) {
  try {
    const raw = localStorageAdapter.get(REAL_CONTRACT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || String(parsed.projectId) !== String(projectId) || !parsed.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(projectId) {
  try {
    localStorageAdapter.set(REAL_CONTRACT_DRAFT_KEY, JSON.stringify({ projectId, state }));
    return true;
  } catch {
    return false;
  }
}

function clearDraft() {
  try { localStorageAdapter.remove(REAL_CONTRACT_DRAFT_KEY); } catch {}
}

function hasMeaningfulState() {
  if (!state) return false;
  return !!(
    state.projectItemId || state.projectItemPath || state.contractorId || state.employerId ||
    state.title || state.subject || state.amount || state.durationDays || state.startDate ||
    state.advancePercent || state.notes || (state.paymentStages || []).length || (state.items || []).length
  );
}

function open(id = null, projectId = null) {
  const project = activeProject(projectId);
  if (!project) return false;

  activeProjectId = project.id;
  if (!openFormShell(project.id)) {
    activeProjectId = null;
    return false;
  }

  editingId = id || null;
  inlineAddState = null;
  dirty = false;

  if (editingId) {
    const existing = realContractDomain.findRealContract(project, editingId);
    if (!existing) {
      closeFormShell(false);
      activeProjectId = null;
      return false;
    }
    state = realContractDomain.cloneRealContract(existing);
  } else {
    const draft = readDraft(project.id);
    state = draft?.state ? realContractDomain.cloneRealContract(draft.state) : makeDefaultState(project);
  }

  const title = document.getElementById('contractFormTitle');
  if (title) title.textContent = editingId ? 'ویرایش قرارداد' : 'قرارداد جدید';
  renderContractForm();
  helper('setContractFormSession', {
    editingId,
    projectId: project.id,
    baseline: realContractDomain.cloneRealContract(state),
    dirty: false,
    draftExists: !editingId && !!readDraft(project.id)
  });
  return true;
}

function close(fromPopState = false) {
  state = null;
  dirty = false;
  editingId = null;
  inlineAddState = null;
  activeProjectId = null;
  helper('clearContractFormSession');
  closeFormShell(fromPopState);
  return true;
}

function save() {
  const project = currentProject();
  if (!project || !state) return false;
  const saved = saveRealContract(project, state, { editingId });
  if (!saved) return false;
  helper('markDirty', project.id);
  helper('persist');
  clearDraft();
  dirty = false;
  helper('setContractFormSession', {
    editingId: saved.id,
    projectId: project.id,
    baseline: realContractDomain.cloneRealContract(saved),
    dirty: false,
    draftExists: false
  });
  close(false);
  helper('renderContracts');
  return saved;
}

function requestClose() {
  const session = helper('getContractFormSession');
  const dirtyNow = dirty || !!session?.dirty;
  if (!dirtyNow && !hasMeaningfulState()) {
    close(true);
    return true;
  }

  const choice = helper('showIncompleteFormExitChoice', {
    editing: !!editingId,
    canDraft: !editingId,
    hasDraft: !editingId && !!readDraft(activeProjectId),
    onStay: () => {
      if (!formHistoryOwned) {
        helper('pushWorkspaceHistory', 'contractForm');
        formHistoryOwned = true;
      }
    },
    onExitWithoutSave: () => {
      if (!editingId) clearDraft();
      close(false);
    },
    onSaveDraft: () => {
      if (!editingId) writeDraft(activeProjectId);
      close(false);
    }
  });
  return choice !== false;
}

function isOpen() {
  const page = document.getElementById('contractFormPage');
  return !!page && !page.classList.contains('hidden');
}

function isDirty() {
  return dirty || !!helper('getContractFormSession')?.dirty;
}

function markDirty() {
  dirty = true;
  const session = helper('getContractFormSession');
  if (session) helper('setContractFormSession', { ...session, dirty: true });
}

function getState() {
  return state;
}

export const realContractFormModule = Object.freeze({
  open,
  close,
  save,
  requestClose,
  isOpen,
  isDirty,
  markDirty,
  getState,
  render: renderContractForm
});

if (typeof window !== 'undefined') window.KarhaRealContractForm = realContractFormModule;
