import { createLegacyModule } from '../legacyModule.js';

export default createLegacyModule({ id: 'people', title: 'کارکنان و پیمانکاران', route: 'people', open: 'openContactsPage', render: 'renderContactsPage', selectors: ['#contactsPage', '#contactsPageBody'], dataCollections: ['contacts', 'activityTemplates'] });
