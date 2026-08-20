# Ordering goes through published APIs, never a browser

**Picked:** an order rail must be a published API. The project rule in `CLAUDE.md` names the
Instacart Developer Platform and the Kroger public API as the sanctioned ones.

**Shipped:** `lib/rails.ts` implements two rails, `instoreRail` (id `instore`) and `instacartRail`
(id `instacart`, calling the Instacart IDP `products_link` endpoint). Kroger is sanctioned and
unbuilt; no Kroger client, route, or environment variable exists in the repo.

**Rejected:** browser automation against a grocery site. No exceptions, ever, in product code.

**Reason:** an automated checkout against a site that did not publish an API breaks that site's terms
and breaks the moment they ship a redesign. A product whose core loop depends on scraping a checkout
flow has no floor under it.

**What this constrains:**

- The in-store run is the primary order rail, not a fallback. Without `INSTACART_API_KEY` the Order
  button 503s and the in-store flow still closes the loop: you check items off in the aisle, that
  writes `PantryInflow`, and the pantry moves.
- Adding a rail means finding a published API first. If there is none, there is no rail.
- The first live call against a new API is a multi-hypothesis curl probe, not code written against
  mocks. Decode the OAuth scopes before trusting a 403.
- Ingredient-to-product matching decisions get logged with the input, the candidates, and the choice.
  They are training data for the matcher.

**A neighbouring case that is not an exception:** extraction reads a page's public structured data.
NYT Cooking ships its full recipe in public JSON-LD despite the paywalled UI, so a fetch beats an
assumption about what a paywall blocks. That is reading a published document, not driving a session.
Instagram stays unsupported because it is login-walled, and a voiceover-only TikTok fails honestly
rather than guessing at a recipe.

**What would reopen it:** a grocer publishing an ordering API. That adds a rail; it does not change
the rule.
