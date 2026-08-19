const LEGACY_RUNTIME_SELECTOR = 'script[data-karha-legacy-runtime]';

/**
 * Loads the remaining legacy runtime with classic-script semantics.
 *
 * The runtime intentionally is not an ES module: it has no imports or exports,
 * and its existing HTML/router integrations rely on classic global function
 * declarations. Keeping the load here makes the ordering explicit: app.js
 * publishes the modular KarhaApp API first, this script executes second, and
 * routing starts only after the legacy compatibility boundary is available.
 */
export function loadLegacyRuntime({
  documentRef = document,
  sourceUrl = new URL('../legacy/legacyApp.js', import.meta.url).href,
} = {}){
  const existing = documentRef.querySelector(LEGACY_RUNTIME_SELECTOR);
  if(existing){
    if(existing.dataset.loaded === 'true') return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(existing), { once: true });
      existing.addEventListener('error', () => reject(new Error('Legacy runtime failed to load')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = documentRef.createElement('script');
    script.src = sourceUrl;
    script.async = false;
    script.dataset.karhaLegacyRuntime = '';
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve(script);
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Legacy runtime failed to load: ${sourceUrl}`)), { once: true });
    documentRef.body.appendChild(script);
  });
}
