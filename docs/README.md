# docs/

The four kinds of doc a session reads to learn cadence's current shape: architecture, conventions,
runbooks, decisions. Six files, because cadence has three decisions worth recording.

| File | Question it answers |
|---|---|
| `architecture/system-map.md` | The one deploy surface, the event log and its folds, the route groups, the production gate |
| `conventions/code-and-tests.md` | Where a test goes, which of the four test layers to write in, how a write reaches the log |
| `runbooks/develop-and-verify.md` | Run the app, run each test layer, seed a fixture household, connect Whoop, deploy |
| `decisions/event-log-is-the-truth.md` | Why every view is a fold and no table is written directly |
| `decisions/compliant-rails-only.md` | Why ordering goes through published APIs and never a browser |
| `decisions/evals-written-blind.md` | Why every eval is authored before reading the code it tests |

`CLAUDE.md` carries the current phase, the doc map, and the lessons. `ux.md` is the canonical
condensed UX. `evals/charter.md` is the canonical testing charter and `evals/report.md` is the live
suite status. `drafts/` holds stale rough drafts kept as receipts; never copy from them.
