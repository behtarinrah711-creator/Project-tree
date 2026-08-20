import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectFromCloudDoc,
  mergeRecoveredProjects,
  chooseRecoveredProjectId,
} from './cloudProjectRecovery.js';

function doc(id,data){
  return { id, data(){ return data; } };
}

test('pre-migration ownerEmail project is recovered for the authenticated owner without rewriting its id',()=>{
  const user={uid:'uid-1',email:'owner@example.com'};
  const existing={id:'project-A',name:'Old name',tasks:[{id:'task-old',text:'old'}]};
  const project=projectFromCloudDoc(doc('project-A',{
    name:'Project A',
    ownerEmail:'OWNER@example.com',
    tasks:[{id:'task-new',text:'new'}],
  }),user,existing);

  assert.equal(project.id,'project-A');
  assert.equal(project.ownerUid,'uid-1');
  assert.equal(project.ownerEmail,'owner@example.com');
  assert.deepEqual(project.tasks.map(task=>task.id),['task-new','task-old']);
});

test('recovered cloud projects mutate the live legacy array in place and preserve unrelated projects',()=>{
  const live=[
    {id:'project-A',name:'A'},
    {id:'local-only',name:'Local'},
  ];
  const sameReference=live;
  const result=mergeRecoveredProjects(live,[
    {id:'project-A',name:'A from cloud'},
    {id:'project-B',name:'B'},
  ]);

  assert.equal(result,sameReference);
  assert.equal(live.length,3);
  assert.equal(live.find(project=>project.id==='project-A').name,'A from cloud');
  assert.ok(live.some(project=>project.id==='local-only'));
  assert.ok(live.some(project=>project.id==='project-B'));
});

test('active project is preserved when valid and recovery otherwise chooses a real visible project',()=>{
  const projects=[
    {id:'A'},
    {id:'B'},
    {id:'C',archived:true},
  ];
  assert.equal(chooseRecoveredProjectId(projects,{activeProjectId:'B',contextProjectId:'A'}),'B');
  assert.equal(chooseRecoveredProjectId(projects,{activeProjectId:'missing',contextProjectId:'A'}),'A');
  assert.equal(chooseRecoveredProjectId(projects,{activeProjectId:'missing',contextProjectId:'missing'}),'A');
});
