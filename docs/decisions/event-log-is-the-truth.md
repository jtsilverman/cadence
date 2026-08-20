# The event log is the truth and every view is a fold

**Picked:** every state change is one append-only row in `events`. Every view is a pure function of
that log. A write appends the event and rebuilds the view from the whole log in the same transaction.

**Rejected:** mutable tables that writers update in place.

**Reason:** the product's value is a diary that learns how you eat, and a diary you can edit in place
is a diary you cannot trust. Corrections, retractions, and "actually two bowls" all have to survive
as history rather than overwrite it. A fold also means a new view is new read code, not a migration.

**What this constrains:**

- `rebuildPantry` in `lib/pantry.ts` is the only code that computes pantry state. A writer never
  duplicates its merge rules, so the view cannot drift from the log through a partial write.
- `listOrders` in `lib/rails.ts` derives from the log alone. There is no orders table to drift.
- The envelope is frozen at v1:
  `{event_id, household_id, user_id?, type, ts, source, payload, schema_version, precision}`.
  Changing it is a schema-version bump, not an edit.
- Fold order must be deterministic. `newEventId()` prefixes a base-36 timestamp and a
  process-monotonic counter so two events written in the same millisecond still sort in write order.
  A plain random UUID makes a same-millisecond rebuild nondeterministic. Every reader that resolves
  "latest" sorts with `byFoldOrder`: `ts`, then `event_id`.
- Undo never deletes. `LogRetracted` names the event it takes back; `retractedIds` and
  `dropRetracted` let a fold forget it while the event stays in the diary and the trail stays visible.
- `precision` rides on every event, and a merge is only as trustworthy as its least trustworthy
  input: `exact < estimated < guessed`. An aisle checkoff is exact because you picked the item; a
  delivery reconcile is estimated because you confirmed arrival and the counts were assumed.
- `household_id` is on every user-data table from day one.

**Two accepted limits, both written down at the code:**

- Concurrent writers race read-fold-write, and the loser's stale view would overwrite the winner's.
  Writes chain behind an in-process mutex. The server is one process, so double-taps and two open
  tabs serialize.
- Parallel serverless instances can still leave cross-process residue. Accepted for phase 1: the log
  is still correct, and any later write or rebuild heals the view.

**A rule that follows from this:** inference is suggest-only. Only an explicit user action asserts
inventory truth. A `PantryAsserted` event replaces item state absolutely; a `PantryInflow` merges
additively; a `RecipeCooked` merges subtractively. Nothing else moves the pantry.

**What would reopen it:** cross-process write volume that the mutex cannot serialize. That is a
locking change, not a return to mutable tables.
