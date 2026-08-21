# Logout session cache isolation

The browser must not expose projects, tasks, reports, profile data, or recovery data from the previously authenticated account after Firebase signs out.

The guard installed after the legacy runtime watches for an authenticated-to-anonymous transition, removes only Project-tree localStorage keys (`gtasks-*` and `karha_*`), clears sessionStorage navigation state, and reloads once to discard legacy in-memory recovery state. Initial anonymous startup does not clear guest data.
