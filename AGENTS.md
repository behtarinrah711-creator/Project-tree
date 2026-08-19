# Repository instructions

## Site version

- `src/core/siteVersion.js` is the only source of truth for the public site version.
- Codex and regular feature, fix, refactor, migration, and UI tasks must not edit `src/core/siteVersion.js`.
- GitHub Actions automatically increments the version exactly once after a runtime site change is pushed or merged to `main`.
- Never increment the version manually in a regular task or feature pull request.
- Never lower the version when resolving a conflict; keep the highest version reached.
- Never duplicate the current version literal in HTML, CSS, documentation, or another JavaScript file; consumers must import it from the central module.
