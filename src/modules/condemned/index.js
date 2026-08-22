/**
 * Phase 4.6 — Quarantine boundary for product features scheduled for removal.
 * No product refactor: these modules stay as-is; this file only documents and
 * re-exports the condemned surface so shell inventory can treat them as a group.
 *
 * Condemned (delete in a later phase, not Phase 4):
 * - letters
 * - minutes
 * - purchases
 * - statuses (standalone status reports)
 * - contract status / approval UI (contract-attached status reports)
 * - sharing / collaboration (legacy cloud fork paths)
 *
 * Do not wire these into Domain APIs for the five durable domains.
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
