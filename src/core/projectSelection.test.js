import assert from 'node:assert/strict';
import test from 'node:test';
import { ProjectSelectionLifecycle, bindProjectSelectionRow } from './projectSelection.js';

function harness(initialId='project-A'){
  const projects=['project-A','project-B','project-C'].map(id=>({id,tasks:[{id:`task-${id}`}] }));
  const state={activeTab:initialId,context:initialId,url:`#/projects/${initialId}/dashboard`,persisted:initialId,renders:[],taskReads:[],closed:0,drawerRenders:[]};
  const lifecycle=new ProjectSelectionLifecycle().configure({
    getProjects:()=>projects,
    setActiveProjectId:id=>{ state.activeTab=id; },
    setProjectContext:id=>{ state.context=id; },
    setRoute:id=>{ state.url=`#/projects/${id}/dashboard`; },
    persist:id=>{ state.persisted=id; },
    closeDrawer:()=>{ state.closed++; },
    renderWorkspace:id=>{ state.taskReads.push(projects.find(p=>p.id===id).id); state.renders.push(id); },
    renderDrawer:id=>{ state.drawerRenders.push(id); },
  });
  return {lifecycle,state};
}

function assertSelected(state,id){
  assert.equal(state.activeTab,id);
  assert.equal(state.context,id);
  assert.equal(state.url,`#/projects/${id}/dashboard`);
  assert.equal(state.persisted,id);
  assert.equal(state.renders.at(-1),id);
  assert.equal(state.taskReads.at(-1),id);
}

test('selection lifecycle switches A to B, B to C, and restores persisted C',()=>{
  const {lifecycle,state}=harness();
  assert.equal(lifecycle.select('project-B'),true);
  assertSelected(state,'project-B');
  assert.equal(lifecycle.select('project-C'),true);
  assertSelected(state,'project-C');

  const refreshed=harness(state.persisted);
  assert.equal(refreshed.state.activeTab,'project-C');
  assert.equal(refreshed.state.context,'project-C');
  assert.equal(refreshed.state.url,'#/projects/project-C/dashboard');
  assert.equal(refreshed.state.persisted,'project-C');
});

test('each drawer-style row handler selects its own dataset project id',()=>{
  const {lifecycle,state}=harness();
  const rows=['project-A','project-B','project-C'].map(projectId=>({
    dataset:{projectId},
    click(){ return this.onclick({currentTarget:this,preventDefault(){},stopPropagation(){}}); },
  }));
  rows.forEach(row=>bindProjectSelectionRow(row,lifecycle));
  rows[1].click();
  assertSelected(state,'project-B');
  rows[2].click();
  assertSelected(state,'project-C');
});
