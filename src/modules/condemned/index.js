/**
 * Phase 5 — condemned boundary (removed from active registry).
 * Stored data fields may remain; active path must not read/write them.
 */

export const CONDEMNED_MODULE_IDS = Object.freeze([
  'letters',
  'minutes',
  'purchases',
  'statuses',
]);

export function isCondemnedModuleId(id){
  return CONDEMNED_MODULE_IDS.includes(String(id || ''));
}

export const CONDEMNED_ROUTE_REDIRECT = Object.freeze([
  'letters',
  'minutes',
  'purchases',
  'statuses',
  'contract-status',
  'contractStatus',
  'contract-approval',
  'status-test',
]);

export function isCondemnedRoute(moduleId){
  return CONDEMNED_ROUTE_REDIRECT.includes(String(moduleId || ''));
}
