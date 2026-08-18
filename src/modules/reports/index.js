import { createLegacyModule } from '../legacyModule.js';

export default createLegacyModule({ id: 'reports', title: 'گزارش‌ها', route: 'reports', open: 'renderReportsWorkspace', selectors: ['#content'], dataCollections: ['tasks', 'contracts', 'statusReports'] });
