import { createLegacyModule } from '../legacyModule.js';

export default createLegacyModule({ id: 'contracts', title: 'قراردادها', route: 'contracts', open: 'openContractsPage', render: 'renderContractsPage', selectors: ['#contractsPage', '#contractsPageBody'], dataCollections: ['contracts', 'contractTemplates', 'contacts', 'activityTemplates'] });
