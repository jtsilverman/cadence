# Spec: user-journey-evals (demand-driven eval methodology + hardening)

Jake's directive (2026-07-27 /loop): rebuild the eval methodology from the USER side. Write evals for how a person would want to use an app like this — not for the code that exists — be wide and demanding, then fix what fails. Fix by failure CLASS (one guard should kill a whole category of bad input, not one scenario); flag failures that are out of scope or would be over-engineering instead of patching them.

## Methodology

1. **Journeys, not units.** Each eval file is one continuous user story against the real API surface (route handlers driven with real `Request` objects, one fresh DB per story). The story asserts what a demanding user would expect at each step, derived from UX.md/PRODUCT.md promises and generic expectations of a food+fitness planner — written WITHOUT reading the implementation first.
2. **Demand tiers.** Each journey mixes: (a) the happy path a user lives daily; (b) the sloppy path (double-taps, stale clients, retries, malformed bodies, weird-but-legal input: emoji titles, 3am logs, empty weeks); (c) the hostile path (prototype-pollution keys, type confusion, oversized payloads, injection-shaped strings).
3. **Triage every failure** into exactly one bucket:
   - **FIX (class)**: real gap → patch at the layer that kills the whole class (parse gate, contract, fold), never a per-route special case. Each fix lands RED-first with the journey as the RED.
   - **FLAG (feature gap)**: the user legitimately wants it, but it's a roadmap phase (C/D/P5-7) → recorded in the report for Jake, journey assertion relaxed to pin current honest behavior.
   - **FLAG (out of scope / over-engineering)**: demanding it would braid the design → recorded with reasoning, not patched.
4. **The report is the deliverable.** `## Eval report` below records every journey, every failure, its bucket, and the fix commit. Jake reads the report, not the diff.

## Journey map (wide)

| # | File | Story |
|---|---|---|
| J1 | journey-plan-week | Plan a full 2-week life (4 lanes), edit it, break it (malformed/hostile bodies), trust it survives |
| J2 | journey-live-and-log | Live a day: log done/skip each lane, double-tap, stale slot ids, spontaneous logs, skip→repair→accept→apply |
| J3 | journey-shop-cook | Plan meals → build list → order → check off → pantry → cook → pantry decrements → list adapts |
| J4 | journey-hostile-input | Every POST route: non-JSON, prototype keys, type confusion, huge/empty/unicode strings — never 500, never partial write |
| J5 | journey-wearable-week | Device data arrives (recovery/sleep/workouts), conflicts with manual logs, redeliveries, schedule reacts |
| J6 | journey-suggestions | The app proposes (replenish/ease/next-target/repair); user accepts/dismisses; windows respected; no nagging |
| J7 | journey-cookbook | Save recipes (URL/photo), re-save, garbage input, browse, cook from cookbook |
| J8 | journey-time-edges | Late-night logs land on the right day; week rollover; Sunday planning; month/DST boundaries |

## Harness

`tests/journeys/harness.ts`: sets `TURSO_DATABASE_URL=":memory:"` before dynamically importing route modules (vitest per-file isolation → one DB per story), wraps handlers in `api.get/post` with real Request objects. No mocks except the LLM/network edges (extraction, Instacart, Whoop) — those journeys drive the deterministic halves and gate live halves behind the existing integration pattern.

## Non-goals

- No UI-level evals (no screens exist; the API is the product surface today).
- No load/perf testing (single household).
- No new product features built silently — feature gaps route to Jake via the report.

## Eval report

### Batch 1 (J1 plan-week, J2 live-and-log, J4 hostile-input) — 27 evals, 5 real failures, all FIXED (class)

- **J1: 9/9 passed unfixed.** Planning held everything demanded: 4 lanes × 2 weeks, emoji/accent/300-char titles round-trip, slot identity across moves, impossible dates refused, no partial writes on rejection, concurrent edits resolve wholesale.
- **F1 FIX(class): `"null"` body 500'd most POST routes.** `request.json()` happily returns null/arrays/scalars; every route then property-accessed it. One shared gate `lib/http.ts readJsonObject` (object-or-4xx, checked WITH the parse) now fronts 12 routes; suggestion + extract were already safe via their parse gates. One helper kills null/array/scalar/non-JSON across the whole surface.
- **F2 FIX(class): one-tap session log 422'd.** `parseLog` demanded `session_kind` with no default — no one-tap client could ever work. Absent now defaults `"loose"` (a bare "did it" is definitionally unstructured; set-logging sends `structured` explicitly).
- **F3 FIX(class): impossible sleep dates stored.** `parseLog` validated dates by regex only (`2026-02-30` passed). Now `isValidDate` (real calendar) — the same gate the schedule already used.
- **F4: downstream of F2** (history missed the workout because the log never landed) — green after F2.
- Harness finding (not app code): routes typed `NextRequest` need `NextRequest` in the driver.
- Pre-verified demands that passed with no fix needed: prototype-key dispatch (history `?kind=constructor` 422s, small body), `__proto__` smuggling inert, injection strings stored verbatim + table intact, 1MB titles survivable, rejected writes leave zero diary trace, double-tap safe.

### Batch 2 (J3 shop-cook, J6 progression, J7 cookbook, J8 time-edges) — 21 evals, 2 real failures, both FIXED (class)

- **J3: 7/7 passed unfixed.** The full food loop held: two planned cooks net of pantry (2×2lb − 0.5 held = 3.5 to buy), checkoff lands exact amounts, cooking decrements and marks one slot per cook, rebuilt list knows coverage, pantry never goes negative, unknown recipe 404s.
- **J8: 4/4 passed unfixed.** 11:30pm ET logs and cooks land on the ET day; Sunday skip gets "absorb it" with no phantom free day; Monday morning clears last week's repair conversation.
- **J6: 4/4 after eval realignment** — targets nest on `plan.exercises[].next`, not a top-level map; legitimate design, eval was guessing. The demands (propose heavier + why + logged pair, no spam on re-read, dismissal, new-evidence reopen) all held.
- **F5 FIX(class): re-saving a recipe stacked duplicate cookbook entries.** `savePlan` now updates in place on (household, kind, same http(s) source_url) — re-shares and edited re-saves are revisions, not copies. Photo intake (constant source_url "photo") still always inserts. Superseded assumption in tests/library.test.ts updated.
- **F6 FIX(class): every extract failure returned HTTP 200.** The SSRF guard itself held (localhost/169.254.* never fetched) but `NextResponse.json(result)` defaulted 200 — a status-checking client would read "host not allowed" as success. Now `{status: result.ok ? 200 : 422}` (photo route already did this).

### Batch 3 (J5 wearable-week, J9 goals-week, J10 pantry-truth) — 20 evals, 0 failures

- **J5: 5/5 unfixed.** Whoop sync (network edge mocked with captured shapes, everything else real): recovery visible, device sleep auto-marks the slot, device run never touches planned intervals, re-sync all-skip, upward score revision lifts the ease flag, history rows say `source: "whoop"`.
- **J9: 4/4 unfixed.** Cadence goal → proposed week honors per_week from MY templates, writes nothing until I POST it.
- **J10: 6/6 unfixed.** Assert/edit/remove pantry truth, expiring window, negative qty and impossible expiry refused.

### Flags for Jake (not patched)

- **FLAG (feature gap, discovered): no mis-tap correction.** A wrong "done" tap is permanent — the diary is append-only and nothing writes a retraction. Real users fat-finger. Fits the design as a typed retraction event (fold ignores retracted log ids), routes to a future spec, not patched here.
- **FLAG (API friction, deliberate): manual recipe entry** via POST /api/recipes requires model-gate fields (confidence flags, source_url) — fine for the extraction flow the API serves today; a manual-entry UI would wrap it. Left alone.
- **Out-of-scope demands deliberately not made:** multi-user auth (P4), push notifications, meal/diet repair (routed to C), load/perf.

### Totals

62 evals across 10 journeys. 7 real failures, all fixed at class level (body gate ×12 routes, gate default, calendar-date gate, upsert-on-source, HTTP status honesty). 41 demands passed with zero code changes.
