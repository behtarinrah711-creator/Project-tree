# Rapid Back transaction analysis

## Observed failing sequence

Instrumentation of the four-call stress case showed that the History API calls
were accepted before the first `popstate` had reconciled the child controller.
The relevant ordering was:

1. The current entry was the `contract-form` child entry, above the `contracts`
   child entry. Four relative Back traversals were requested.
2. The first `popstate` named the older `contracts` entry as its destination.
   The controller removed `child-4`; the dirty policy synchronously restored it
   with a new entry and pushed `transient:incomplete-exit-choice` above it.
3. A traversal that had already been accepted before step 2 subsequently
   committed. Its destination was from the **old** branch, not from the newly
   reconstructed form/prompt branch. Its `event.state.child` was therefore an
   older child (and eventually `null`).
4. That stale event was nevertheless reconciled against the **new** in-memory
   `layers` array. It consumed the reconstructed transient and form. Because
   `pushState` had replaced the old forward branch, relative repair could not
   make the stale destination refer to the reconstructed generation. The
   controller could still leave the form DOM mounted while the browser's
   current state was `child: null`.

`handlingPop` only guards reentrancy during one JavaScript dispatch. It cannot
guard a second browser traversal delivered as a later task, so it did not cover
this sequence. The faulty event was thus neither a duplicate nor an event
processed twice: it was an already-accepted traversal from the previous history
branch, processed against the wrong generation of the child stack.

## Resolution

The canonical browser-history boundary now treats a Navigation API `traverse`
as a transaction. The first traversal is admitted; additional traversals are
cancelled until its `popstate` commit has run the route and child restorers.
Consequently, a dirty policy can reconstruct the form and transient before a
later Back chooses its destination. A later deliberate Back is admitted after
the commit and dismisses only the transient.

This is central and form-independent: every route or same-route history owner
uses the same serialization. Browsers without the Navigation API retain the
existing History API path; no second component mutates history, no sentinel
entries are added, and no timing delay is used. Cross-document navigation is
not replaced by a normal `beforeunload` prompt; the enhancement only cancels an
overlapping traverse while an application traversal is being reconciled.
