# Modular Project-tree architecture

`index.html` is now a shell: it owns the static app containers and loads the extracted CSS/JavaScript bundles. The legacy runtime remains available while features are migrated module by module.

## Layers

- `src/bootstrap/` starts the app, cache guard, router, module registry, and shared services.
- `src/core/` contains route parsing, module registration, and `ProjectContextStore`.
- `src/data/` reads existing localStorage data without resetting or renaming legacy keys.
- `src/modules/<module>/` contains one independently registered project module.
- `src/styles/legacy.css` contains CSS extracted from the old monolithic file.
- `src/legacy/legacyApp.js` contains the remaining legacy application runtime and a small `window.KarhaLegacy` bridge used during migration.

## Migrated module boundaries

The following real capabilities are registered as project modules and receive the active `projectId` before delegating to their current legacy renderer:

| Module | Capability | Legacy entry point | Project-scoped data |
| --- | --- | --- | --- |
| `dashboard` | project task dashboard | `renderAll` | active project tasks |
| `contracts` | contracts and contract templates | `openContractsPage` / `renderContractsPage` | `contracts`, `contractTemplates`, contacts, activities |
| `statuses` | status reports | `openStatusList` / `renderStatusList` | `statusReports` |
| `minutes` | meeting minutes | `openMinutesPage` / `renderMinutesPage` | `minutes` |
| `letters` | letters and letter numbering | `openLettersPage` / `renderLettersPage` | `letters`, `letterCounters` |
| `accounting` | accounting workspace | `renderAccountingWorkspace` | tasks, contracts, status reports |
| `purchases` | purchases | `openPurchasesPage` / `renderPurchasesPage` | `purchases` |
| `reports` | reports workspace | `renderReportsWorkspace` | tasks, contracts, status reports |
| `people` | contacts, staff, contractors | `openContactsPage` / `renderContactsPage` | `contacts`, activity templates |

## Legacy that intentionally remains

`src/legacy/legacyApp.js` still contains the large shared runtime because the original app keeps cross-cutting state (`data`, sync queues, auth state, dialogs, PDF/export helpers, and undo/delete flows) in one lexical scope. It was moved out of `index.html` first, then exposed through `window.KarhaLegacy` so new modules can safely set the active `projectId` without losing existing data. Future migrations should move one module's renderer and state helpers at a time from `src/legacy/legacyApp.js` into its `src/modules/<module>/` folder.

## Navigation and workspace scope

Project selection is intentionally global and happens only through the top-right hamburger drawer. The drawer owns account/email display, project management, deleted records, and the selectable project list. The footer `Projects` tab is not a project switcher anymore; it renders only the working items for `data.activeTab`, which is synchronized to `#/projects/<projectId>/<module>` and `ProjectContextStore`.

When no project is selected, the reusable workspace renders an explicit empty state instead of falling back to the first or last project. Selecting a project calls the legacy bridge/selection helper, writes the route, updates the modular `projectContext`, refreshes the drawer active row, and then renders the active project's scoped workspace.
