import { renderAll } from '../ui/workspacePresentationRuntime.js';
/* Binds the real workspace renderer after presentation runtime evaluation. */
(function bindApplicationRefresh(){
  window.KarhaApplicationRefresh?.register?.(renderAll);
})();
