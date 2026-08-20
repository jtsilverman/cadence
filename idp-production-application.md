# Instacart Developer Platform — production key application package

Draft for the production-key application (unit 7). Blanks marked `[JAKE]` need the
product name / business entity. Process facts: application goes through the
Developer Dashboard after dev-key access; Instacart states ~30-40 days from access
request to demo approval + production key; an Enterprise Help Desk account and a
business entity are requested during the process.

## Product description

**Name:** [JAKE — product name] (working title: cadence)
**What it does:** A personal food loop: users save recipes from any URL, pick their
week's meals, and get a shopping list that already subtracts what's in their
pantry. They order via an Instacart shoppable page or shop in-store with a
checklist; delivered orders and cooked meals keep the pantry current automatically.
**Who it's for:** Individuals/households planning weekly grocery runs around real
recipes. Single-household product today; accounts and multi-household later.

## Integration details

- **Surface:** Create Shopping List Page (`POST /idp/v1/products_link`,
  `link_type: shopping_list`). Planned second surface: Create Recipe Page for
  per-recipe ordering from a recipe card.
- **Flow:** user reviews an editable list in-app (aggregated across recipes, pantry
  items already excluded) → clicks Order → we create the shopping-list page →
  user completes store selection and checkout entirely on Instacart.
- **Line items:** generic ingredient names as search terms; quantities/units
  included where known and never invented; dual-unit ingredients sent as one
  line item with multiple measurements; no brand pinning in v1.
- **Linkback:** `landing_page_configuration.partner_linkback_url` returns the user
  to our delivery-confirmation page after checkout.
- **Volume expectation:** single-digit orders/week at launch (private beta),
  growing with user count; every order is user-initiated (one click = one page
  created), no batch or automated page creation.

## Guideline compliance

- **User-initiated only:** pages are created only on an explicit user action;
  no automated ordering, no scraping, no cart manipulation outside the API.
- **Messaging:** in-app copy says "Order (Instacart)" and hands off visibly to
  Instacart's page; we never imply the order happens inside our app, never
  misrepresent pricing/availability (we display none), and checkout, payment,
  and substitutions all happen in Instacart's UI.
- **Data:** we store only what the user gave us (their recipes, their pantry,
  their list) plus the returned page URL. No Instacart catalog data is stored,
  cached, or re-displayed.
- **Branding:** Instacart name/mark used only on the order button per brand
  guidelines; no co-branding claims.

## Business

- **Entity:** [JAKE — form entity at application time? open question in spec]
- **Affiliate:** interested in the Impact.com partner affiliate program
  post-launch; not a launch requirement.
- **Contact:** [JAKE — email for the Enterprise Help Desk account]

## Demo package (assembled at submission)

- Live URL of the deployed app (unit 7 deploy) with a walkthrough account.
- 2-minute screen recording: save recipe → pick week → list → Order → Instacart
  page opens with matching items → back via linkback → mark delivered.
- This document.
