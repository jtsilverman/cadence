# Cadence Design System - Blueprint v1

Status: rough draft v1, 2026-07-30. Awaiting Jake's red pen. Nothing is built from this yet.

---

## How to use this file

**This file is the law.** An AI coding agent building any Cadence surface (marketing site, app UI, emails) follows it literally.

**Authority order** - when two sources disagree, the higher one wins:

1. **This file** (`drafts/design.md`) - the synthesized Cadence rules.
2. **`design-refs/handoff/tokens.css`** - Section 1's custom properties, emitted verbatim. If tokens.css and Section 1 diverge, Section 1 is correct and tokens.css is stale; regenerate it.
3. **`design-refs/extraction/*.md`** - the six measurement docs (tokens, typography, layout, components, motion, art-direction). These are *evidence*, not law. They describe Equinox / Eight Sleep / Arc'teryx. Where this file departs from them, the departure is deliberate and is recorded in Section 8.
4. **`design-refs/{equinox,eightsleep,arcteryx}/*.jpg|mp4`** - the anchor frames. Consult when a rule here is ambiguous. Never copy a source behavior this file does not name.

**Violations are bugs.** A rounded corner, a drop shadow, a second typeface, or a hover transform is a defect to be filed and fixed, not a style preference to be debated. Section 7 is the checklist.

**Reading the numbers.** Every number carries a citation. Two kinds:

- **MEASURED** - pixel-sampled from a corpus frame at 2x DPR (CSS px = raw px ÷ 2). Cited as `` `equinox-128-membership-plans-grid.jpg` ``. Do not "clean up" these values. If a measurement is 17px, it is 17px; where Cadence snaps it to a grid step, the snap is stated explicitly.
- **DERIVED** - computed or chosen by this file (an 8px-grid snap, a WCAG-driven pick, an interpolated scale step). Always labeled `DERIVED` or `(derived)`.

**Source roles, un-blended.** Equinox is the structural and tonal spine - grid, section rhythm, nav, the black/white editorial attitude. Eight Sleep contributes *feature patterns only* (hotspot tour, stat tiles, metric readouts, app-UI showcase framing), every one of them restyled to radius-0 and forest green. Arc'teryx contributes logo treatment and technical-minimal vibe only. Do not average them.

---

## 1. Design tokens

### 1.1 Reference: what the sources actually measure

Sampled with `ffmpeg -vf "crop=8:8:<x>:<y>,scale=1:1" -f rawvideo -pix_fmt rgb24` on flat UI chrome only - never on photography.

| Source | Scale character | Key values |
|---|---|---|
| Equinox | Pure binary + one grey step. No mid-tone surface exists anywhere. | `#000000` nav/page/card bg (`equinox-001-hero-cookie-banner.jpg` @1142,101; `equinox-128-membership-plans-grid.jpg` @252,806; `equinox-125-club-copy-block.jpg` @2350,672) · `#ffffff` inverse sections + buttons (`equinox-048-book-visit-form.jpg` @2854,1259) · secondary text grey `#9c9c9c`–`#a8a8a8` (`equinox-125` @1420,1165; `equinox-128` @180,555) · tag-pill grey `#4c4c4c` (`equinox-128` @2290,294) · hairline `#222222`–`#232323` on black (`equinox-128` @878,700), `#d5d5d5` on white (`equinox-048` @1850,700) |
| Eight Sleep | Warmer, layered, two blacks + a second dark *hue*. | `#000000` footer (`eightsleep-272-footer-full.jpg` @840,1008) · `#111111` content sections (`eightsleep-064-stat-cards-science.jpg` @168,1008) · navy `#262e40`–`#2b3141` (`eightsleep-064` @1511,151) - a genuinely blue-shifted second dark, **not adopted** · off-white `#f8f7f3` on three independent files (`eightsleep-136-component-grid.jpg` @101,1427; `eightsleep-001-trust-badges.jpg` @786,756) · `#f0f0f0` footer product cards (`eightsleep-272` @672,252) |
| Arc'teryx | Closest to a true neutral greyscale. | text `#181818`–`#1b1b1b` (`arcteryx-055-product-grid-prices.jpg` @680,825; `arcteryx-065-footer-logo-nav-links.jpg` @200,935) · secondary text `#454545`–`#575757` (`arcteryx-055` @700,880; `arcteryx-065` @160,1025) · hairline `#d0d0d0` (`arcteryx-065` @1679,694) · bg `#ffffff` (`arcteryx-055` @660,825) · one mid-dark `#2c2c2c` cookie overlay (`arcteryx-065` @1600,1490) |

**Zero green pixels exist in the corpus.** Confirmed across 20+ crops of all three sites. The forest green is a deliberate Cadence departure, tuned against the measured neutrals above.

### 1.2 Color tokens

```css
/* core neutrals - every value grounded in a corpus measurement */
--color-black:      #000000;  /* MEASURED: equinox-001 nav, eightsleep-272 footer */
--color-ink:        #1a1a1a;  /* DERIVED from arcteryx-055 #1b1b1b / arcteryx-065 #181818 / eightsleep-064 #111111 */
--color-grey-700:   #545454;  /* MEASURED: arcteryx-055 price text (range #454545–#575757) */
--color-grey-500:   #9c9c9c;  /* MEASURED: equinox-128 card description grey */
--color-grey-400:   #8f8f8f;  /* DERIVED: darkest grey that still clears WCAG 3:1 non-text on off-white (3.02:1) */
--color-grey-300:   #d5d5d5;  /* MEASURED: equinox-048 input hairline (arcteryx-065 measures #d0d0d0) */
--color-off-white:  #f8f7f3;  /* MEASURED: eightsleep-136 / eightsleep-001, identical on 3 independent files */
--color-white:      #ffffff;  /* MEASURED: universal, all three sources */
--color-accent:     #3A5A40;  /* NO CORPUS PRECEDENT - Cadence departure. Jake's pick, see 1.3 + 8.3 */
```

Deliberately **not** adopted: Eight Sleep's navy `#262e40` (a second dark hue competing with black), Eight Sleep's `#f0f0f0` (a second off-white - one off-white only), Equinox's `#4c4c4c` tag-pill grey (superseded by grey-700).

### 1.3 The accent green - candidates, contrast math, recommendation

All ratios computed from the WCAG relative-luminance formula against the measured surfaces in 1.1, not eyeballed.

| Candidate | vs `#000000` | vs `#f8f7f3` | vs `#ffffff` | White text on it |
|---|---|---|---|---|
| **`#3A5A40`** (recommended) | 2.72:1 | 7.21:1 | 7.73:1 | 7.73:1 |
| `#33503A` (darker, more matte) | 2.35:1 | 8.34:1 | 8.94:1 | 8.94:1 |
| `#3F6248` (lighter, warmer) | 3.05:1 | 6.42:1 | 6.88:1 | 6.88:1 |

**Recommendation: `#3A5A40`.** It clears AA-normal (4.5:1) on both light surfaces with ~1.6x margin and clears AA-large (3:1) on black at 2.72:1 only marginally - so treat accent-on-black as border/icon use, never small body copy. `#33503A` is the safer pick if accent-colored small body text on light surfaces becomes common. `#3F6248` is the weakest of the three and buys nothing.

**Marked as Jake's pick. Section 8.3 is the decision.**

Hard rule regardless of which is chosen: **no accent green text under 24px on a black surface.** All three candidates fail AA-normal there (2.35–3.05:1).

### 1.4 Semantic role assignments

```css
--surface-bg:            var(--color-off-white);  /* default page canvas */
--surface-raised:        var(--color-white);      /* cards, panels, reveal-panel active state */
--surface-inverse:       var(--color-black);      /* nav bar, footer newsletter band, marketing hero sections */
--surface-inverse-alt:   var(--color-ink);        /* a second dark band when two dark sections abut */

--text-primary:            var(--color-ink);
--text-secondary:          var(--color-grey-700);
--text-primary-inverse:    var(--color-white);
--text-secondary-inverse:  var(--color-grey-500);
--text-accent:             var(--color-accent);   /* light surfaces only, see 1.3 */

--border:          var(--color-grey-300);  /* decorative rules, dividers, section separators */
--border-strong:   var(--color-grey-400);  /* interactive-control outlines: inputs, outlined buttons */
--border-inverse:  #232323;                /* MEASURED: equinox-128 card hairline on black */
--border-selected: var(--color-accent);

--accent:          var(--color-accent);
--accent-text-on:  var(--color-white);
```

Why two border tokens: `--color-grey-300` (`#d5d5d5`) measures **1.37:1 against off-white** and **1.47:1 against white** - it fails WCAG's 3:1 non-text minimum. Equinox ships this gap (`equinox-048-book-visit-form.jpg`); Cadence does not inherit it. Decorative rules may use `--border`; anything a user must perceive as an interactive boundary uses `--border-strong`.

### 1.5 WCAG contrast - every text-on-surface pair

| Pair | Ratio | AA normal (4.5:1) | AA large (3:1) |
|---|---|---|---|
| `--text-primary` `#1a1a1a` on `--surface-bg` `#f8f7f3` | 16.24:1 | pass | pass |
| `--text-primary` `#1a1a1a` on `--surface-raised` `#ffffff` | 17.40:1 | pass | pass |
| `--text-secondary` `#545454` on `#f8f7f3` | 7.06:1 | pass | pass |
| `--text-secondary` `#545454` on `#ffffff` | 7.57:1 | pass | pass |
| `--text-primary-inverse` `#ffffff` on `#000000` | 21.0:1 | pass | pass |
| `--text-secondary-inverse` `#9c9c9c` on `#000000` | 7.65:1 | pass | pass |
| `--text-accent` `#3A5A40` on `#f8f7f3` | 7.21:1 | pass | pass |
| `--text-accent` `#3A5A40` on `#ffffff` | 7.73:1 | pass | pass |
| `--accent-text-on` `#ffffff` on `--accent` `#3A5A40` | 7.73:1 | pass | pass |
| accent `#3A5A40` on `#000000` | 2.72:1 | **fail** | **fail** (2.72 < 3.0) |
| `--border-strong` `#8f8f8f` on `#f8f7f3` (non-text 3:1) | 3.02:1 | n/a | pass |
| `--border` `#d5d5d5` on `#f8f7f3` (non-text 3:1) | 1.37:1 | n/a | **fail - decorative use only** |

Source gaps Cadence explicitly does **not** inherit: Equinox's placeholder grey `#a8a8a8` on white measures 2.38:1 (`equinox-048-book-visit-form.jpg`) - Cadence placeholders use `--color-grey-700` at 7.06:1.

### 1.6 Spacing scale - 8px base unit

Base unit **8px**, derived from two independent gutter measurements that bracket it:

- Equinox membership-grid card gutter: raw x=878 → x=912 = 34 raw px = **17px CSS** (`equinox-128-membership-plans-grid.jpg` @y=700).
- Eight Sleep trust-badge card gutter: raw x≈1202 → x≈1267 = 65 raw px = **32.5px CSS** (`eightsleep-001-trust-badges.jpg` @y=900) - almost exactly double.

Cadence snaps 17 → 16 and 32.5 → 32 **(derived)**. The two most load-bearing steps are 16 and 32.

```css
--space-4:   4px;   /* DERIVED: half-step, sub-label gaps only */
--space-8:   8px;   /* MEASURED: nav CTA pair gap ≈8px (equinox-001); FAB stack gap (equinox, every frame) */
--space-16:  16px;  /* MEASURED 17px → snapped: equinox-128 grid gutter; equinox-048 field gap 16–24px */
--space-24:  24px;  /* MEASURED: FAB viewport margin ≈24px (equinox, every frame); tab-block padding ≈24px (equinox-094) */
--space-32:  32px;  /* MEASURED 32.5px → snapped: eightsleep-001 card gutter; eightsleep-001 card padding ≈32px */
--space-40:  40px;  /* MEASURED: equinox-128 plan-column padding; equinox-108 accordion panel padding (32–40) */
--space-48:  48px;  /* DERIVED: scale fill */
--space-56:  56px;  /* MEASURED: equinox-048 form section top padding ≈54–56px; equinox-018 card left padding 57px */
--space-64:  64px;  /* MEASURED: equinox-001 container side margin 64/64.5px; equinox-018 card bottom padding 64px */
--space-80:  80px;  /* MEASURED: equinox-001 nav bar height (y=4.5→84.5) */
--space-96:  96px;  /* DERIVED: container edge + editorial inset, see 3.2 */
--space-120: 120px; /* DERIVED: max section padding for a marketing breathing moment - NOT corpus-supported, see 8.1 #9 */
```

### 1.7 Radius - zero, confirmed

```css
--radius: 0;  /* the only radius token. There is no radius scale. */
```

Confirmed by pixel scan, not assumption:

- **Equinox: 0.** Card corners scanned row-by-row and column-by-column at raw (100,200)–(200,300) - a hard 90° corner, no curve at any sampled row (`equinox-128-membership-plans-grid.jpg`).
- **Arc'teryx: 0.** Product tiles butt with a sharp vertical seam at raw x=610 (`arcteryx-055-product-grid-prices.jpg`); no rounding on nav, footer, or cards anywhere in 15 frames.
- **Eight Sleep: 8–10px CSS**, measured on the trust-badge card - flat top edge raw y=627, flat left edge raw x=373, curve resolving within ~15–20 raw px of both tangent points (`eightsleep-001-trust-badges.jpg`). **Stripped to 0 for Cadence.** Every Eight Sleep pattern adopted below is flattened.

Equinox's own three rounded outliers are also stripped, not inherited: the "Most Popular" pill badge (`equinox-128`), the List/Map segmented toggle (`equinox-069`), and the floating FAB chips (every equinox frame). Arc'teryx's one rounded outlier - the "SIGN ME UP" footer button (`arcteryx-065`) - likewise.

### 1.8 Shadow - none

```css
--shadow: none;  /* the only shadow token. There is no elevation scale. */
```

Not one drop shadow appears in 57 sampled frames across all three brands. Verified against the hardest case: Eight Sleep's off-white card-to-page transition scanned at raw x=500, y=1050–1080 steps directly `#f8f7f3` → `#ffffff` with **no intermediate darkening band** (`eightsleep-001-trust-badges.jpg`). Separation is fill-color + border only, even on a rounded card. Equinox and Arc'teryx show zero shadows in any crop.

### 1.9 Borders

```css
--border-width:          1px;  /* MEASURED: equinox-128 card hairline (1–2px raw at 2x); arcteryx-065 footer rule */
--border-width-selected: 2px;  /* MEASURED: eightsleep-264 selected size box (~2px accent border) */
```

Only two widths exist. Nothing heavier appears anywhere in the corpus.

### 1.10 Scrims and opacity

Measured by comparing an unscrimmed photo region against the same x-column inside a scrimmed region, in the one composition where Equinox runs three legibility mechanisms side by side (`equinox-038-amenities-lounge.jpg`):

| Treatment | Measured | Token |
|---|---|---|
| Grey frosted scrim (left card): unscrimmed RGB(35,25,31) → scrimmed RGB(90,82,89) | ~58% grey `(128,128,128)` | `--scrim-grey: rgba(128,128,128,0.58)` |
| No overlay (middle): RGB(20,13,21) → RGB(32,28,36) | ~0%, delta too small to be intentional | photo-selection, no token |
| Near-opaque white card (right): RGB(22,11,20) → RGB(210,207,210) | ~81% white | `--scrim-white: rgba(255,255,255,0.81)` |

```css
--scrim-grey:  rgba(128, 128, 128, 0.58);  /* MEASURED: equinox-038 left card */
--scrim-white: rgba(255, 255, 255, 0.81);  /* MEASURED: equinox-038 right card */
--scrim-modal: rgba(0, 0, 0, 0.60);        /* MEASURED ~60%: eightsleep-015 hotspot backdrop; arcteryx-093 menu scrim */
--dim-inactive: 0.70;                       /* MEASURED: equinox-240 "Find a Spa" hover dim ~70% */
```

### 1.11 Z-layers

Each level traces to an observed stacking behavior, not a convention.

```css
--z-base:        0;    /* page content */
--z-sticky:      20;   /* sticky product/context bar under the nav - eightsleep-120..272 */
--z-nav-scrim:   90;   /* full-page dim that leaves the nav LIT - arcteryx-093-discover-dropdown-menu-logo.jpg */
--z-nav-panel:   95;   /* menu panel: above the scrim, below/flush with the nav */
--z-nav:         100;  /* fixed nav bar - equinox-001, present in all 83 equinox frames */
--z-fab:         150;  /* persistent coach-chat launcher, bottom-right - equinox, every frame */
--z-modal-scrim: 200;  /* dim that covers the nav TOO - eightsleep-015 hotspot panel dims nav + content */
--z-modal:       210;  /* hotspot detail panel, dialogs */
--z-banner:      300;  /* cookie/consent, toasts - equinox-001 cookie banner sits over everything */
```

The two scrim levels are not redundant: Arc'teryx's menu scrim leaves the nav fully lit (`arcteryx-093`), Eight Sleep's hotspot scrim dims the nav as well (`eightsleep-015-hotspot-cover-panel.jpg`). Both behaviors are wanted; they need separate z-levels.

---

## 2. Typography

### 2.1 Family - Inter, single family, no exceptions

**`Inter`** (Google Fonts, variable, self-hosted). Weights loaded: **400, 500, 600, 700 only.**

Grounds: Equinox's letterforms - single-story **g**, double-story **a**, curved **t** foot, round dotted **i**, humanist grotesk proportions - match Inter's signature (`equinox-018-luxury-fitness-meet.jpg`, words "regenerative"/"designed"). Arc'teryx's workhorse sans sits in the same bucket (`arcteryx-055-product-grid-prices.jpg`). Inter is the closest free match to 2 of 3 corpus faces and is purpose-built for small-size UI legibility, which matters more for a daily-use app than for the marketing sites sampled.

Deliberately rejected:

- **Eight Sleep's face** (closest free match: Sora - rounder counters, squared terminals, `eightsleep-006-value-prop-headline.jpg`). Eight Sleep contributes patterns, not type.
- **Arc'teryx's two-family split** - a flared display serif (closest: Fraunces) for campaign headlines and the wordmark only, sans everywhere else (`arcteryx-001-logo-nav-hero.jpg` vs `arcteryx-065-footer-logo-nav-links.jpg`). Equinox runs one grotesk across all 41 sampled frames with zero exceptions; Equinox is primary, so Cadence runs one family.
- **Equinox's own serif exception** - The Spa sub-brand wordmark (`equinox-207-spa-hero.jpg` through `equinox-246`). One sub-brand, not a system rule.

Fallback stack: `Inter, system-ui, -apple-system, "Segoe UI", sans-serif`. Fallback if a more geometric feel is ever wanted: **Archivo** - a family swap, never a second family.

### 2.2 Type scale

`font-size / line-height / letter-spacing / weight / case`. Line-heights given as both ratio and computed px.

| Level | Size | Line-height | Tracking | Weight | Case | Basis |
|---|---|---|---|---|---|---|
| **Display** | 64px | 1.05 (67px) | -0.03em | 700 | ALL CAPS | MEASURED: Equinox H1 raw cap-height 94px → 47 CSS → ~64px, "REST OF SUMMER ON US" (`equinox-001-hero-cookie-banner.jpg`). Marketing hero only. 56px below 900px viewport (derived) |
| **Stat** | 68px | 1.0 (68px) | -0.02em | 500 | lining figures | MEASURED: "600M" raw 94px and "50+" raw 93px, independently cross-validated (`eightsleep-072-stat-cards-600m-clinical.jpg`). Intentionally larger than Display - in the corpus the stat *is* the biggest type on its page |
| **H1** | 40px | 1.2 (48px) | -0.02em | 700 | Sentence case | DERIVED: in-app screen titles, scaled down from the 54–68px marketing hero range |
| **H2** | 32px | 1.2 (38px) | -0.01em | 700 | Sentence case | MEASURED: Equinox H2 raw 46px asc → 23 CSS → ~32px (`equinox-018-luxury-fitness-meet.jpg`); Arc'teryx hero raw 45px → ~32px (`arcteryx-001-logo-nav-hero.jpg`) |
| **H3** | 28px | 1.25 (35px) | 0 | 600 | Sentence case | MEASURED: Arc'teryx category header raw 43px → ~31px (`arcteryx-048-summer-hike-category-header.jpg`); Eight Sleep H2 raw 39px → ~28px (`eightsleep-006-value-prop-headline.jpg`) |
| **H4** | 24px | 1.3 (31px) | 0 | 600 | Sentence case | DERIVED: modular-scale fill, no direct corpus row |
| **H5** | 20px | 1.3 (26px) | 0 | 600 | Sentence case | MEASURED: Eight Sleep button raw ~28px → ~20px (`eightsleep-116-pod5-product-hero.jpg`) |
| **H6** | 18px | 1.35 (24px) | 0 | 600 | Sentence case | MEASURED: Arc'teryx product name raw 25px → ~18px (`arcteryx-055-product-grid-prices.jpg`); Equinox card title raw 35px → ~25px (`equinox-128-membership-plans-grid.jpg`) |
| **Body** | 16px | 1.5 (24px) | 0 | 400 | Sentence case | MEASURED 18–19px on both marketing sources (`equinox-018`, `eightsleep-006`) → brought DOWN to 16px, the in-app accessible standard; corpus reads were marketing copy set large |
| **Body-large** | 18px | 1.5 (27px) | 0 | 400 | Sentence case | MEASURED: the 18–19px corpus value, retained for marketing-page body copy |
| **Caption** | 13px | 1.4 (18px) | 0 | 400 | Sentence case, `--text-secondary` | MEASURED: Equinox footer link raw 27px → ~19px (`equinox-051-footer-links.jpg`), Arc'teryx price raw 25px → ~18px (`arcteryx-055`), scaled one step down for a true meta size |
| **Eyebrow** | 12px | 1.3 (16px) | **+0.08em** | 600 | **ALL CAPS** | MEASURED: Equinox "AMENITIES" raw 16px → 8 CSS → ~11–12px (`equinox-128-membership-plans-grid.jpg`); Eight Sleep nav label raw 19px → ~14px (`eightsleep-116`) |
| **Nav** | 15px | 1.3 (20px) | 0 | 500 | Sentence case | MEASURED: Equinox nav "Clubs" raw 25px → 12.5 CSS → ~18px (`equinox-001`), scaled down for denser in-app nav |
| **Button** | 14px | 1.2 (17px) | **+0.08em** | 700 | **ALL CAPS** | MEASURED: Equinox card CTA "JOIN TODAY"/"VIEW CLUBS IN THIS PLAN", uppercase + tracked, repeated in every plan card (`equinox-128`). See 2.3 |

### 2.3 Case rules - one convention

**Tracked ALL CAPS at +0.08em is the system-label case. It applies to exactly two things: Eyebrow labels and Button labels. Nothing else.**

- **Eyebrows / overlines / section-category labels - ALL CAPS + 0.08em tracking, required, not optional.** This is the one device all three sources converge on independently: Equinox "AMENITIES", "VIEW CLUBS IN THIS PLAN", step labels "01 / 02", pillar numerals "01 Science-Backed"–"06 Full Health Optimization" (`equinox-128`, `equinox-048-book-visit-form.jpg`, `equinox-175-eqx-os-pillars.jpg`); Arc'teryx footer column headers "HELP / MY ACCOUNT / SHOP MORE / ABOUT US" (`arcteryx-065`); Eight Sleep "SCIENTIFIC ADVISORY BOARD", "SLEEP METRICS", "HOW IT WORKS" (`eightsleep-104-backed-by-experts.jpg`, `eightsleep-208-sleep-metrics-dashboard.jpg`).
- **Buttons - ALL CAPS + 0.08em tracking, all variants, all contexts.** Per Equinox's repeated plan-card CTAs (`equinox-128`).
- **Display headlines - ALL CAPS**, tight tracking (-0.03em), marketing hero only (`equinox-001` "REST OF SUMMER ON US"; `arcteryx-001` "SUMMER GEAR IS HERE").
- **Everything else - Sentence case.** H1–H6, body, caption, nav links, form labels, table headers. No Title Case anywhere in the system.

**The conflict this resolves:** Equinox itself runs two button conventions on the same site - Title Case in persistent chrome ("Join Today" nav button, `equinox-001`) and tracked ALL CAPS inside repeated card components ("JOIN TODAY", `equinox-128`). Cadence picks the card convention and applies it everywhere. **The alternative is live** - see 8.3 #2 for the Title-Case-buttons variant and what it costs.

**Nav links stay Sentence case**, following Equinox (`equinox-001`) and deliberately dropping the ALL-CAPS-tracked nav used by Arc'teryx (`arcteryx-001`) and Eight Sleep (`eightsleep-116`). Reason: three all-caps surfaces (eyebrow, button, nav) starts to read as shouting; two is the discipline.

### 2.4 Weight rules

Four weights loaded, and the corpus supports no more: **400 regular** (body, caption, price/meta), **500 medium** (nav, stat numerals), **600 semibold** (H3–H6, eyebrow), **700 bold** (Display, H1, H2, button). No light, no black, no italics anywhere in the corpus - none in Cadence.

---

## 3. Layout and structure

### 3.1 Viewport reference

The entire corpus is a **1679 CSS px desktop viewport** (3358px frames at 2x DPR). There are no tablet or mobile frames. Every measurement below is a desktop measurement; responsive behavior below 1679px is derived, and the absence of mobile evidence is a real corpus gap (8.2).

### 3.2 Container - ONE container, collapsed from Equinox's two

Equinox runs two unreconciled container systems:

- **WIDE** - 64px left margin (logo "E" left edge x=63.5, `equinox-001-hero-cookie-banner.jpg`), 64.5px right margin (CTA right edge x=1614.5, same file; membership-grid right edge x=1614.5 in `equinox-128`), content width 1551px. Used by nav + multi-column grids.
- **NARROW** - ≈243.5–244px left inset, confirmed independently on five frames: hero card left edge x=243.5 (`equinox-018-luxury-fitness-meet.jpg`, `equinox-011-everything-equinox-offer.jpg`), plain hero text x=243.5 (`equinox-001`), clubs search bar x=243.5 (`equinox-056-clubs-directory-search.jpg`), footer link column x≈244.5 (`equinox-051-footer-links.jpg`). Not a fixed-width box - components extend right to their own natural width, though the clubs search bar and carousel section both terminate at ≈1430.5px, implying an inner ≈1187px column that some components snap to.

This is a historical accident, not a system. **Cadence collapses it into one.**

```css
--container-max:     1552px;  /* MEASURED 1551px content width (equinox-001) → +1 for an even value */
--container-gutter:  64px;    /* MEASURED: equinox-001 left margin 63.5px / right 64.5px */
--inset-editorial:   32px;    /* DERIVED: the single documented extra inset for text blocks */
```

**The rule:** one container - `max-width: 1552px`, centered, `padding-inline: 64px`. Full-bleed sections break out of it. Text blocks and floating cards inside full-bleed sections sit at container-edge + `--inset-editorial` = **96px from the viewport edge**. There is no second container and no second guideline.

This departs from Equinox's measured 243.5px card inset by design; the departure is recorded in 8.1 #14.

### 3.3 Grid

```css
--grid-columns: 12;
--grid-gutter:  16px;  /* MEASURED 17px (equinox-128 @y=700) → snapped to the 8px unit */
```

Membership grid measured: 4 equal columns × 375px CSS, gutter ≈17px, column edges at x = 63.5 / 438.5 / 455.5 / 830.5 / 847.5 / 1222.5 / 1239.5 / 1614.5 (`equinox-128-membership-plans-grid.jpg` @y=400).

**Zero-gutter grids are permitted only for dense photographic tiles.** Arc'teryx's 3-column product grid runs ~0 gutter with images touching (`arcteryx-047`, `arcteryx-055-product-grid-prices.jpg`) - legitimate for a recipe or exercise-library thumbnail wall, never for anything with a real card boundary. Equinox's own grids use a real gutter; Equinox is primary.

### 3.4 Section vertical rhythm

Equinox's home page is **not** a stack of padded sections - it is an edge-to-edge sequence of full-bleed photo/video panels (~100vh each), each carrying a floating text card or bare text-on-image, butted against the next with no gap and no shared padding token (`equinox-001` → `equinox-045` sequence). Conventional padded sections appear only at the form + footer.

| Section type | Padding (block) | Basis |
|---|---|---|
| Full-bleed photographic panel | **0** | MEASURED: no gap between panels, `equinox-001`→`equinox-045` |
| Standard content section (data, task, form, FAQ) | **56px** top/bottom | MEASURED ≈54–56px nav-bottom to first stepper label (`equinox-048-book-visit-form.jpg`, `equinox-150-faq-accordion.jpg`) |
| Emphasis section (marketing feature, pricing) | **64px** top/bottom | MEASURED: interior-page content rows run ≈56–64px per row (`equinox-060-clubs-list-cities.jpg`, `equinox-064`) |
| Footer, top rule to first link | **56px** | MEASURED ≈40–56px (`equinox-051-footer-links.jpg`) → take the upper bound |

**56px is the default. 64px is the emphasis step. There is no third value.** Equinox itself is not more precise than that at the pixel level.

**Cadence rule change from Equinox:** the zero-gap full-bleed reel is **reserved for genuinely photographic marketing moments** - a hero, a program launch, a story panel. Anything data-oriented or task-oriented (plan view, diary, chat, library, settings, checkout) uses the 56/64px padded rhythm. This is the difference already visible inside Equinox's own site between its home page and its form/FAQ pages, made into a rule.

### 3.5 Full-bleed vs contained

- **Full-bleed by default** for: hero panels, feature photography, section-transition imagery, alternating-background content rows (`equinox-079-membership-benefits-hero.jpg`, `equinox-132-classes-hero.jpg`, `equinox-060`).
- **Contained** for: nav content, card grids, footer, forms, FAQ, any data table or list (`equinox-128`, `equinox-048`, `equinox-051`).
- **Split full-bleed** - one viewport row, 50/50: left half a full-bleed image flush to the viewport edge, right half a contained panel with its own padding. The single place Equinox mixes both in one row (`equinox-048-book-visit-form.jpg`). Adopt for onboarding and any "explain + capture" pairing.
- **Aspect ratios (MEASURED):** full-bleed hero crops run ~21:9 letterbox inside a 16:9-ish viewport (`equinox-021-gym-floor-video.jpg`); contained feature photos run 4:3 to 3:2 (`equinox-069-club-detail-michigan.jpg`, `equinox-125-club-copy-block.jpg`); product-grid tiles run square-to-portrait (`arcteryx-055`).

### 3.6 Nav bar

| Property | Value | Basis |
|---|---|---|
| Height | **80px** | MEASURED: black bar y=4.5→84.5 (`equinox-001-hero-cookie-banner.jpg`, col x=10 edge scan) |
| Background | `--surface-inverse` `#000000` | MEASURED @1142,101 (`equinox-001`, confirmed `equinox-060`) |
| Text/logo | `--text-primary-inverse` `#ffffff` | MEASURED |
| Separation from content | color contrast only - **no bottom border, no shadow** | `equinox-001`. (Eight Sleep uses a 1px hairline, `eightsleep-064`; not adopted) |
| Layout | 3 zones: logo left · nav links center-left · CTA pair right | `equinox-001`, all 83 frames |
| Logo left edge | 64px (= `--container-gutter`) | MEASURED x=63.5 |
| CTA pair right edge | container right edge | MEASURED x=1614.5 |
| Gap between CTA buttons | **8px** | MEASURED (`equinox-001`) |
| Nav CTA button width | 150px / 145px | MEASURED: x=1311.5–1461.5 and x=1469.5–1614.5 (`equinox-001`) |
| Position | fixed, `--z-nav` 100 | present in all 83 frames |
| Promo/announcement strip | **35px**, white bg / black text, sits *below* the nav, collapses on scroll | MEASURED y=84.5→119.5 (`equinox-001`); absent once scrolled (`equinox-008-hero-pool-scrolled.jpg`) |
| Nav + promo combined | 115px | MEASURED |

**Sticky context bar (adopted from Eight Sleep, restyled):** on a long detail page (a program, a plan tier, a recipe), a second bar pins directly below the nav carrying item name + 2–3 trust/meta chips left, primary CTA right, `--z-sticky` 20 (`eightsleep-120` through `eightsleep-272`, persistent across dozens of scroll positions). Radius 0, 1px `--border` bottom, `--surface-raised` fill.

### 3.7 Floating card - the signature structural component

The single most reusable structural device in the corpus. Confirmed pixel-identical across `equinox-018-luxury-fitness-meet.jpg` and `equinox-011-everything-equinox-offer.jpg`, and same width at a different height in `equinox-045-equinox-plus-app.jpg`.

| Property | Value | Basis |
|---|---|---|
| Width | **432px** fixed | MEASURED: left edge x=243.5, right edge x=675.5, identical to the pixel in `equinox-018` and `equinox-011` |
| Left inset | **96px** from viewport (Cadence) | Equinox MEASURED 243.5px; Cadence uses `--container-gutter` + `--inset-editorial`, see 3.2 and 8.1 #14 |
| Height | auto, content-driven - **never a fixed token** | MEASURED 351.5px in both `equinox-018` and `equinox-011` (same content length), ~316px in `equinox-045` (shorter copy) |
| Vertical position | floats; typically bottom-anchored on the panel, not always | `equinox-045` sits roughly centered against a phone mockup |
| Padding | **56px** inline, **64px** block-end | MEASURED: flat-stroke "F" of "Find A Club" gives a clean 57px left inset; card bottom to CTA underline y=1035→907 raw = 64px CSS (`equinox-018`) |
| Fill | `--surface-raised` `#ffffff` (Cadence: `--color-off-white` on dark photography, see 6.4) | MEASURED solid white |
| Border / shadow | none / none | MEASURED |
| Content | H2 or H3 heading · 2–3 lines Body · underlined text-link CTA (**no button chrome inside the card**) | `equinox-018`, `equinox-011` |

**The card does double duty and Cadence keeps both jobs in one component:** it is the hero overlay device *and* the "selected/active" state for 3-up feature rows, carousels, accordions, and list rows (`equinox-025/027/029`, `equinox-037/038/041`, `equinox-106/108/111`). See the Reveal Panel primitive, 4.2.

### 3.8 Footer - real columns (Cadence fix)

Equinox's footer is the weak part of its system: a single vertical list of text links at the 244px inset, social icons pushed far right, a large dead gap between them, no column grouping, no legal micro-row (`equinox-050-form-footer.jpg`, `equinox-051-footer-links.jpg`). Adopt its visual quietness - plain light background, no boxes, hairline rule above - **but not its structure.**

Cadence's footer uses Arc'teryx's three-band structure (`arcteryx-065-footer-logo-nav-links.jpg`, `arcteryx-066-footer-newsletter-signup.jpg`), restyled:

| Band | Contents | Spec |
|---|---|---|
| **1 - links** | Cadence wordmark + **4 link columns**: Product / Company / Resources / Legal. Column headers are Eyebrow style (ALL CAPS +0.08em) per `arcteryx-065` "HELP / MY ACCOUNT / SHOP MORE / ABOUT US". Links are Caption, `--text-secondary`. | `--surface-bg`, 1px `--border` rule above, 56px block padding, 12-col grid, 16px gutter |
| **2 - newsletter** | Full-width **black** band: H3 heading + one line Body left; underline-only email input + inline "→" submit right. | `--surface-inverse`, 64px block padding. Input: **no box** - 1px `--border-inverse` bottom rule only, transparent fill, bare arrow glyph at the right edge (`eightsleep-272-footer-full.jpg`, the lightest-weight input in the corpus) |
| **3 - utility** | Social glyphs (bare, no chips) · locale selector · app-store badges · legal micro-row | `--surface-bg`, 32px block padding, 1px `--border` rule above |

The black band exists to create one visual pause inside an otherwise quiet footer so the email capture is actually noticed (`arcteryx-065`). Arc'teryx's own "SIGN ME UP" pill is not inherited - radius 0.

---

## 4. Component catalog

Format: **spec** (numeric) · **states** · **source + verdict**. `ADOPT` = take as-is. `ADAPT` = take the mechanic, restyle. `SKIP` = do not build.

### 4.1 Buttons

Every button: `--radius` 0, `--shadow` none, Button type (14px / 700 / ALL CAPS / +0.08em), single line, no icon unless specified.

| Variant | Height | Padding-inline | Fill | Text | Border | Source |
|---|---|---|---|---|---|---|
| **Primary - large** | 64px | 40px | `--accent` | `--accent-text-on` | none | MEASURED ~320×64 CSS box, 32–40px horizontal (`equinox-005`, `equinox-018`). Equinox uses white fill / black text; Cadence promotes to green |
| **Primary - chrome** | 52px | 32px | `--accent` | `--accent-text-on` | none | MEASURED nav CTA ~52px tall, 150px wide (`equinox-001`) |
| **Primary - compact (in-app)** | 48px | 24px | `--accent` | `--accent-text-on` | none | DERIVED: 8px-grid step below chrome |
| **Secondary - outlined** | matches its primary sibling | matches | transparent | inherits surface | **1px** `--border-strong` (light surface) / `--text-primary-inverse` (dark surface) | MEASURED 1–2px raw at 2x = ~1px CSS, confirmed on two contexts (`equinox-001` nav, `equinox-128` plan cards) |
| **Tertiary - underlined text link** | auto | 0 | none | `--text-primary` / `--text-primary-inverse` | **1px border-bottom, 4–6px below baseline** - a drawn rule, NOT `text-decoration` | MEASURED (`equinox-018` "Find A Club", `equinox-025/027/029` "Discover…", `equinox-011`, `equinox-128` "VIEW CLUBS IN THIS PLAN") |

**States (all variants):**

- Default / hover / active / disabled / focus-visible.
- **Hover: opacity `--dim-inactive` 0.70 on the fill.** Never a color transition, never a transform. MEASURED: `equinox-240-spa-find-a-spa-hover.jpg` shows the filled button at a semi-transparent ~70% on hover - the one hover state captured in the corpus.
- **Disabled: opacity-based, not cursor-based.** Reduce to 40% opacity, `cursor: not-allowed`. Equinox signals disabled with a grey fill + blocked cursor (`equinox-142`); Eight Sleep uses a lighter stroke on an identical control (`eightsleep-056`, `eightsleep-144`). Cadence standardizes on Eight Sleep's approach - it is visible without a cursor, which matters on touch.
- **Focus-visible: 2px `--accent` outline, 2px offset** (derived - no focus state exists anywhere in the corpus; see 8.2).

**SKIP:** Eight Sleep's button shape entirely. Corrected measurement: its primary nav/hero CTA is an ~8–10px soft rectangle, not a full pill; the true 999px stadium radius lives on its secondary elements - "Explore the X ⊕" links, review-filter tabs, size chips (`eightsleep-116`, `eightsleep-092`, `eightsleep-248`). Both are stripped to radius 0. Its padding generosity (~14–16px vertical, 28–32px horizontal) is a useful proportion reference once squared.

### 4.2 Reveal Panel - the one Cadence primitive

**This is the single most important component in the system.** Equinox powers four visually distinct surfaces with one mechanic: *dark or transparent by default → solid (or near-solid) light fill when hovered, selected, or expanded.* Build it once, use it everywhere.

Confirmed identical mechanic across:

- 3-up hover-highlight row over a shared hero image (`equinox-025-carousel-signature-classes.jpg` all dim → `equinox-027` middle solid → `equinox-029` third solid); reused verbatim for spa features (`equinox-037/038/041`).
- Numbered tab strip over a hero video (`equinox-094` tab 1 active, `equinox-099` mid-transition, `equinox-101` tab 3 active).
- 6-item horizontal pillar strip (`equinox-175-eqx-os-pillars.jpg`, `equinox-179`, `equinox-182`, `equinox-184`).
- Club-directory list rows (`equinox-056` default → `equinox-059` full-row flat fill on hover).
- Class-list accordion rows (`equinox-106`, `equinox-108`, `equinox-111`).

| Property | Value | Basis |
|---|---|---|
| Inactive state | `--scrim-grey` over the underlying photo, text `--text-primary-inverse` | MEASURED ~58% (`equinox-038`); components read as 40–60% across frames |
| Active state | `--scrim-white` (81% white, **translucent - not opaque**) over the photo, text `--text-primary` | MEASURED ~81% (`equinox-038`). Confirmed translucent by `equinox-184`, where the active fill takes a pale green tint from the green-tinted photo beneath it - an opaque fill could not do that |
| Panel padding | 40px | MEASURED ~40px (`equinox-025`), accordion panel 32–40px (`equinox-108`) |
| Top rule | 1px `--border`, full column width, **static** | MEASURED (`equinox-025`); never draws in, never width-animates (`equinox-motion-02`) |
| Transition | opacity + color only, ≤150ms, no transform | `equinox-motion-02-classes-hover-carousel.mp4`: crossfade completes within one 6fps frame; both panels partially lit in the transitional frame = true crossfade, not a cut |
| Axis | horizontal (3-up, 6-up) or vertical (list rows) - same component | `equinox-motion-03` shows both axes in one clip |

**Cadence change from Equinox:** Equinox hides the CTA link entirely until hover (`equinox-025` shows no link; `equinox-027`/`029` reveal it). **Do not do this** - it is unreachable on touch. Cadence shows the link/affordance in all states and uses the reveal only for the scrim→light swap.

### 4.3 Cards

| Component | Spec | Source + verdict |
|---|---|---|
| **Floating hero card** | Full spec in 3.7. 432px, 56/64px padding, no border, no shadow | `equinox-018`, `equinox-011`, `equinox-045` · ADOPT |
| **Full-row list card** | No container at rest - text + 1px `--border` divider only. Hover fills the entire row with a flat surface (Equinox uses mid-grey ~`#6b6b6b`; Cadence uses `--surface-raised` on light, `--surface-inverse-alt` on dark). Anatomy: title + description + "View all N →" left, meta list center, 4:3 photo right third | `equinox-056` default / `equinox-059` hover; same anatomy reused for club detail (`equinox-060`, `equinox-064`, `equinox-069`, `equinox-088`) · ADOPT - cheap, scans well for long lists (exercise library rows, meal-plan-day rows) |
| **Bare grid card** | Image + name + one meta line. **No fill, no border, no shadow** - the leanest card in the corpus. Image tile square-to-portrait on `--color-off-white`, text stacked below with 8px gap | `arcteryx-055-product-grid-prices.jpg`, `arcteryx-047`, `arcteryx-056`, `arcteryx-079` · ADOPT for recipe/exercise library grids; proven to scale to dozens of items |
| **Reassurance strip** | 3-up row, each: 24px line icon + H6 heading + 1–2 lines Body. 32px padding, `--surface-raised` fill on `--surface-bg`, radius 0, no border, no shadow. Reused identically at top-of-page and pre-footer | `eightsleep-001-trust-badges.jpg`, `eightsleep-240` (verbatim reuse confirms it is a standard component) · ADAPT: corners → 0, fill → `--surface-raised`. Maps to "cancel anytime / private by default / coach-reviewed plans" |
| **Explainer vs commerce card split** | Two variants of one grid card. **Explainer**: photo + bottom-third scrim + name + description overlaid in light text, optional Eyebrow tag chip top-right. **Commerce**: photo on `--surface-bg` + name + tag chip + description + price + full-width primary button | `eightsleep-136-component-grid.jpg` (explainer), `eightsleep-248` (commerce) · ADAPT: radius → 0, pill tag → square Eyebrow chip. Clean separation of "teach what this is" from "buy this" |

### 4.4 Forms and inputs

| Component | Spec | Source + verdict |
|---|---|---|
| **Text input** | Height **64px**, 1px `--border-strong`, radius 0, transparent fill, 16px inline padding (derived), placeholder in `--text-secondary` (never `#a8a8a8` - see 1.5). Field gap **16–24px** | MEASURED (`equinox-048-book-visit-form.jpg`) · ADOPT, with the placeholder-contrast fix |
| **Underline-only input** | 1px border-bottom only, no box, transparent fill, bare "→" submit glyph inline at the right edge | `eightsleep-272-footer-full.jpg` · ADOPT for single-field low-commitment capture (newsletter, quick-add). The lightest input in either corpus |
| **Search + attached button** | 64px-tall input with a leading magnifier glyph, primary button flush against its right edge, **0 gap** - reads as one continuous control | `equinox-056-clubs-directory-search.jpg`, recurring on `equinox-060/069/085/088` · ADOPT |
| **Numbered step header** | "01 Select Club" / "02 Book Visit". Current step `--text-primary` 700, future step `--text-secondary` 400. Numerals in Eyebrow style | `equinox-048`, `equinox-151` · ADOPT for onboarding ("01 Your Goals / 02 Your Plan") |
| **Progressive field → summary card** | Empty state is a plain bordered row with a trailing "+"; once populated it morphs into a summary card: thumbnail + Eyebrow label + name (700) + "Change" text link right-aligned | `equinox-048` (empty) → `equinox-151` (filled) · ADOPT - the single best form idea in the corpus |
| **Option selector** | Row of N equal-width boxes, label only. Unselected: `--surface-raised`, 1px `--border-strong`, radius 0. Selected: **2px `--accent` border + 8% accent tint fill** | `eightsleep-264` - already sharp-cornered, the only Eight Sleep component needing no shape change · ADOPT, swap blue → `--accent` |
| **Segmented control** | 2+ options, radius **0**. Active: `--surface-raised` fill + `--text-primary`. Inactive: transparent + `--text-primary-inverse`. 1px `--border-strong` around the group | `equinox-069`/`equinox-088` List/Map toggle · ADAPT: Equinox's own pill border is an outlier even within its system |
| **Toggle switch** | Track 44×24px, knob 20px, radius 0 (square track, square knob). On: `--accent` fill. Off: `--color-grey-300` | `eightsleep-220` (iOS-style rounded) · ADAPT - squared, per 1.7 |
| **Stepper** | Eyebrow label + large numeral (Stat or H1 scale) + square −/+ buttons flanking it. Buttons 40×40px, 1px `--border-strong`, no fill | `eightsleep-036-temp-per-side-feature.jpg` ("His side" 61° / "Her side" 79°), `eightsleep-204`, `eightsleep-220` · ADOPT the mechanic wholesale for any adjustable target (macros, intensity, wake time). ADAPT: circles → squares; re-derive Eight Sleep's "accent color mirrors the value" idea as `--accent` numeral when a target is met, `--text-secondary` otherwise - **not** literal warm/cool color coding |

### 4.5 Navigation and overlays

| Component | Spec | Source + verdict |
|---|---|---|
| **Main nav** | Full spec in 3.6 | `equinox-001` · ADOPT |
| **Centered-logo nav** | Alternative shell: 3-link cluster left · centered wordmark · utility cluster right (account, locale, cart, CTA). ~72px tall | `eightsleep-116` + every eightsleep frame · Available alternative for a marketing surface. See 8.3 #5 |
| **Two-tier nav** | Tier 1 black ~32px: brand-switcher links left, rotating announcement center, utility right. Tier 2 white ~90px: logo left, category nav center, icons right | `arcteryx-001`, `arcteryx-014`, `arcteryx-023`, `arcteryx-059`, `arcteryx-093` · DEFER - only worth it if Cadence ever runs sub-brands. Already sharp-cornered |
| **Menu takeover** | Opening a full-nav menu: (1) `--scrim-modal` dims the page body, **nav stays fully lit**; (2) panel mounts below the nav at full height, already expanded - no slide-down, no height-grow; (3) the rightmost nav icon swaps to a close "X" | `arcteryx-093-discover-dropdown-menu-logo.jpg` + `arcteryx-motion-01-discover-menu-open.mp4` · ADOPT the mechanic. **The panel's internal content layout is NOT in the corpus** - see 8.2 |
| **Hotspot tour** | Full-bleed photo + small circular dot markers pinned to real locations. Inactive dot: 12px, 1px `--border-strong` ring, transparent fill. Active dot: 12px solid `--accent` + 2px white ring. On activate: page dims to `--scrim-modal` (**including the nav**), photo crops to the left ~65% at full brightness, a `--surface-raised` panel slides in over the right ~35% carrying H3 name + 2 paragraphs Body + one primary button + prev/next bare-glyph arrows + a square close "X" top-right | `eightsleep-008-hotspot-bed-hero.jpg` → `015` / `018` / `022` / `026` / `030` (full 5-step cycle) + `eightsleep-motion-01` · ADOPT wholesale. ADAPT: radius → 0, dot blue → `--accent`, and drop Eight Sleep's redundant secondary "LEARN MORE" link - one CTA per panel |
| **Coach-chat FAB** | 56px square (radius 0), `--surface-inverse` fill, chat glyph, 8px status dot top-right using `--accent` for online. Fixed bottom-right, 24px viewport margin, 8px stack gap if a second chip is present, `--z-fab` | MEASURED ~48–56px chips, ~24px margin, 8–12px stack gap (`equinox`, nearly every frame) · ADAPT: rounded chip → square. Maps directly to Cadence's coach chat |

### 4.6 Carousels, tabs, accordions

| Component | Spec | Source + verdict |
|---|---|---|
| **Numbered tab strip over media** | Bottom-aligned horizontal strip over a full-bleed hero. Each tab: 2-digit index (Eyebrow, `--text-secondary-inverse`) + label. Active tab = Reveal Panel active state. 24px tab padding. Optional 1px progress rule along the bottom edge under the active tab | `equinox-094`/`099`/`101` (3 tabs), `equinox-175`/`179`/`182`/`184` (6 tabs - pattern generalizes to any N) · ADOPT |
| **Peek carousel + square arrows** | 2-up track: one large captioned card + one uncaptioned preview card peeking right. Arrow buttons **56px square**, radius 0, `--surface-raised` fill + `--text-primary` glyph; disabled = 40% opacity | `equinox-136`/`137`/`141`/`142` (disabled next arrow confirms a real last-slide state) · ADOPT - already sharp-cornered, no adaptation |
| **Filter tabs driving a carousel** | Horizontal row of segmented filter tabs above a horizontally-scrolling card row. Inactive: 1px `--border-strong`, transparent, `--text-secondary`. Active: `--surface-raised` fill + `--text-primary` (a light-on-dark inversion, **not** an accent fill). Focused card bright, flanking cards at `--dim-inactive` | `eightsleep-084`, `eightsleep-092` · ADOPT the pattern ("browse by goal": strength / endurance / recovery). ADAPT: pills → square segments; use the square arrows from `equinox-136` rather than Eight Sleep's circles |
| **Persona-tag carousel** | 3–4-up cards, each: photo tile + Eyebrow category chip + H4 heading + 1–2 lines Body. Prev/next arrows bottom-right, disabled state = lighter stroke, never hidden | `eightsleep-040`, `eightsleep-056`, `eightsleep-144`/`172`/`196`/`200`/`204` · ADOPT for plan-template browsing ("MARATHON TRAINING", "STRENGTH FOCUS"). ADAPT: radius → 0, lavender chip → `--accent` or neutral |
| **Row accordion (reveal panel, vertical)** | Rows of Eyebrow category label (left col) + H5 name (right col), 1px `--border` divider between, no container at rest. One row at a time expands to a Reveal Panel active state, 40px padding, revealing 2–3 lines Body. No chevron on this variant | `equinox-106`/`108`/`111`/`112` · ADOPT as the exercise-in-workout / meal-in-plan row |
| **Explainer accordion + synced media** | Same row list, paired with a large media pane on the right that swaps to match the active row | `equinox-160`/`162`/`166`/`168` · ADOPT for "how coaching works" / "why this plan" - the most efficient way to explain 3–6 concepts without a wall of text |
| **FAQ accordion** | Question row + right-aligned 16px chevron glyph (**bare, no icon container**), 1px `--border` above and below each row, `--surface-raised` background, radius 0 | `equinox-150-faq-accordion.jpg` · ADOPT directly |
| **Mosaic carousel** | Overlapping asymmetric photo tiles, various sizes, dark gutters, square arrows | `equinox-195` · DEFER - layout-heavy, bespoke per breakpoint, low priority |

### 4.7 Data display

| Component | Spec | Source + verdict |
|---|---|---|
| **Plan / pricing grid** | 4 equal columns on `--surface-bg`, 16px gutter, 1px `--border` vertical rules between columns, 40px column padding, radius 0. Per column, in order: H4 plan name · optional Eyebrow badge chip (**square**, top-right, featured column only) · Stat-scale price + Caption period · Body description · tertiary underlined link · 1px divider · Eyebrow "AMENITIES"-style label · Body list · primary button · tertiary underlined link. **Featured column**: 1px `--accent` border around the whole card + primary (filled) button, while non-featured columns get the outlined variant | `equinox-128-membership-plans-grid.jpg` (single frame, full 4-up grid) · ADOPT the anatomy verbatim. ADAPT: badge pill → square, white highlight → `--accent` |
| **Stat tile** | Stat numeral (68px / 500 / lining figures) + Eyebrow label beneath. 32px padding, 1px `--border`, radius 0, flat `--surface-raised` or `--surface-inverse` fill. Optional thin-line data-viz motif (arc gauge, sine wave) in **`--accent` only** | `eightsleep-060`, `eightsleep-064-stat-cards-science.jpg`, `eightsleep-072-stat-cards-600m-clinical.jpg`, `eightsleep-144` · ADOPT. ADAPT: radius → 0, and **standardize on one accent treatment** - Eight Sleep's per-card gradient moods (navy→purple, magenta→blue) read as ad copy, not dashboard data. Cadence stat tiles must read as real data |
| **Stat callout pin** | Small stat card pinned to a vertical stem + dot on a horizontal timeline axis with tick marks. Scroll-driven | `eightsleep-064` · ADAPT - good for a progress-over-time recap. Radius 0, `--accent` stem/dot |
| **App-UI showcase** | Real app screenshot embedded in marketing content, always paired with a **plain-English** headline (not a technical one) and traffic-light status icons on a square chip: `--accent` check = good, `--text-secondary` = neutral, a single warning tone = flagged | `eightsleep-148`, `eightsleep-208-sleep-metrics-dashboard.jpg`, `eightsleep-212`, `eightsleep-216` · ADOPT. ADAPT: glass circle → square chip; **avoid magenta entirely** - the warning tone must live inside the Cadence palette |
| **Rotating metric list** | Vertical list of metric names, all faded except the active one (700 weight, full opacity), cycling on a timer inside a framed panel | `eightsleep-208`, `eightsleep-216` · ADAPT - cheap way to show breadth ("Protein · Sleep · HRV · Load · Adherence"). Radius 0 |
| **Before/after split** | Two side-by-side panels, hard vertical seam, small Eyebrow label at each panel's top-center. Static split, not a drag handle | `eightsleep-164`, `eightsleep-168` · ADAPT for progress-photo or planned-vs-actual comparison. Interactivity is **inferred, not observed** - see 8.2 |

---

## 5. Motion

Method: `ffprobe` duration + `ffmpeg fps=6` frame dump per clip; consecutive rest-states compared to isolate transition duration (frame count ÷ 6fps), easing character (where movement concentrates), trigger, and stagger. 13 clips: 8 Equinox, 4 Eight Sleep, 1 Arc'teryx.

### 5.1 Per-clip findings

**`equinox-motion-01-hero-pool-autoplay.mp4` (4.45s, 27 frames)** - Full-bleed hero video behind a static text/CTA overlay. Trigger: autoplay on load, muted, looping. Camera is **static** - building geometry and horizon are pixel-identical across frames 1–16; all perceived motion is content motion (a swimmer, ripples). Zero added UI choreography: the cookie banner and chat widget appear as static overlays with no animated entrance; the brand mark is identical in position and rotation in every frame. Frames 20→27 are a scroll-follow: content moves 1:1 with scroll, no parallax or fade layer. Properties: none (video content only).

**`equinox-motion-02-classes-hover-carousel.mp4` (6.00s, 36 frames)** - The 3-column Reveal Panel over one continuously-playing background video; the same component recurs later in the same clip for a spa section, confirming it is a system primitive. Trigger: hover. **Duration ≤170ms** - the crossfade completes within one 6fps frame (9→10, 15→16). Easing: unresolvable at 6fps, but transitional frames show both the outgoing and incoming panel partially lit, so it is a true opacity crossfade, not a hard cut. Properties: `opacity`, `background-color`, `color`. **Nothing else moves** - no scale, no lift, no shadow, no position change; the thin rule above each title is static; the background video keeps its own pace. Stagger: none, all three columns update in the same frame.

**`equinox-motion-03-club-spaces-tabs.mp4` (6.00s, 36 frames)** - Same Reveal Panel component, but **auto-advancing** rather than hover-driven, proving one component serves both modes. Dwell: tab 1 active ~13 frames ≈ **2.2s** before advancing. Transition: unlike clip 02's instant crossfade, the auto-advance passes through a **full black frame** (frame 14) - all three columns dim simultaneously, then the new background fades in as the new tab brightens. **≈330ms**, visibly heavier than the hover crossfade. Frames ~28–36 show the same bright/dim logic applied as a vertical list, same component, different axis. Properties: `opacity`, `background-color`.

**`equinox-motion-04-class-list-accordion.mp4` (6.00s, 36 frames)** - Class rows crossfading dim ↔ bright, plus feature-card captions fading in. Trigger: **scroll position, not hover** - confirmed by two rows (HIIT and Running) simultaneously mid-fade at frame ~17, and by rows re-triggering as the recording scrolls past twice. Duration: scrubbed to scroll distance, ≈2–3 sampled frames = **333–500ms** of scroll travel per row. Easing: **ease-out** - opacity ramps quickly on entry then holds. Stagger: within a card, title then paragraph at ~333ms offset, fully legible by ~1000ms. Static: row order, left-column body copy, buttons.

**`equinox-motion-05-exclusives-carousel.mp4` (5.00s, 30 frames)** - Click-driven 2-up peek carousel. Trigger: click (cursor arrives frame 18, hand cursor frame 20, ~1.0s dwell, focus outline frame 25). **Duration ≤167ms** - fully resolved one frame after the click, no intermediate slide frame at 6fps. Easing: unresolvable; reads as a snap, not a glide. Stagger: none - image track and caption swap in the same step. Static: arrow buttons have no bespoke hover state, only a cursor-affordance change plus a default-looking focus ring.

**`equinox-motion-06-equinox-difference-accordion.mp4` (6.00s, 36 frames)** - Single-open text accordion paired with a media pane that swaps per row. Trigger: **hover dwell** - the cursor parks idle on a header for several frames (4–9) before it opens at frame 10; no mouse-down visible. Durations: outgoing paragraph collapse **≤167ms** (hard cut); incoming paragraph expand **333–500ms**, building progressively; paired media wipe **333–500ms**, starting a beat after the text. Easing: expand reads **ease-out** (most growth in the first frame-gap, then settles); the media wipe was inconsistent between the two observed instances - treat as ~400ms of uncertain curve. Stagger: three-way - collapse (instant) → expand (333–500ms) → media wipe (~1–2 frames later, finishing last). Static: section title, nav, divider rules. **No chevron or expand icon at all** on this variant.

**`equinox-motion-07-eqx-os-pillars.mp4` (5.00s, 30 frames)** - 6-item numbered pillar strip over an autoplay video, auto-advancing. Trigger: timed, not hover - the active slot marches 01→06 regardless of cursor. Durations: highlight block slide/resize between adjacent pillars **≈333ms**, visibly straddling two panels mid-transit; background video swap is a hard black-frame cut **≤167ms**. Easing: the highlight slide has a soft, non-instant settle - an **eased slide**; the video cut is not eased. Stagger: none - slide and cut share one beat. Static: the 01–06 numerals stay identical in weight and position.

**`equinox-motion-08-spa-hero-video.mp4` (4.98s, 30 frames)** - Full-bleed spa hero video. Only the video content changes (hard cuts between massage shots baked into the source edit). No transform, opacity, or color animation on any DOM element; camera holds static framing. Nav, wordmark, subhead, CTA, and badge are pixel-identical for the full 4.98s. Confirms clip 01.

**`eightsleep-motion-01-hotspot-product-tour.mp4` (6.00s, 36 frames)** - Hover-triggered hotspot detail drawer. What animates: dot marker → accent-filled active state; a detail panel slides in from the right edge (~35% viewport); the photo dims under a scrim; the panel's product image swaps per hotspot. **Open ≈500ms** (first sliver frame 17, settled frame 20). **Close ≤167ms** - frame 26 fully open, frame 27 fully gone. Easing: **ease-out on open** - most travel in 17→18 (sliver → ~90% revealed, text readable), then a slower settle for the chrome. Stagger: **content-first, chrome-last** - text and CTA are readable while the panel is still mid-slide; chevrons and close X only appear once the slide completes. Static: the product photo (no camera move), nav, FAB.

**`eightsleep-motion-02-stat-counters.mp4` (5.00s, 30 frames)** - Scroll-zoom into a stat-card grid with counting numbers. Trigger: scroll-into-view, each counter **runs once** and locks (no loop, no re-trigger). Durations: layout zoom settles ≈**660ms**; "550→600" counts over frames 8→16 ≈**1.3s**; "20→50" over frames 10→20 ≈**1.7s**. Easing: **ease-out odometer** - increments shrink toward the target (frame 9→10 jumps +18; frame 15→16 jumps +1), with visible digit motion-blur mid-roll. Stagger: two counters start within ≈330ms of each other as their cards scale in (synchronized start) but **finish at different times** - do not force synchronized completion. Static: nav, CTA, the background product videos under each card.

**`eightsleep-motion-03-dualzone-thermal.mp4` (5.00s, 30 frames)** - Despite the filename, **not an interactive diagram**. A scroll-driven dolly past a static side-by-side thermal comparison photo. Trigger: scroll (cursor never moves across all 30 frames). Phases: hero holds → fast scroll (heading motion-blurs past, gone by frame 4) → the panel settles into a fixed zoomed crop by frame 8 and holds nearly static frames 8→12 (**≈660ms deliberate pause**) → resumes by frame 14. The thermal glow is a **baked-in static image** - identical position, shape, and brightness in every frame; no pulsing, no slider, no live simulation. Label pills are fully opaque the instant they enter frame.

**`eightsleep-motion-04-night-on-pod-graph.mp4` (6.00s, 36 frames)** - Scroll-scrubbed sleep-stage line chart in a pinned section. What animates: the already-passed curve segment recolors dim→bright while the future segment stays dim; the curve pans so the current-time marker stays pinned near center; the time label updates continuously; at stage checkpoints a caption block and a dial widget fade in; the position dot gains a soft glow once a caption is active. Trigger: scroll (pinned section; chart position is a direct function of scroll offset - confirmed by nav/promo bar scrolling normally around the pinned graphic). Durations: the scrub itself has **no fixed duration** (1:1 with scroll); the per-checkpoint caption + dial fade is a real timed transition, invisible → ~40–50% → fully opaque across 3 frame-intervals ≈**500ms**. Easing: the checkpoint fade reads **ease-in-out** (roughly even opacity steps); the scrubbed pan/recolor has no independent easing. Stagger: none between caption and dial. Static: page chrome scrolls normally; the curve's underlying shape never changes - only the reveal mask, pan offset, and color state.

**`arcteryx-motion-01-discover-menu-open.mp4` (3.50s, 21 frames)** - Mega-menu open. Two layers in sequence: (1) a dark scrim fades over the page body, **nav stays undimmed**; (2) a white panel mounts below the nav with 4 link columns plus a promo card; the rightmost nav icon swaps to a close X. Trigger: **click, not hover-intent** - the label sits in its hover style for ≈1.3s (frames 1–9) with the menu still closed. Durations: scrim absent→fully dimmed **≤167ms** (frame 9→10); a **held ≈167ms scrim-only gap**; the full 4-column panel appears **already fully formed** within another ≤167ms (frame 11→12); a ≈167ms caption settle tail. Total click-to-settled ≈**667ms** across 4 frames, but **no frame shows a partial slide or fade** - two separate fast state changes, not one smooth ease. Stagger: none between the 4 columns or their items; the only sequencing is the scrim-before-panel gap. Static: the nav bar itself, except the one icon swap.

### 5.2 Cadence motion ruleset

**Bias, stated once:** motion **confirms** a state change, it does not perform one. Across three unrelated brands the pattern holds - the more expensive the surface, the less its UI moves on its own. Nearly everything that reads as motion in these 13 clips is either authored into video content, a scroll position made visible, or a near-instant state swap. Default to instant; reserve an eased transition for the few moments that must teach the user something changed.

**Duration bands:**

```css
--dur-micro:  150ms;  /* state swap, no spatial movement - the majority case */
--dur-panel:  400ms;  /* content mounts or reveals - the 330–500ms measured band */
--dur-close:  120ms;  /* every close/collapse, always faster than its open */
--dur-count:  1400ms; /* scroll-triggered counter roll - paced to reading, not to UI feedback */
```

| Band | Value | Applies to | Evidence |
|---|---|---|---|
| **Micro** | **≤150ms** | Reveal Panel hover swap, carousel click-swap, accordion collapse, menu scrim + panel snap, button hover dim, tab selection | `equinox-motion-02` (≤170ms), `-05` (≤167ms), `-06` collapse (≤167ms), `arcteryx-motion-01` (≤167ms per layer) |
| **Panel** | **330–500ms, ease-out** | Anything that **adds new content** to the screen: accordion expand, hotspot drawer, auto-advance highlight slide, scrollytelling checkpoint fade | `equinox-motion-06` (~400–500ms), `eightsleep-motion-01` (~500ms), `equinox-motion-07` (~333ms), `eightsleep-motion-04` (~500ms) |
| **Page / scroll** | **650ms–1.7s** | Stat counter count-up, hero-to-grid zoom settle, deliberate scroll-hold on a key image. **Never borrow this band for component interactions** | `eightsleep-motion-02` (1.3–1.7s counts, ~660ms zoom), `eightsleep-motion-03` (~660ms hold) |

**Two asymmetries, both mandatory:**

1. **Auto-advance is deliberately heavier than the same action user-triggered.** The identical Reveal Panel is ~150ms on hover but takes a ~330ms black-frame cut when it advances on a timer (`equinox-motion-03`, `equinox-motion-07`). "You did this" stays instant; "this changed on its own" gets a visible beat so the user is not confused by an unprompted change.
2. **Open is slower than close, always.** Hotspot drawer ~500ms open / near-instant close (`eightsleep-motion-01`); accordion ~400ms expand / ≤167ms collapse (`equinox-motion-06`). Build every expand/reveal with this asymmetry - deliberate on the way in, abrupt on the way out.

**Easing:**

```css
--ease-out:    cubic-bezier(0, 0, 0.2, 1);      /* DERIVED - the house curve */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);    /* DERIVED - narrative/scroll checkpoints only */
```

- **Ease-out is the house curve** for anything in the 330ms+ band: most of the change happens early, then it settles. Applies to accordion expand, hotspot slide, auto-advance highlight, counter deceleration.
- **Ease-in-out appears exactly once** in the corpus, for a scrollytelling checkpoint fade at a fixed narrative beat (`eightsleep-motion-04`). Reserve it for that case; never for interactive feedback.
- **Linear appears nowhere in the corpus.** Never reach for it.
- **Below ~170ms the curve is unresolvable and does not matter.** Build the micro band to feel instant; do not manufacture a visible ease just to have one.
- The exact cubic-beziers are DERIVED - the 6fps sampling rate cannot resolve a curve. Recorded in 8.1 #18.

**Hover behavior - three hard rules:**

1. **Hover NEVER transforms.** No `scale`, no `translate`, no lift, no shadow-in, no position or size change, on any element, ever. Across all 13 clips and three brands, not one hover produces a transform. This is the single most consistent finding in the corpus (`equinox-motion-02`: "card position/size never changes"). A hover transform in Cadence is a bug.
2. **Cards and tiles hover via `opacity`, `background-color`, and `color` only** - the Reveal Panel dim ↔ bright swap, ≤150ms.
3. **Buttons hover via opacity only** (`--dim-inactive` 0.70, `equinox-240`). No color transition, no border change. Arrow buttons in the corpus show no bespoke hover state at all beyond the cursor (`equinox-motion-05`).

**Carousels:** manual click-driven carousels **snap** (≤167ms, no eased glide) - this reads confident, not sluggish (`equinox-motion-05`). Auto-advancing carousels dwell **~2.2s** per item then cut with the heavier ~330ms transition (`equinox-motion-03`, `-07`). Do not build a smooth sliding glide by default. (Whether Cadence keeps the snap or authors a 200–300ms ease is a live decision - 8.3 #6.)

**Hero video:** static camera only - no Ken Burns, no zoom, no pan, ever. If a hero must feel alive, the motion lives in the footage (people moving, water rippling), never in a transform layered on top. Zero added UI choreography over the video: the text/CTA overlay is static from frame one. Autoplay, muted, looping, with shot changes as hard cuts baked into the source edit - not a frontend crossfade. Scrolling off a hero is a plain 1:1 follow, no parallax. **Treat hero video as a content/editing decision (shot selection, color grade, loop point), not a motion component with tokens.** (`equinox-motion-01`, `equinox-motion-08`)

**Counters:** scroll-triggered, **count once and lock** (no loop, no re-trigger), ease-out odometer deceleration over 1.3–1.7s. Multiple counters in a row start together but are allowed to **finish at different times** - synchronize the start, never the finish (`eightsleep-motion-02`).

**What NEVER animates:**

- **Nav bar chrome** - logo, category labels, primary icons. Static in position and style across every clip in all three brands. The one permitted exception is a deliberate icon **swap** (menu glyph → close X) at the moment a menu opens; that is a state change, not a transition.
- **Divider rules and underlines** under headings, cards, tabs, and accordion headers. Present but inert in every frame. Never draw in, never width-animate (`equinox-motion-02`, `-06`).
- **Decorative brand marks / persistent widgets** - identical position in every frame of every Equinox clip; site-wide furniture, never touched by any interaction.
- **Background video content** in response to UI. It keeps playing its own loop regardless of what happens in the overlay (`equinox-motion-02`, `eightsleep-motion-02`).
- **Static comparison or diagram imagery.** Eight Sleep's "thermal" visual is a photographed comparison shot with a scroll-hold, not an animated diagram (`eightsleep-motion-03`). Never build a live heat-map component where the reference is a still image.

**Reduced motion:** at `prefers-reduced-motion: reduce`, set every duration to 0ms and disable the counter roll (show the final value immediately). Because nothing in this system depends on a transform, nothing breaks. (DERIVED - no evidence in corpus.)

### 5.3 Cadence surface → motion mapping

| Surface | Pattern | Spec |
|---|---|---|
| Recipe / workout hero clip | `equinox-motion-01`/`-08` | Static camera, autoplay loop, zero overlay choreography |
| Ingredient or equipment callout on a photo | `eightsleep-motion-01` | ~500ms ease-out open (content before chrome), ≤150ms close, `--scrim-modal` while open |
| Nutrition targets / weekly stats hitting a number | `eightsleep-motion-02` | Scroll-triggered, count-once, ease-out deceleration, synchronized start / independent finish |
| Recipe steps, workout blocks, FAQ | `equinox-motion-06` | Click to open (**not** hover-dwell - see 8.1 #12), ≤150ms collapse, ~400ms ease-out expand |
| Day-of-week / plan-view tabs | `equinox-motion-02`/`-03`/`-07` | Instant Reveal Panel swap on manual selection; the heavier ~330ms cut only if it ever auto-advances |
| Any nav or filter menu | `arcteryx-motion-01` | Two independently-timed near-instant layers (scrim, then panel), no internal stagger, no slide-down |
| Coach-chat message arrival | DERIVED | Micro band, opacity only |

### 5.4 Eight Sleep movements — explicitly ADOPTED (Jake, 2026-07-31)

Jake's directive: the Eight Sleep motion patterns are wanted, not merely tolerated. The §5.2 "default to instant" bias still governs *component feedback*, but these four **narrative/marketing patterns are sanctioned Cadence moves** — restyled to Cadence (green accent, radius-0 panels, tokens only), parameters as measured:

1. **Hotspot product tour** (`eightsleep-motion-01`): pulse-free static dots on imagery → ~500ms ease-out drawer with content-before-chrome, ≤150ms close, `--scrim-modal`. Surfaces: feature tours of the app, equipment/meal callouts, landing §4.
2. **Stat count-up band** (`eightsleep-motion-02`): scroll-triggered, count-once-and-lock, ease-out odometer over 1.3–1.7s, synchronized start / independent finish. Surfaces: landing stat band, weekly-report numbers, nutrition targets hit.
3. **Graph draw-in** (`eightsleep-motion-04`): a data line draws to its endpoint at a scrollytelling checkpoint, ease-in-out, page band (650ms–1.7s). Surfaces: Future You projection curves (the signature use), sleep/weight trend reveals, progress views. This is the one sanctioned home of `--ease-in-out`.
4. **Scrollytelling checkpoint fades** (`eightsleep-motion-04`): section content fades/settles at fixed scroll beats on marketing surfaces only — never inside the app's working views (Today, plan, diary).

Hard boundary unchanged: these are **content-reveal moments**, not interaction feedback. Hover/click feedback stays in the micro band; hover still never transforms; nothing in §5.2's NEVER list is relaxed.

---

## 6. Art direction

### 6.1 Photography treatment - the Cadence grade

Cadence follows **Equinox's desaturated color editorial**, not Eight Sleep's off-white lifestyle and not Arc'teryx's flat documentary alpine.

**Measurable rules:**

1. **No pure whites in photography.** MEASURED: a near-neutral gym-floor tile reads RGB(193,186,181) - 6% saturation, well below paper white - and **no sampled highlight in the 41-frame Equinox set exceeds roughly RGB 220 in any channel** (`equinox-021-gym-floor-video.jpg`). Skies, windows, and water are consistently held back a stop. **Rule: cap highlights at 220/255. No clipped whites.**
2. **Light is warm, directional, and practical - never flat.** Interiors are lit with warm tungsten/amber practicals against dark stone and wood (`equinox-018-luxury-fitness-meet.jpg` dim lobby with a warm pendant; `equinox-038-amenities-lounge.jpg` backlit wood slats and brown leather; `equinox-041-iconic-spaces-lockers.jpg` warm brass-edged mirrors on dark stone).
3. **High contrast, never blown out.** Every sampled hero sits at dusk, indoors, or under a colored gel - **no midday exterior, no clipped white sky** anywhere in 41 frames (`equinox-005`/`008` blue-hour pool, `equinox-011` sunset, `equinox-226`/`229`/`240`/`246` spa lit entirely in saturated red gel with near-black shadows).
4. **People shots are high-key on a pale-grey studio cyc**, bodies allowed to underexpose toward black in shadow, never flat-lit (`equinox-025-carousel-signature-classes.jpg`, `equinox-145`, `equinox-148`).
5. **One saturated color per moment, and only in the photograph - never in UI chrome.** MEASURED at Arc'teryx: a coral cap at RGB(240,128,117) = 51% saturation against a RGB(227,219,218) = 6% saturation backdrop - an **8x+ saturation gap** between the product accent and everything else on the page (`arcteryx-056-product-grid-footwear-apparel.jpg`). Equinox's equivalent is red spa gel and red-lit membership photography.
6. **Bespoke, not stock.** Every source reuses identifiable real locations, products, and a consistent color grade across dozens of frames (Equinox's Dartmouth Street club recurs across `equinox-088`/`125`/`159`; Arc'teryx reuses one seamless grey studio set across `arcteryx-055`/`056`). No frame in 57 sampled reads as stock.

**Product/object shots** (equipment, food, packaging) follow the **studio-neutral** treatment instead: single subject, dramatic single-source light, deep-neutral or warm-grey seamless backdrop, nothing else in frame. Measured backdrop reference: warm light grey RGB(227,219,218) / (235,230,224) / (222,217,212) ≈ `#DEDAD5`–`#EBE6E0`, **never pure white** - a same-page control sample landed at true white, confirming the warm grey is deliberate (`arcteryx-055-product-grid-prices.jpg`). Eight Sleep's near-black gradient-backdrop renders with a single warm rim light are the other valid reference (`eightsleep-108`, `eightsleep-116`, `eightsleep-120`) - for Cadence, use `--color-off-white` or `--color-black` as the backdrop, flat, no gradient.

### 6.2 Aspect ratios

| Use | Ratio | Basis |
|---|---|---|
| Full-bleed hero / section panel | ~21:9 letterbox crop inside a 16:9-ish viewport | MEASURED `equinox-021-gym-floor-video.jpg` |
| Contained feature photo inline with copy | 4:3 to 3:2 | MEASURED `equinox-069-club-detail-michigan.jpg`, `equinox-125-club-copy-block.jpg` |
| Grid tile (library, recipes, exercises) | 1:1 to 4:5 portrait | MEASURED `arcteryx-055`, `arcteryx-056` |
| Product / object shot | 1:1 | MEASURED `arcteryx-055` |

### 6.3 Text on imagery - three named treatments, no fourth

Where text sits on a photograph, legibility comes from exactly one of these. Equinox runs all three **in a single composition** (`equinox-038-amenities-lounge.jpg`), proving it is a "use what the photo needs" system, not one fixed recipe.

| Treatment | When | Spec |
|---|---|---|
| **A - Photo selection** | The type falls over an already-dark region of the source photo | **No overlay layer at all.** MEASURED: the middle column of `equinox-038` shows RGB(20,13,21) → (32,28,36), a delta too small to be an intentional overlay. Confirmed on four hero frames where white type sits directly on photo with no visible band or box at the type's edges (`equinox-079-membership-benefits-hero.jpg`, `equinox-132-classes-hero.jpg`, `equinox-156-personal-training-hero.jpg`, `equinox-207-spa-hero.jpg`) |
| **B - Grey frosted scrim** | The photo is busy or mid-tone and a card would be too heavy | `--scrim-grey` = `rgba(128,128,128,0.58)`. MEASURED: RGB(35,25,31) → (90,82,89) (`equinox-038` left card) |
| **C - Near-opaque light card** | Long copy, a CTA, or anything that must read as a discrete block | `--scrim-white` = `rgba(255,255,255,0.81)`, or the fully opaque Floating Card (3.7). MEASURED: RGB(22,11,20) → (210,207,210) (`equinox-038` right card) |

**Treatment C is the majority pattern for hero copy** and the single most repeated compositional device in the corpus (`equinox-005`/`008`, `equinox-011`, `equinox-018`, `equinox-045`).

**Banned, explicitly:** the generic translucent-black gradient bar at the bottom of an image. It appears nowhere in 57 sampled frames. It is the template/SaaS default and it is not in this system.

**Arc'teryx's exception, conditionally available:** white display type with an underlined-link CTA directly on a full-bleed photo with **no card and no scrim** (`arcteryx-001-logo-nav-hero.jpg`, `arcteryx-048`, `arcteryx-059`, `arcteryx-062`). This works only because Arc'teryx's alpine photography carries very high natural contrast. Cadence may use it **only** when the source photograph has comparable contrast; otherwise fall back to Treatment C.

### 6.4 Full-bleed vs contained - the art-direction rule

- **Full-bleed** is the default for hero and section-transition imagery. The image runs edge to edge under a transparent nav; there is no contained/margined hero anywhere in the Equinox set (`equinox-079`, `equinox-132`, `equinox-156`, `equinox-207`).
- **Contained** is reserved for secondary content - feature photos in a fixed-aspect rectangle inline with body copy (`equinox-069`, `equinox-125`) - and for all product/object shots.
- **Zero-gap full-bleed sequencing** (panel butted against panel, no padding between) is reserved for **genuinely photographic marketing moments only**. Data and task surfaces use the 56/64px padded rhythm (3.4).
- **On dark photography, the Floating Card fill is `--color-off-white`, not `--color-white`** - the off-white is the Cadence surface token and pure white against a graded photograph reads as a hole. (DERIVED from the palette lock; Equinox uses pure white.)

### 6.5 Whitespace

Generous whitespace is a measurable behavior, not an adjective: Equinox routinely fills an entire 1664px-tall frame with a two-line headline and a single search bar (`equinox-056-clubs-directory-search.jpg`), or one address block against pure black (`equinox-069-club-detail-michigan.jpg`). **Rule: a hero or section-opening panel carries at most one headline, one supporting paragraph, and one CTA. If a third content element is needed, it is a second section.**

---

## 7. Do / Don't constraints

Every entry is enforceable and traces to a corpus observation. A violation is a bug.

### 7.1 The banned list

| # | Ban | Why (evidence) |
|---|---|---|
| 1 | **No gradients on UI chrome** - buttons, cards, nav, backgrounds, badges | Zero decorative gradients exist in 57 combined Equinox + Arc'teryx frames; every surface is flat black, flat white, flat warm-grey, or a photograph. **Carve-out, not a loophole:** a gradient is allowed **only when it encodes real data** - a heat, effort, or recovery intensity map, matching Eight Sleep's functional blue↔red temperature visuals (`eightsleep-036-temp-per-side-feature.jpg`, `eightsleep-164-dualzone-thermal-hero.jpg`). Never as a fade behind text or a button fill |
| 2 | **No border-radius on cards, buttons, inputs, badges, chips, or toggles - 0 everywhere** | Every Equinox and Arc'teryx surface sampled is hard-cornered (`equinox-128`, `equinox-048`, `arcteryx-066`); Eight Sleep's rounding (`eightsleep-001`, `eightsleep-120`, `eightsleep-164`) is the one tell that reads "consumer DTC gadget" rather than "serious performance system" |
| 3 | **No shadows anywhere. Zero. No elevation scale exists.** Separation comes from fill color or a 1px border, never from depth | Not one drop shadow in 57 sampled frames across all three brands, verified by pixel scan on the hardest case - Eight Sleep's card-to-page transition steps `#f8f7f3` → `#ffffff` with no intermediate darkening band (`eightsleep-001`). Shadow is not part of this vocabulary even where corner radius is |
| 4 | **No emoji in UI** | Zero emoji anywhere in the corpus. All iconography is line-drawn (moon, truck, shield in `eightsleep-001-trust-badges.jpg`) or photographic |
| 5 | **No purple/blue SaaS gradient palette as brand chrome** | Equinox and Arc'teryx run zero blue or purple in UI chrome across 54 frames. Eight Sleep's only blue is a muted slate promo banner (`eightsleep-116`) or functional temperature data (see #1) - never a bright indigo/violet gradient. Cadence's locked palette contains no blue or purple at all |
| 6 | **No centered-hero-with-blob-illustration. No illustrations, blob shapes, or abstract SVG decoration of any kind** | Not a single illustration, blob, or abstract graphic appears in 57 sampled frames; all three brands are 100% photography-led |
| 7 | **No stock-photo energy - every photo must look bespoke and on-location** | All three brands reuse identifiable real locations, products, and a consistent grade across dozens of frames (`equinox-088`/`125`/`159`; `arcteryx-055`/`056`) |
| 8 | **No more than 2 typefaces total, and Cadence uses 1: Inter** | Equinox runs a single grotesk across all 41 sampled frames with zero exceptions; Equinox is primary. Arc'teryx's serif-display + sans model (`arcteryx-001` vs `arcteryx-065`) is the looser alternative and is not the reference |
| 9 | **No more than 4 font weights: 400 / 500 / 600 / 700. No light, no black, no italic** | Every headline/body/microlabel pairing observed reduces to a small consistent set; no sampled frame in any source shows more than a light/regular/bold spread |
| 10 | **Spaced all-caps microlabels are REQUIRED for section and category labels, not optional** | The one device all three sources converge on independently (`equinox-128`, `arcteryx-065`, `eightsleep-104`) - the load-bearing premium-taxonomy signal across the whole corpus |
| 11 | **Hairline borders only - 1px, or 2px for a selected state. Nothing heavier** | Every bordered surface sampled uses a hairline (`equinox-128` pricing cards, `arcteryx-065` footer rule); nothing heavier appears anywhere |
| 12 | **Text-on-photo legibility comes from photo selection or a measured scrim (~58% grey, or ~81%+ light card) - never a default translucent-black gradient bar** | The one composition running all three mechanisms side by side (`equinox-038`) uses a grey frosted scrim, a near-opaque white card, and bare photo selection. The generic dark-gradient-at-the-bottom treatment appears nowhere in this corpus |

### 7.2 Motion constraints

| Rule | Evidence |
|---|---|
| **Hover NEVER transforms.** No scale, no translate, no lift, no shadow-in, no size or position change, on any element, in any state. Hover is `opacity` / `background-color` / `color` only | The single most consistent finding across all 13 clips and three brands: card position and size never change on hover (`equinox-motion-02`) |
| **Duration bands are fixed: ≤150ms micro, 330–500ms panel, 650ms–1.7s page/scroll.** Nothing between bands, nothing outside them | `equinox-motion-02`/`-05`/`-06`, `eightsleep-motion-01`/`-02`, `arcteryx-motion-01` |
| **Ease-out is the only interactive curve. Ease-in-out is reserved for scroll/narrative checkpoints. Linear is banned** | Linear appears nowhere in the corpus |
| **Open is always slower than close** | `eightsleep-motion-01` (500ms / instant), `equinox-motion-06` (400ms / ≤167ms) |
| **Auto-advance is always heavier than the user-triggered equivalent** | `equinox-motion-03`, `equinox-motion-07` |
| **Nav chrome, divider rules, and underlines never animate.** The only permitted nav animation is an icon swap on menu open | All 13 clips |
| **Hero video: static camera, autoplay, muted, looping, zero overlay choreography.** No Ken Burns, no zoom, no pan, no parallax | `equinox-motion-01`, `equinox-motion-08` |

### 7.3 Layout and structure constraints

| Rule | Evidence |
|---|---|
| **One container: 1552px max, 64px gutters.** No second container, no second guideline | Collapses Equinox's unreconciled 64px / 244px split (`equinox-001` vs `equinox-018`/`011`/`056`/`051`) |
| **Section padding is 56px (default) or 64px (emphasis). No third value. `--space-120` exists for one marketing breathing moment and is DERIVED, not measured** | `equinox-048`, `equinox-150`, `equinox-060`, `equinox-064` |
| **Zero-gap full-bleed sequencing is reserved for photographic marketing moments only.** Data and task surfaces use the padded rhythm | Equinox's own split between its home page reel and its form/FAQ pages |
| **The footer has real columns** (4 groups, Eyebrow headers) plus a black newsletter band. Equinox's single link list + far-right icons is not inherited | `equinox-051` is the anti-pattern; `arcteryx-065`/`066` is the structure |
| **Grid gutter 16px.** Zero-gutter grids only for dense photographic tiles | `equinox-128` (17px measured) vs `arcteryx-055` (0px) |
| **Never hide a CTA until hover** | Equinox hides plan-card links until hover (`equinox-025` vs `027`/`029`) - mobile-hostile, not inherited |
| **A hero or section-opening panel carries at most one headline, one paragraph, one CTA** | `equinox-056`, `equinox-069` |

### 7.4 The do list

- **Radius 0, shadow none, 1px hairlines, one typeface, four weights** - the four rules that produce most of the look.
- **Reveal Panel is the primitive.** Before building a new hover/select/expand surface, check whether it is the Reveal Panel with a different axis. Equinox gets four distinct surfaces out of one mechanic; Cadence should too.
- **Tracked ALL CAPS +0.08em for Eyebrows and Buttons. Sentence case everywhere else.** One rule, no exceptions.
- **Accent green is a signal, not decoration.** Use it for: primary button fill, selected state (2px border + tint), status "on target", data-viz lines, and the featured plan-card border. Do not use it for large background fills, body text on dark, or as a section wash.
- **Every measured number stays measured.** 432px card, 80px nav, 64px input, 56px card padding, 17px→16px gutter. If a build needs a different number, it goes in this file first.

---

## 8. Open questions

### 8.1 Cross-doc conflicts and their resolutions

Each is a real disagreement between two extraction docs, or between a doc and this file. Resolution is stated; the losing value is preserved so it can be revisited.

| # | Conflict | Resolution |
|---|---|---|
| 1 | **Nav bar height.** `layout.md` measures **80px** by edge-scan (y=4.5→84.5, `equinox-001`). `components.md` §2.1 estimates "~72–80px" and openly shows confused DPR arithmetic in the same sentence | **80px.** The edge-scan carries explicit coordinates; the other is a visual estimate that admits its own uncertainty |
| 2 | **Promo/announcement strip height.** `layout.md` measures **35px** (y=84.5→119.5). `components.md` §2.1 estimates "~48px tall" | **35px.** Same reason as #1 |
| 3 | **Floating card width.** `layout.md` measures **432px** (x=243.5→675.5, pixel-identical in two independent files). `components.md` §4.1 estimates "≈512px" | **432px.** Two files agreeing to the half-pixel beats one visual estimate |
| 4 | **Floating card padding.** `layout.md` measures **56–57px inline, 64px block-end**. `components.md` §4.1 estimates "~48px all sides" | **56px inline / 64px block-end.** `layout.md` names the specific glyph it measured against ("F" of "Find A Club", flat left stroke, avoiding bearing distortion) |
| 5 | **Grid gutter.** MEASURED 17px (`equinox-128`). The 8px base unit wants 16px | **16px, and the 17px measurement is recorded here.** A 1px snap to the base grid; nothing else in the system is rounded |
| 6 | **Eight Sleep gutter.** MEASURED 32.5px (`eightsleep-001`) | **32px** (`--space-32`). Same 0.5px snap |
| 7 | **Off-white hex.** `tokens.md` measures `#f8f7f3` on three independent files. `art-direction.md` measures RGB(250,249,247) = `#faf9f7` on the trust-badge card. `components.md` estimates "#F5F3EF-ish" (§9.3) and "#F2F1EC-ish" (§1.1) | **`#f8f7f3`.** Sampled with a documented `ffmpeg` block-average and cross-confirmed on three unrelated files; the others are single-sample or eyeballed |
| 8 | **Eight Sleep primary button radius.** `components.md` §1.4 calls it a full 999px pill; §9.1 corrects this after an `ffmpeg` crop - the primary CTA is an ~8–10px soft rectangle, and the true stadium radius lives on secondary elements only | Moot for Cadence (radius 0), but the corrected reading stands: **soft-rect primary, pill secondary.** Recorded so nobody "restores" a pill thinking it was the source's primary shape |
| 9 | **Section padding.** `PROMPT-gemini.md` offers "min 120px section padding" as an example of the kind of rule wanted. Measurement gives **56px and 64px** | **56/64px.** The prompt's 120px was illustrative, not derived from the corpus. `--space-120` exists in the scale but is DERIVED and used only for a deliberate marketing breathing moment |
| 10 | **Body size.** Both marketing sources measure 18–19px (`equinox-018`, `eightsleep-006`). `typography.md` recommends 16px for in-app | **16px Body, 18px Body-large.** The corpus reads are marketing copy set large; Cadence is a daily-use app. Both are in the scale |
| 11 | **Reveal Panel active fill: opaque or translucent?** `components.md` §5.1 reads it as "solid white"; §5.3 corrects to "white at reduced opacity" because the active block takes a green tint from the photo beneath it (`equinox-184`) | **Translucent - `--scrim-white` at 81%.** The tint bleed is proof; an opaque fill cannot do that |
| 12 | **Accordion trigger.** `motion.md` clip 06 measures **hover-dwell** (cursor idle 4–9 frames before the row opens, no mouse-down). `components.md` §7.1 describes it as click/expand | **Click.** Hover-dwell is unreachable on touch and produces accidental opens on a dense list. Recorded as a deliberate departure from the measured Equinox behavior |
| 13 | **Grid gutter philosophy.** Arc'teryx runs 0px (`arcteryx-055`), Equinox runs 17px (`equinox-128`) | **16px default; 0px permitted only for dense photographic tile grids.** Equinox is primary |
| 14 | **Container inset for editorial content.** Equinox measures **243.5px** on five independent frames. `layout.md` recommends collapsing to one container plus a documented +24/+32px inset | **One container (64px gutter) + `--inset-editorial` 32px = 96px from the viewport.** This is the largest deliberate departure from a well-replicated measurement in this file. If Cadence wants the wide editorial feel back, the alternative is `--inset-editorial: 180px` (64 + 180 = 244). Flagged for Jake, 8.3 #4 |
| 15 | **Disabled-state convention.** Equinox uses a grey fill + blocked cursor (`equinox-142`); Eight Sleep uses a lighter stroke / reduced opacity on an otherwise identical control (`eightsleep-056`, `eightsleep-144`) | **Eight Sleep's opacity approach.** Visible without a cursor, which matters on touch. This is one of the few places a non-primary source wins |
| 16 | **`--border` fails WCAG non-text contrast.** `#d5d5d5` measures **1.37:1** on off-white, **1.47:1** on white - below the 3:1 minimum for a perceivable UI boundary. `tokens.md` flags it as a real accessibility gap in the source | **Two tokens.** `--border` (`#d5d5d5`) for decorative rules and dividers; `--border-strong` (`#8f8f8f`, DERIVED at 3.02:1) for anything a user must perceive as an interactive boundary - inputs, outlined buttons, segmented controls |
| 17 | **Equinox club-card white fill.** `components.md` §4.5 notes one club card rendered solid white while every other card on the same scroll is dark (`equinox-064`), and flags the alternation rule as **inferred, not observed** | Not adopted. Cadence's list rows use one consistent resting state; highlighting is the Reveal Panel active state, driven by interaction, not by index |
| 18 | **Easing curves are not measurable.** `motion.md` states plainly that at 6fps most transitions are too fast to resolve a curve at all | The cubic-beziers in 5.2 are **DERIVED**, not measured. What *is* measured and load-bearing: ease-out is the shape (change front-loaded, then settles), linear appears nowhere, and ease-in-out appears exactly once |
| 19 | **`--space-120` and `--space-48`** have no corpus measurement behind them | Both are DERIVED scale fills. `--space-48` is a normal 8px step; `--space-120` should be used sparingly and is the first thing to cut if the rhythm feels loose |

### 8.2 Corpus gaps - what the evidence does not cover

These are not decisions. They are places where this file is silent or guessing, and where a live-site check or a deliberate re-record is needed before building.

**Never captured at all:**

- **Mega-menu / dropdown content.** `arcteryx-093-discover-dropdown-menu-logo.jpg` shows only the *open transition* - "DISCOVER" bold+underlined, the utility icons swapped to a close X, the page body dimmed. **No columns, no links, no promo tile are visible.** `arcteryx-motion-01` confirms the panel mounts fully formed but does not reveal its interior at readable resolution. Equinox's own "More ▾" dropdown was **never opened during recording**. **Consequence: 4.5 specs the menu's open/close mechanic and nothing about its internal layout.** Do not spec mega-menu content structure from this corpus.
- **Any quiz UI.** `eightsleep-160` shows a feature-benefit card mid-carousel; whatever quiz the filename references sits elsewhere on that page's scroll and is not captured (`components.md` §8.4). Cadence's onboarding quiz has no reference.
- **Mobile and tablet.** The entire corpus is a single 1679 CSS px desktop viewport. There is **no breakpoint evidence of any kind** - no mobile nav, no stacked grid, no touch target sizing, no responsive type ramp. Everything below 1679px in this file is derived.
- **Focus-visible states.** Not one keyboard-focus treatment appears anywhere. `equinox-motion-05` catches what looks like a browser-default focus ring on a carousel arrow; that is the only signal. The focus spec in 4.1 is derived.
- **Error, empty, loading, and skeleton states.** Zero coverage across 137 stills.
- **Dark mode as a system.** Equinox is black-canvas by default and Eight Sleep alternates dark and light sections, but neither is a *toggleable* theme. No evidence for a dark-mode token mapping.
- **Newsletter / email capture at Equinox.** Footer frames show link columns and social icons but no email field (`components.md` §8.3). The newsletter spec in 3.8 comes from Eight Sleep and Arc'teryx.

**Captured but incomplete - the re-record list** (from `design-refs/README.md`):

| Site | Gap |
|---|---|
| Equinox | **Nav mega-menu / "More" dropdown** - never opened; no still, no clip |
| Equinox | **Membership plans grid hover states** - the 4-up grid was only scrolled past; no hover or plan-switch motion |
| Equinox | **Club-directory List/Map toggle** - visible in stills (`equinox-069`/`088`) but never clicked |
| Equinox | **Exclusives carousel manual arrows** - clip 05 catches the auto-advance; the manual prev/next transition was scrolled through too fast to read |
| Equinox | **Spa hero** - the page was left idle ~60s and went black; a deliberate pass over the service-menu scroll reveal would be more useful |
| Eight Sleep | **Hotspot tour, Hub/Blanket/Base panels** - clip 01 only catches Cover and Pillow Cover |
| Eight Sleep | **Sound "ripple" rings** - visible in `eightsleep-188` but scrolled past before it animated |
| Eight Sleep | **Autopilot phone-app screens** - `eightsleep-148` shows a static screenshot inside a carousel card; the live app (temperature schedule editor, Autopilot toggle) was never opened |
| Eight Sleep | **Review carousel manual tab click** - only the auto-scroll between cards was recorded, not a deliberate filter-tab click |

**Inferred, not observed** - three specs in this file rest on a reasonable guess and should be confirmed before they are built against:

1. **Equinox's "Book Your Visit" CTA** renders as light-grey fill / grey text in every captured frame, including after a club is selected (`equinox-048`, `equinox-151`). Very likely a real disabled state gated on unfilled required fields - but possibly just its static style.
2. **Eight Sleep's before/after thermal split** (`eightsleep-164`/`168`) reads as a static split-screen with a hard seam; no drag handle is visible, and `eightsleep-motion-03` confirms the glow is a baked-in image with zero animation. Whether the live component is draggable is unknown.
3. **Button hover** rests on exactly one observation - `equinox-240` shows the filled "Find a Spa" button at ~70% opacity under the cursor. That single frame is the entire basis for the hover rule in 4.1 and 7.2.

### 8.3 Open decisions - Jake's calls

**Jake ruled (2026-07-31): #1 `#3A5A40` CONFIRMED. #2 tracked ALL CAPS CONFIRMED. #3 BLACK-FIRST — `--surface-bg` is black; this overrides this file's light-first default everywhere it appears; §1.4 text-role pairs re-derive against black (accent-on-black stays large-text/icon/border only per #1). #4-7 DEFERRED to visual pick: build with the defaults below, but render each as a switchable variant so Jake can see-and-pick (editorial inset 32 vs 180, nav left vs centered, carousel snap vs ease, max-width check on the week view). #8: a mark WILL be designed, Arc'teryx-like (abstract geometric mark + wordmark lockup) — concepts in progress; nav builds against the lockup slot.**

These are genuinely his: taste, brand direction, or a real tradeoff. Each names a default so an agent is never blocked, and each is reversible in one token or one rule.

**1. Accent green hex.** *Recommended: `#3A5A40`.* Clears AA-normal on both light surfaces at 7.21–7.73:1 with real margin. `#33503A` is darker and more matte (8.34–8.94:1, near AAA) - pick it if accent-colored small text on light surfaces will be common. `#3F6248` is lighter and friendlier but the weakest of the three. **None of them clears AA-normal on black** (2.35–3.05:1), so accent-on-black stays large-text/icon/border only regardless of the choice. One-token change: `--color-accent`.

**2. Case convention for buttons.** *This file's rule: tracked ALL CAPS +0.08em on all buttons*, per Equinox's repeated plan-card CTAs (`equinox-128`), with Eyebrows as the only other all-caps style. **The live alternative** (`typography.md`'s own recommendation): **Title Case, no tracking, on all buttons**, reserving all-caps exclusively for Eyebrows - following Equinox's *chrome* convention instead (`equinox-001` "Join Today"). The tradeoff: all-caps buttons read harder, more systematic, more "performance product"; Title Case reads warmer and is easier to scan at small sizes, which matters for a daily-use app with a lot of buttons. Equinox ships both on the same site, so there is no "correct" answer in the corpus. One-rule change: §2.3 plus the Button row in §2.2.

**3. Default page surface: light-first or black-first?** *This file's default: light-first* - `--surface-bg` is `--color-off-white`, with `--surface-inverse` black reserved for nav, footer newsletter band, and marketing hero sections. **But Equinox, the primary tonal reference, is near-total black canvas** (`equinox-125`, `equinox-128`, `equinox-060` - page background, card interiors, and chrome are all `#000000` with no distinction). A black-first Cadence would be more literally Equinox; a light-first Cadence is more legible for dense daily data (plans, diary, macros, chat) and is what the measured off-white token was built for. **This is the biggest single look-and-feel decision in the file** and it is not settled by evidence. One-token change: swap `--surface-bg` / `--surface-inverse`, then re-derive the text-role pairs in §1.4.

**4. Editorial inset: 32px or 180px?** *This file's default: 32px* (floating cards and editorial text start 96px from the viewport). Equinox measures **243.5px** on five independent frames, which is a much wider, more editorial feel. `layout.md` argues the 244px is a historical accident and recommends the collapse; that argument is about *system hygiene*, not about which one looks better. If the wide feel is wanted, set `--inset-editorial: 180px` and everything else in this file still holds.

**5. Nav shell: left-logo or centered-logo?** *This file's default: left-logo*, following Equinox (`equinox-001`, all 83 frames) - logo left / links center-left / CTA pair right. **The alternative is Eight Sleep's centered-logo bar** (`eightsleep-116` + every frame): links left / centered wordmark / utility cluster right, which reads as more editorial and more premium on a marketing surface. Cadence could legitimately run centered on marketing and left-aligned in-app, but that is two shells to maintain. Taste call.

**6. Carousel feel: snap or authored ease?** *This file's default: snap* (≤167ms, no visible glide), because that is what Equinox measures (`equinox-motion-05`) and it reads confident rather than sluggish. `motion.md` explicitly flags this as a deliberate Cadence decision rather than an inherited one: a designed 200–300ms ease-out slide is the alternative and would feel softer, more app-like, and less abrupt on a wide track. One-token change: add a `--dur-carousel`.

**7. Container max-width: 1552px?** *This file's default: 1552px* (Equinox's measured 1551px content width, +1 for an even value). Worth a sanity check against Cadence's densest real screen - a week view with seven day-columns plus a detail rail - before it is locked. Purely mechanical; flagging it because it is cheap to change now and expensive later.

**8. The Cadence mark.** Arc'teryx is in the corpus as a **logo and vibe reference only**, and the best frames are catalogued (`arcteryx-001-logo-nav-hero.jpg` nav wordmark, `arcteryx-014-outlet-logo-footwear-hero.jpg`, `arcteryx-062-tradein-academy-logo-jacket.jpg` embroidered bird + wordmark close-up, `arcteryx-065-footer-logo-nav-links.jpg`). **No Cadence mark exists yet**, so this file specifies where the logo sits (3.6, 3.8) and nothing about what it is. Wordmark-only, or mark + wordmark lockup, is Jake's call and gates the nav build.
