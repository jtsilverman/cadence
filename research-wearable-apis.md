# Research: Whoop + Garmin + aggregator APIs (2026-07-26)

Deep-research (Sonnet fan-out, adversarially verified). Feeds the wearable-ingest spec that follows schedule-spine.

# WHOOP + Garmin data access for a solo-dev Next.js app — synthesis (mid-2026)

**Note on inputs:** Only 2 of the 4 requested research reports were actually included in what I received — WHOOP (axis 1) and Garmin (axis 2), both with full verify passes. The aggregator report (axis 3: Terra/Rook/Junction/Spike/"Vora") and the recommendation-shape report (axis 4) were not present in the text handed to me — the JSON was truncated after the Garmin verify block. I'm not going to fabricate pricing/ToS/device-coverage claims for Terra, Rook, Junction, Spike, or "Vora" without a verified source, per the no-invented-facts rule. Flagging this as a real gap, not silently patching it. Everything below on aggregators is explicitly marked unverified.

## 1. WHOOP — solid green light for solo use

- **API version**: v2 is current (GA 2025-07-01); v1 is deprecated, no new features, webhooks removed. Confirmed on independent re-fetch of the changelog and migration guide, verbatim quote reproduced. High confidence. (developer.whoop.com/docs/api-changelog/, /docs/developing/v1-v2-migration/, accessed 2026-07-26)
- **Signup/approval**: fully self-serve for a solo dev. Register at developer.whoop.com, OAuth2 authorization-code flow, dev mode covers up to 10 WHOOP members with **no approval gate at all**. Approval (Terms compliance, 1 tested real member, profile completeness, brand guidelines, Typeform, no published SLA) is only required to scale past 10 users. This was upgraded from "inferred" to "confirmed" in verify via WHOOP community forum posts of devs running fully-built apps inside the 10-user dev cap with zero pre-approval. (developer.whoop.com/docs/developing/app-approval, accessed 2026-07-26)
- **Data**: recovery score, sleep (stages/insights), strain, workouts (incl. Strength Trainer, added 2024-05-01) — all four requested categories present.
- **Webhooks**: exist (recovery/sleep/workout updated+deleted, 6 event types), but **notification-only** — payload has just IDs/type/trace_id, you still make an authenticated GET for the actual data. Retries 5x over ~1hr on delivery failure. Miss this and your integration silently looks "always stale."
- **Rate limits**: 100 req/min, 10,000 req/day per app (not per user) — trivially enough for one user.
- **Cost**: no fee for API access itself (confirmed by independent search + absence across all official docs). Real cost is a WHOOP membership ($199-359/yr), which is also a hard prerequisite for app approval later ("test with at least one WHOOP member") — a nuance the original report underweighted.
- **Refresh tokens rotate on every use** — old one invalidates immediately. A double-refresh race (two processes, or a crash after rotation) permanently locks you out until the user re-does OAuth. Design token storage as single-writer.

## 2. Garmin — no compliant self-serve path exists right now, at any scale

This is the headline finding, and it's well-verified, not weak:

- **Business-only, no hobbyist tier, ever.** Garmin Connect Developer Program FAQ, verbatim: "available for enterprise use... only for business use." Confirmed on independent re-fetch and corroborated by an independent blog. No individual-access mode exists even to pull your own data. (developer.garmin.com/gc-developer-program/program-faq/, accessed 2026-07-26)
- **No self-serve credential at any tier** — every applicant, business or not, goes through partner review; Activity API page routes to "contact us," not a signup form.
- **Second, independent blocker**: Garmin has paused intake of ALL new Developer Program applications since roughly April 2026, with **no published reopen date**, confirmed via a quoted official Garmin support reply on two independent forum threads ("temporarily paused," "unable to provide a specific timeline"). Verify pass could not reproduce the exact verbatim string from the original report but did independently confirm the substance (indefinite pause, no ETA) from two threads — so treat the *fact* as solid, the *exact quote wording* as approximate.
- **Stacked blockers**: forming an LLC does not help right now — the pause blocks everyone regardless of business status. Waiting a few weeks doesn't help either — no ETA exists.
- Data scope when open is good (sleep, HRV via commercial-licensed "Enhanced Beat-to-Beat Interval," activities, stress, pulse-ox), push+pull both supported, no fee to join (some metrics need commercial license) — but none of this is reachable today.
- **Do not fall back to scraping** (e.g. python-garminconnect) — violates Garmin ToS and directly conflicts with cadence's own project rule ("compliant rails only, no browser automation, ever").

## 3. Wearable aggregators — UNVERIFIED, flagged gap

No report was provided for Terra, Rook, Junction (Vital), Spike, or "Vora." I have no verified basis to state pricing, device coverage, signup friction, or ToS fit for any of them, and I won't guess figures for a health-data compliance decision. Two things worth flagging from general awareness, clearly labeled as not verified in this pass and needing their own research before you act on them:
- Aggregators that list "Garmin support" typically hold Garmin's own business-tier partner access underneath and expose it to their customers — meaning your compliant path to Garmin data likely *does* run through one of these, since direct access is closed. This needs its own verification (does the aggregator actually have live Garmin partner status right now, given Garmin's own pause?).
- I cannot confirm or deny that a product named "Vora" exists in this space — do not repeat that name as verified.

**Recommendation: get axis-3 research done (a fresh `deep-research-sonnet` pass or the missing report) before committing to any aggregator for Garmin coverage.** Don't pick one off pricing-page vibes for a health-data product.

## 4. Recommendation shape

Given only 1 and 2 are solid:

- **WHOOP: go direct.** Self-serve, free, full data, works today for solo use. No reason to route it through an aggregator — that just adds a middleman, cost, and a second ToS surface for data you can already get first-party.
- **Garmin: direct is not an option today**, at any scale, regardless of entity type. If you want Garmin data now, an aggregator is the only compliant lever — but which one, at what cost, is unverified pending axis-3 research.
- **Simplest compliant path for one user, now**: build the WHOOP integration direct today (it's fully unblocked). For Garmin, either (a) treat it as blocked and ship WHOOP-only for v1, revisiting Garmin later, or (b) do the aggregator research pass before writing any Garmin-shaped code, since you'd be building against an unverified vendor otherwise.
- Given cadence's own "compliant rails only" project rule, I'd bias toward (a): ship WHOOP now, defer Garmin decision until axis-3 is actually researched, rather than guess-integrating an aggregator whose ToS/pricing you haven't confirmed.

## Where evidence was weak or refuted

- Garmin pause: verify pass could not reproduce the original report's exact quoted sentence word-for-word, though it independently confirmed the same substance from different phrasing in two forum threads. Treat "indefinite pause, no ETA" as solid; treat the specific quoted sentence as approximate.
- WHOOP "no cost" claim: technically true for the API itself, but approval requires a paid WHOOP membership to test against — original report's "free" framing slightly undersold this.
- Aggregator axis (3) and recommendation-synthesis axis (4): not delivered to me at all — full gap, not a weak-evidence situation. Everything in section 3 above is explicitly unverified.

## Decision table

| Option | Evidence summary | Key risk | Recommendation |
|---|---|---|---|
| Direct WHOOP OAuth | Self-serve, free, full data (sleep/recovery/strain/workouts), works today under 10-user dev cap, no approval needed for solo use. High-confidence, independently verified. | Rotating refresh tokens can hard-lock account on a race; webhooks are notify-only (need follow-up GET) | **Do this now.** |
| Direct Garmin OAuth | Business-only program AND all new-application intake paused indefinitely, no ETA, confirmed via official Garmin support reply on two independent threads. | Zero path exists today at any scale or entity type; scraping fallback violates ToS and project rules | **Do not pursue now.** Revisit when Garmin reopens intake (no known date). |
| Aggregator for Garmin only (Terra/Rook/Junction/Spike/other) | No verified report provided — pricing, device coverage, ToS fit all unknown | Could pick a vendor without live Garmin access, or one whose ToS doesn't fit a consumer health app; unverified | **Research before building** — run the missing axis-3 pass first. |
| Aggregator for both WHOOP + Garmin | Same evidence gap as above, plus adds unnecessary indirection for WHOOP where a free direct path already works | Extra cost/ToS surface for data you can already get first-party (WHOOP); Garmin-side risk same as above | **Skip** — no reason to route WHOOP through a middleman once direct works. |
| Direct-both | Same as "Direct Garmin OAuth" — blocked | Same as above | **Not viable until Garmin reopens.** |

## Addendum (2026-07-26): "Vora" identified — askvora.com
Consumer iOS AI health coach (workouts, nutrition scan, recovery, sleep, cycle, meditation, daily planning; $12.99/mo / $89.99/yr; free tier). NOT a developer API. Claims 500+ integrations (Whoop, Garmin, Oura, Fitbit, Apple Health...) — plausible mechanism: iOS-native Apple Health read on-device, which bypasses every partner-API gate. Strategic note: a future cadence native wrapper gets Garmin/Whoop data the same way, no aggregator needed; the aggregator question only gates the WEB-app path. Competitive deltas for cadence: groceries→pantry loop (Vora has none), event-sourced household graph, suggest-only trust ladder.

## Addendum 2 (2026-07-26): aggregator pass (Terra / ROOK / Junction / Spike)

## Wearable Aggregator APIs for Garmin (+WHOOP), mid-2026 — Synthesis

**Context check confirmed by both reports:** Garmin's direct developer program (developer.garmin.com) is paused for new business applicants, no reopening date. This does NOT block the four aggregators below — they hold pre-existing Garmin partnerships that route around the pause. Corroborated by two independent third-party sources (aifitnessapi.com, themomentum.ai), not a Garmin primary-source statement — medium confidence on that specific mechanism. [aifitnessapi.com/fix/garmin-api-approval; themomentum.ai/blog/garmin-developer-program-closed-roadmap — accessed 2026-07-26]

Note on inputs: I received two complete research passes (Garmin/WHOOP live-status verification, and pricing/signup-friction) plus a third report that was cut off mid-transmission before its findings loaded. Axis (4) — ToS suitability for consumer apps, data redistribution and health-data handling — was not covered in the material that reached me. Flagging that as an open gap rather than guessing; treat that column as unverified below.

### (1) Live Garmin partner access — verified against docs, not marketing

All four currently show live Garmin integration pages with no waitlist/paused language:

- **Terra**: dedicated Garmin page, "Supported Integrations" list, "no Garmin Developer Program approval required." [tryterra.co/integrations/garmin — accessed 2026-07-26]
- **ROOK**: live Garmin Web API integration (body, activity, sleep) via webhooks, blog-announced. [tryrook.io/wearable-api-sdk/integrations/garmin — accessed 2026-07-26]
- **Junction/Vital**: listed as supported provider in docs.junction.com.
- **Spike**: direct Garmin Connect integration (raw + normalized). [spikeapi.com/integrations/garmin — accessed 2026-07-26]

Caveat that survived the verify pass: **all four claims rest on vendor docs/marketing, not a live authenticated API pull.** No report actually completed an OAuth handshake through any vendor. This is the single biggest evidence gap — treat "live" as medium confidence across the board, not confirmed operational fact.

### (2) Indie/hobby pricing at 1 user — verified, this is where the reports sharpened the picture

| Vendor | Entry tier | Cost | Free tier |
|---|---|---|---|
| Terra | Quick Start | $499/mo ($399/mo annual) | **No** — and Terra's own Garmin page contradicts its pricing page, claiming "free tier includes Garmin" while pricing page shows none. Verifier reproduced this contradiction verbatim on both pages — high confidence this is a real vendor inconsistency, not a research error. [tryterra.co/pricing; tryterra.co/integrations/garmin — accessed 2026-07-26] |
| ROOK | Core | $399/mo (covers up to 750 users, so 1-user cost is still $399) | No |
| Spike | "Sandbox" | $450/mo (itself a paid tier, bundled with a dedicated implementation engineer — high-touch, not self-serve pricing) | No |
| Junction (fka Vital) | Launch | $0.50/user/mo, **$300/mo minimum** | Sandbox is free for build/test (up to 50 users, synthetic + real device connections), but "Start for free" wording on the paid pricing page is ambiguous — could mean a trial period before the $300 minimum bites, not a permanent free lane. Verifier could not resolve this from docs alone. |

**None of the four have a true indefinite free production tier at 1 user.** Junction has the lowest floor ($300/mo) and the only genuinely free non-production sandbox.

### (3) Signup friction

- **Terra**: self-serve dashboard signup, no free trial, 30-day money-back guarantee instead.
- **ROOK**: self-serve "Start now" portal alongside an optional demo-request path — least sales-gated of the paid options.
- **Junction**: self-serve, no credit card required, signup form asks expected volume but no explicit business/KYC field found.
- **Spike**: pricing page built around "Book a demo" CTAs, no self-serve credit-card checkout path found — most sales-gated of the four (inferred from page structure via automated fetch, not a live signup attempt).

No vendor showed a hard business/KYC gate (registered company, tax ID) in the docs reviewed — but this was checked only at the page-text level, not by actually attempting signup as an individual.

### (4) ToS suitability for consumer apps (data redistribution, health data handling)

**Not verified** — the report meant to cover this didn't reach me intact. Do not treat any of the four as pre-cleared for consumer-app data redistribution or health-data compliance (e.g., HIPAA-adjacent handling, GDPR health-data special category) based on this research. This needs its own pass — pull each vendor's DPA/ToS directly (Terra, ROOK, Junction, Spike all publish one) before committing, especially since a solo-dev consumer app redistributing Garmin/WHOOP data to end users is a different risk profile than an internal B2B analytics use case these vendors are mostly priced for.

### (5) WHOOP coverage — mixed, not uniform as first claimed

Initial finding claimed all four bundle WHOOP at "comparable granularity" to Garmin. The verify pass **partially refuted this**: Junction's WHOOP integration is BYOO (Bring Your Own OAuth) — the developer must register their own OAuth app directly with WHOOP, not a turnkey managed connection like its Garmin integration. That's meaningfully higher friction than the claim implied. Spike's WHOOP data depth (strain, recovery %, sleep stages, RHR, HRV) was independently confirmed as rich and directly integrated, but its supporting blog post is dated April 2023 — over 3 years stale relative to "mid-2026," so treat as "was true at launch," not confirmed current. Terra's and ROOK's WHOOP pages were not independently re-fetched during the verify pass — their WHOOP granularity claims stand at the original medium confidence only, not four-way confirmed.

### "Vora" verification

**No developer-facing wearable-API product named Vora, Vorra, or Voraa exists.** Both reports independently converged on this: "Vora" is a consumer-facing AI health/fitness/longevity coaching app (askvora.com, vora.health, Google Play listing) that itself presumably sits on top of an aggregator, but no docs.vora.* or developer portal surfaced anywhere across multiple targeted searches. High confidence — this is negative evidence from an absence search, which is inherently weaker than a positive confirmation, but two independent passes found the same thing with no contradicting signal.

### One-line pick

**Cheapest compliant Garmin path at 1-user scale: Junction (tryvital.io / docs.junction.com)** — self-serve, no card, free sandbox to build against, and the lowest production floor at $300/mo (vs. Terra $499, ROOK $399, Spike $450) — but confirm the sandbox-vs-$300-minimum boundary and pull its actual ToS/DPA before writing any code against it.

---

| Option | Evidence summary | Key risk | Recommendation |
|---|---|---|---|
| Terra | Live Garmin access, self-serve signup, $499/mo floor (no free tier) | Vendor's own pages contradict each other on free-tier existence — trust the pricing page, not the Garmin marketing page | Use only if $499/mo floor is acceptable; don't trust the "free" claim |
| ROOK | Live Garmin access, $399/mo floor for up to 750 users, self-serve portal | Least-verified WHOOP granularity of the four (not re-checked in verify pass) | Reasonable mid-tier option; confirm WHOOP data depth directly before relying on it |
| Junction (fka Vital) | Lowest floor ($300/mo), free sandbox, self-serve, no card | WHOOP requires BYOO (extra dev friction, not turnkey); "start for free" ambiguity unresolved; ToS/consumer-redistribution terms unverified | **Best default pick** — verify sandbox real-account behavior and pull ToS before committing spend |
| Spike | Live Garmin access, richest confirmed WHOOP data — but that confirmation is from a 2023 post | Most sales-gated signup ($450/mo tier bundles a "dedicated implementation engineer," no visible self-serve checkout) | Skip unless white-glove onboarding is actually wanted; priciest entry with least self-serve friction reduction |
| "Vora" | Confirmed to not exist as a wearable-API product; is a consumer app, not a competitor | N/A — this is a negative-existence finding, not an option | Not a viable path; ignore for build decisions |

**Bottom line for Jake:** every number above is vendor-doc-sourced, not a live API probe — before spending money, do the actual Junction sandbox signup yourself (it's free) and confirm real-Garmin-account connection works before assuming any of this holds. The ToS/data-redistribution axis is a genuine blind spot in this research pass and needs a follow-up before shipping a consumer app on any of these.

## Verdict (session synthesis, 2026-07-26)
Aggregator prices are B2B-shaped: Terra $499/mo, Spike $450/mo, ROOK $399/mo — absurd at 1-user scale. Junction (ex-Vital) is the only sane door: free Sandbox up to 50 users (real device connections supported), $0.50/user + $300/mo minimum only in production. Recommended path: (1) Whoop DIRECT now — self-serve, free, unblocked; (2) Garmin: try Junction Sandbox for personal use (verify its ToS allows sustained personal real-device use), else defer Garmin to the native-wrapper phase — Garmin Connect syncs to Apple Health, and an iOS wrapper reads it on-device free of every partner gate (the Vora mechanism); (3) never scraping. ToS-suitability column for aggregators remains unverified (flagged gap) — re-check before any production aggregator commitment.
