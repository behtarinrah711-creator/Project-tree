import { createLegacyModule } from '../legacyModule.js';

export default createLegacyModule({ id: 'dashboard', title: 'داشبورد پروژه', route: 'projects', render: 'renderAll', selectors: ['#content', '#tabbar'] });
