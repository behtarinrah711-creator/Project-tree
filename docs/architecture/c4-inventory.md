# C4 current-branch correction inventory

Inventory date: 2026-08-25. Correction baseline: `ffae0c3` (the first C4 attempt). The baseline's valid single module entry, cache/shell imports, guest Firebase fallback, and deleted classic loader are retained.

## Current-branch classification

| Class | Current branch element | Finding | Correction |
|---|---|---|---|
| A | `app.js`, cache guard, shell entry | Legitimate module entry work | Retained unchanged |
| B | `applicationRuntime.js` lines 5–1518 | Eleven owner files had merely been copied into one lexical file | Removed copied bodies; runtime now imports their named APIs |
| C | Foundation, child history, Contract history/lifecycle/compatibility/Search Template, Workspace form/presentation, refresh binding, feature composition | Existing canonical owner files remained in the tree but were not in the loaded graph | Converted each owner to an ES module with named imports/exports and restored it to the loaded graph |
| D | `KarhaLegacy` surface | 42 state-free delegates still have active production compatibility callers | Retained; no entry exists solely for tests |
| E | `window.Karha*` | 509 production textual references existed at the correction baseline, including duplicated embedded owner bodies | 352 remain; a Node architecture audit prevents unreviewed growth |
| F | Firebase, `html2canvas`, installed DOM/history APIs | External SDK or deliberately installed browser boundaries | Retained without semantic changes |

## Before and after graphs

First C4 attempt: `index → app → startup → one 1,647-line applicationRuntime module containing copied owner bodies → Router`.

Corrected graph: `index → app → startup → applicationRuntime orchestrator`; the orchestrator imports Foundation, child-history, Workspace form/presentation, Contract compatibility/Search Template, and feature composition. Those modules import their exact named collaborators. Refresh runtime/binding and Contract history/lifecycle are reached through those owner imports. Router still starts only after the runtime graph evaluates.

No internal script element, sequential URL manifest, or runtime dependency bag is used. ES-module linking, rather than script download/evaluation order, now supplies cross-file names.

## Owner restoration

The copied implementations were removed from `applicationRuntime.js` and restored to:

- `core/applicationRefreshRuntime.js` and `core/applicationRefreshBinding.js`
- `core/applicationFoundation.js`
- `core/childHistoryController.js`
- `ui/workspaceFormPresentation.js` and `ui/workspacePresentationRuntime.js`
- `modules/contracts/contractHistoryController.js`, `searchTemplateModule.js`, `contractFormLifecycle.js`, and `contractCompatibility.js`
- `modules/runtime/featureComposition.js`

`applicationRuntime.js` changed from **1,647 lines / 75,653 bytes** to **137 lines / 6,511 bytes** at the first completed split (the exact committed byte count may differ slightly after formatting). It now performs initialization and compatibility publication only.

## Compatibility and global counts

KarhaLegacy is **43 entries before → 42 after**. The `requestAnimationFrame` delegate was removed: its sole Contract caller now uses the browser platform API directly. Its remaining callers are the dashboard/task renderer, Contacts/Activities delete feedback, Contract shells/forms/list, profile/export views, live repository adapters, Recovery/route-surface bridges, SoftDelete, Workspace Chrome, and bootstrap persistence adapters. Generic compatibility calls in those owners can address the documented surface, so deleting individual keys without completing those owner migrations would change behavior. The facade remains frozen and state-free.

Production `window.Karha*` references are **509 before → 352 after**, counted by the portable Node scanner embodied in `c4GlobalAudit.test.js`; tests are excluded. Remaining globals are installed browser boundaries: `KarhaApp`, `KarhaAppData`, `KarhaUI`, `KarhaChildHistory`, Workspace Chrome, Contract APIs, Search Template, Back Gesture Guard, Application Refresh, Firebase runtime, and the residual KarhaLegacy facade. They remain because independently installed DOM/SDK compatibility consumers call them; module-to-module references in the restored owner graph use imports.

## Inline handlers and cycles

`index.html` has no inline application event attributes. Existing `.onclick` bindings remain with their presentation owners.

The restored owner graph contains cyclic strongly-connected presentation dependencies inherited from the former shared lexical runtime (Foundation ↔ Workspace presentation ↔ feature composition, with child/Contract adapters). ES-module live bindings make these dependencies explicit and remove evaluation-order lookup, but the cycles are not hidden behind a registry or new global. Further decomposition would change feature ownership and is outside this correction; the browser graph must therefore remain covered by startup/E2E CI.
