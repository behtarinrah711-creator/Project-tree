const LEGACY_RUNTIME_SELECTOR = 'script[data-karha-legacy-runtime]';

function installLegacyGlobalHelpers(windowRef, documentRef){
  if(typeof windowRef.elFromHtml !== 'function'){
    windowRef.elFromHtml = function elFromHtml(html){
      const template = documentRef.createElement('template');
      template.innerHTML = String(html || '').trim();
      return template.content.firstElementChild;
    };
  }
}

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
  windowRef = window,
  sourceUrl = new URL('../legacy/legacyApp.js', import.meta.url).href,
} = {}){
  // legacyApp still passes the bare `elFromHtml` identifier into taskRuntime
  // before it installs KarhaLegacy. If the helper is missing, evaluation stops
  // halfway through and footer navigation/forms become non-interactive.
  installLegacyGlobalHelpers(windowRef, documentRef);

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
