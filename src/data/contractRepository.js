import { projectRepository } from './projectRepository.js';

/**
 * Project-scoped persistence boundary for real contracts.
 *
 * Contracts intentionally remain in Project.contracts. This repository only
 * centralizes access to that existing collection and delegates persistence to
 * ProjectRepository.
 */
export class ContractRepository{
  constructor(projectRepo = projectRepository){
    this.projectRepository = projectRepo;
  }

  list(projectId){
    return this.projectRepository.scoped(projectId, 'contracts');
  }

  get(projectId, contractId){
    if(!contractId) return null;
    return this.list(projectId).find(contract =>
      String(contract.id) === String(contractId)
    ) || null;
  }

  save(projectId, contract){
    if(!projectId || !contract) return null;

    const saved = this.projectRepository.updateProject(projectId, project => {
      if(!Array.isArray(project.contracts)) project.contracts=[];
      const index=project.contracts.findIndex(item =>
        String(item.id) === String(contract.id)
      );
      if(index >= 0) project.contracts[index]=contract;
      else project.contracts.push(contract);
      return project;
    });

    return saved ? contract : null;
  }

  update(projectId, contractId, updater){
    const current=this.get(projectId, contractId);
    if(!current) return null;

    const next=typeof updater === 'function' ? updater(current) : updater;
    if(!next) return null;
    return this.save(projectId, next);
  }

  softDelete(projectId, contractId){
    return this.update(projectId, contractId, contract => ({
      ...contract,
      trashed:true,
      deletedAt:Date.now(),
    }));
  }
}

export const contractRepository = new ContractRepository();
