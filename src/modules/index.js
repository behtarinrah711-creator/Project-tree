import dashboard from './dashboard/index.js';
import contracts from './contracts/index.js';
import statuses from './statuses/index.js';
import minutes from './minutes/index.js';
import letters from './letters/index.js';
import accounting from './accounting/index.js';
import purchases from './purchases/index.js';
import reports from './reports/index.js';
import people from './people/index.js';
import activities from './activities/index.js';
import { CONDEMNED_MODULE_IDS, isCondemnedModuleId } from './condemned/index.js';

/** Durable workspace modules first; condemned remain registered until removal phase. */
export const projectModules = [dashboard, contracts, statuses, minutes, letters, accounting, purchases, reports, people, activities];

export { CONDEMNED_MODULE_IDS, isCondemnedModuleId };
