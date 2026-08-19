import { runApplicationStartup } from './startupRunner.js';

await runApplicationStartup(async () => {
  // This dynamic boundary makes failures while linking/evaluating the complete
  // application graph observable. The independent shell entry has already run.
  const { startApplication } = await import('./applicationStartup.js');
  return startApplication();
});
