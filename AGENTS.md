# Repository instructions

## Site version

- `src/core/siteVersion.js` is the only source of truth for the public site version.
- Codex tasks must not edit `src/core/siteVersion.js` or increment `SITE_VERSION`.
- Version increments are performed only after merge on the `main` branch, never in Codex task branches.
- Unless a task explicitly concerns version management on `main`, `src/core/siteVersion.js` must not appear in its diff.
- Do not remove or alter the existing version indicator or its display as part of unrelated tasks.
- Never duplicate the current version literal in HTML, CSS, documentation, or another JavaScript file; consumers must import it from the central module.
