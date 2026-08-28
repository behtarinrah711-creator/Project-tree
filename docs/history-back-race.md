# Rapid Back transaction analysis

## Chromium event order

The rapid test queues several `history.back()` calls before the first traversal
has settled. Chromium can select destinations from the branch that existed when
each request was made. The failing order is:

1. The current child is `contract-form`; the older entry is `contracts`.
2. Back commits `contracts` and dispatches `popstate`.
3. The child controller consumes the dirty form. Its policy synchronously pushes
   a reconstructed `contract-form` and then a transient prompt.
4. A previously queued traversal commits a destination from the old branch. It
   skips both newly pushed entries and delivers an older child, or `child: null`.
5. The old controller loop interpreted the destination as an instruction to pop
   every layer above it. It therefore dismissed the transient and then consumed
   the reconstructed form during the same `popstate`. The visible form DOM could
   survive even though the browser settled on `child: null`.

The later `popstate` is not reentrant, so `handlingPop` is false and cannot reject
it. It is a valid browser event, but its destination belongs to the history
branch that preceded the reconstruction.

## Why Navigation API cancellation was insufficient

The earlier `traverseInFlight` enhancement assumed every overlapping traverse
could be cancelled and that one `popstate` would be the commit boundary. Real
Chromium can already have selected/queued another traversal, and traverse
cancellation is not a universal guarantee. Resetting the flag did not identify
which destination generation the later event represented. Consequently the
stale `popstate` still reached the child controller.

## Central invariant and repair

A browser traversal may perform **at most one logical same-route child
transition**. A destination that skips multiple current layers is treated as a
stale physical destination, not as permission to consume all those layers.
After processing the current top layer, the controller compares the browser
child state with its actual top and uses the canonical Browser History wrapper
to replace the stale current entry in place when they differ.

This yields the stable-point invariant:

```
history.state.child.id === KarhaChildHistory.top().id
```

when a child layer remains. Replacement does not grow history, add padding, or
trap Back. A later Back is a new transition and can consume the next logical
layer. The rule is form-independent and applies to every same-route child.
