# Repository instructions

## Site version

- `src/core/siteVersion.js` is the only source of truth for the public site version.
- Every task that changes site code must increment `SITE_VERSION` exactly once by one integer.
- Do not increment the version for analysis-only or report-only tasks that leave site files unchanged.
- A task increments the version only once, regardless of how many files it changes.
- Never lower the version when resolving a conflict; keep the highest version reached.
- Never duplicate the current version literal in HTML, CSS, documentation, or another JavaScript file; consumers must import it from the central module.
