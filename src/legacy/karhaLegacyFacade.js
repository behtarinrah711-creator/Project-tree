/** Thin, state-free compatibility publication for remaining global callers. */
export function installKarhaLegacyFacade(delegates, { windowRef = window } = {}) {
  if (!delegates || typeof delegates !== 'object') {
    throw new TypeError('KarhaLegacy delegates are required');
  }
  const facade = Object.freeze({ ...delegates });
  windowRef.KarhaLegacy = facade;
  return facade;
}

export function exposeKarhaLegacyInstaller({ windowRef = window } = {}) {
  windowRef.KarhaInstallLegacyFacade = delegates =>
    installKarhaLegacyFacade(delegates, { windowRef });
  return windowRef.KarhaInstallLegacyFacade;
}
