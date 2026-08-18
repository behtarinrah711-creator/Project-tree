import { createLegacyModule } from '../legacyModule.js';

export default createLegacyModule({ id: 'statuses', title: 'صورت وضعیت‌ها', route: 'statuses', open: 'openStatusList', render: 'renderStatusList', selectors: ['#statusListPage', '#statusListBody'], dataCollections: ['statusReports'] });
