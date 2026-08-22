import { ContactRepository } from './contactRepository.js';
import { ProjectRepository } from './projectRepository.js';

function createMemoryStorage(initialEntries = {}){
  const entries=new Map(Object.entries(initialEntries));
  const writes=[];
  return {
    getItem(key){ return entries.has(key) ? entries.get(key) : null; },
    setItem(key,value){ entries.set(key,String(value)); writes.push(key); },
    removeItem(key){ entries.delete(key); },
    keys(){ return [...entries.keys()]; },
    writes,
  };
}

export function assertContactRepositoryContract(){
  const repository=new ContactRepository(new ProjectRepository(createMemoryStorage()));
  for(const method of ['list','listPage','get','save','update','softDelete']){
    if(typeof repository[method] !== 'function'){
      throw new Error(`ContactRepository contract missing: ${method}`);
    }
  }
  return true;
}

export function assertContactRepositoryBehavior(){
  const initial={
    projects:[{
      id:'p1',
      name:'Project',
      activities:[{id:'a1'}],
      contacts:[{id:'c1',firstName:'Old',customField:{preserved:true},trashed:false}],
    }],
    unrelatedTopLevelData:{preserved:true},
  };
  const storage=createMemoryStorage({'gtasks-clone-v2':JSON.stringify(initial)});
  const repository=new ContactRepository(new ProjectRepository(storage));

  if(repository.list('p1').length !== 1 || repository.get('p1','c1')?.firstName !== 'Old'){
    throw new Error('ContactRepository list/get behavior failed');
  }
  if(repository.list('missing').length !== 0 || repository.get('p1','missing') !== null){
    throw new Error('ContactRepository missing-record behavior failed');
  }

  const created={id:'c2',firstName:'Created',phones:['1'],trashed:false};
  if(repository.save('p1',created) !== created || repository.get('p1','c2')?.phones[0] !== '1'){
    throw new Error('ContactRepository save behavior failed');
  }

  const updated=repository.update('p1','c2',contact => ({...contact,firstName:'Updated'}));
  if(updated?.firstName !== 'Updated' || repository.get('p1','c2')?.firstName !== 'Updated'){
    throw new Error('ContactRepository update behavior failed');
  }

  const deleted=repository.softDelete('p1','c2');
  if(!deleted?.trashed || !repository.get('p1','c2')?.trashed){
    throw new Error('ContactRepository softDelete behavior failed');
  }

  const persisted=JSON.parse(storage.getItem('gtasks-clone-v2'));
  const persistedProject=persisted.projects[0];
  if(!Array.isArray(persistedProject.contacts) ||
     persistedProject.contacts[0].customField?.preserved !== true ||
     persistedProject.activities[0].id !== 'a1' ||
     persisted.unrelatedTopLevelData?.preserved !== true){
    throw new Error('ContactRepository changed the existing data shape');
  }
  if(Object.hasOwn(persistedProject.contacts[1], 'deletedAt')){
    throw new Error('ContactRepository added a field during soft delete');
  }
  if(storage.keys().length !== 1 || storage.keys()[0] !== 'gtasks-clone-v2' ||
     storage.writes.some(key => key !== 'gtasks-clone-v2')){
    throw new Error('ContactRepository changed storage keys');
  }

  return true;
}

export function assertContactRepositoryLegacyKeyCompatibility(){
  const storage=createMemoryStorage({
    projects:JSON.stringify([{id:'legacy',contacts:[{id:'c1',name:'Legacy'}]}]),
  });
  const repository=new ContactRepository(new ProjectRepository(storage));

  repository.update('legacy','c1',contact => ({...contact,name:'Updated'}));
  const persisted=JSON.parse(storage.getItem('projects'));
  if(persisted[0].contacts[0].name !== 'Updated' || storage.keys().includes('gtasks-clone-v2')){
    throw new Error('ContactRepository is incompatible with ProjectRepository legacy-key persistence');
  }
  return true;
}
