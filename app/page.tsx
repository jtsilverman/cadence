import "./landing.css";
import { CtaLink, ShopCarousel } from "./landing-client";
import { SiteFooter, SiteNav } from "./site-chrome";

// Landing v4 (specs/landing-v4.md): Eight Sleep anatomy transplant. Cream
// bands carry marketing copy, dark bands carry app moments; photography and
// carousels do the storytelling — no board artifacts. Copy sources are locked:
// shipped v3.2 strings, drafts/website/WEBSITE.md locked lines, and the six
// approved persona cards. The plan adapts as you log; no coach persona.

export const metadata = {
  title: "Cadence — your food life, finally organized",
  description:
    "Cadence makes it easy to stay on top of your nutrition without compromising your time, your social life, or getting in the way of your life.",
};

// The five plan stories (revised 2026-08-04: no click-around — the stories
// sit beside the photo, always visible; copy unchanged from the v3.2 popups).
const SHOP_CARDS = [
  {
    title: "Knows what you have",
    body: "The pantry keeps score, so the list leaves off what's already on your shelf.",
    photo: "/photos/spare-board-flatlay.jpg",
  },
  {
    title: "Knows what you need",
    body: "Every ingredient across the planned week, combined and sorted by aisle.",
    photo: "/photos/spare-list-notepad.jpg",
  },
  {
    title: "Fits the week you planned",
    body: "Change the plan and the list follows. One shop, no second trips.",
    photo: "/photos/spare-produce-shelf.jpg",
  },
];

const SAVE_CARDS = [
  {
    kind: "reel",
    source: "A TikTok you saved at midnight",
    result: "2-min creamy pasta",
    detail: "Structured recipe · scheduled Tuesday · 3 items on this week's list",
  },
  {
    kind: "screenshot",
    source: "A screenshot from your camera roll",
    result: "Harissa chicken bowls",
    detail: "Ingredients with amounts · steps · estimated nutrition",
  },
  {
    kind: "blog",
    source: "A food blog with 900 words of backstory",
    result: "Just the recipe",
    detail: "Keeps the method, skips the memoir",
  },
  {
    kind: "card",
    source: "A photo of grandma's recipe card",
    result: "Sunday sauce, preserved",
    detail: "Read from the photo · portioned · on the rotation",
  },
];

const LIVE_MOMENTS = [
  {
    who: "you" as const,
    text: "Lunch turned into a work thing — Caesar salad with chicken from Sweetgreen.",
    when: "Friday, 12:40pm",
  },
  {
    who: "plan" as const,
    text: "Logged. Lighter than planned, so the weekend gets a little room back — nothing for you to redo.",
    when: "Cadence",
  },
  {
    who: "you" as const,
    text: "Drinks tonight with Sam — problem?",
    when: "Saturday, 6:05pm",
  },
  {
    who: "plan" as const,
    text: "It's been in the plan since Tuesday. Enjoy.",
    when: "Cadence",
  },
];

// The six approved persona cards (Jake, 2026-08-03), eightsleep
// sleep-challenges idiom. Never claim "no weighing": you weigh to a target,
// you don't type weights in after.
// Label + headline only (Jake 2026-08-04: too many words — body lines cut).
const PERSONAS = [
  {
    label: "The social eater",
    headline: "Friday night is not a cheat.",
    photo: "/photos/band-dinner-table.jpg",
  },
  {
    label: "The TikTok saver",
    headline: "Actually cook the thing you saved.",
    photo: "/photos/spare-cooking-hands.jpg",
  },
  {
    label: "The restarter",
    headline: "Stop starting over on Monday.",
    photo: "/photos/spare-sunrise-silhouette.jpg",
  },
  {
    label: "The spiraler",
    headline: "One bad meal is just a meal.",
    photo: "/photos/spare-cooking-window.jpg",
  },
  {
    label: "The office luncher",
    headline: "Chipotle with the team, on plan.",
    photo: "/photos/detail-meals.jpg",
  },
  {
    label: "The winging-it shopper",
    headline: "A cart that matches a plan.",
    photo: "/photos/spare-market-aisle.jpg",
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <SiteNav
        links={[
          { href: "#plan", label: "How it works" },
          { href: "/faq", label: "Questions" },
        ]}
        cta="nav"
      />

      <main>
      {/* 1 — Hero (eightsleep 006→008: black headline on cream, short sub,
          black button, then one giant inset photo). */}
      <section className="hero">
        <div className="container hero-inner">
          <h1 className="h-display">Your food life, finally organized.</h1>
          <p className="lede hero-lede">
            Cadence makes it easy to stay on top of your nutrition without compromising your
            time, your social life, or the way you like to eat.
          </p>
          <CtaLink cta="hero" className="btn btn--ink btn--hero">
            Join the waitlist
          </CtaLink>
          <p className="cta-footnote">Early members shape what gets built. One note a week.</p>
        </div>
        <div className="container">
          <div
            className="hero-photo"
            style={{ backgroundImage: "url(/photos/hero-cooking.jpg)", backgroundPosition: "center 72%" }}
            role="img"
            aria-label="A pot steaming on a stove at golden hour"
          />
        </div>
      </section>

      {/* 2 — Statement band (eightsleep 006 centered value-prop breather).
          Locked copy: drafts/website/WEBSITE.md §2. */}
      <section className="band band--white">
        <div className="container">
          <div className="statement" data-reveal="1">
            <h2 className="statement-title">
              You don&rsquo;t need more discipline. You need less overhead.
            </h2>
            <p className="lede statement-lede">
              The planning. The list. The guilt math after one night out. The Monday restart.
              Cadence takes care of all of it, so dieting stops being a second job and starts
              being second nature.
            </p>
          </div>
        </div>
      </section>

      {/* 3 — Plan: eightsleep-144 feature band, cloned ("Your side, perfectly
          cool or warm"): full-bleed photo, white eyebrow + headline + one
          line on the left. */}
      <section className="photo-band" id="plan">
        <div
          className="photo-band-photo photo-slot photo-slot--photo"
          style={{ backgroundImage: "url(/photos/hero-meals.jpg)" }}
        />
        <div className="container photo-band-inner" data-reveal="1">
          <div className="photo-band-copy">
            <span className="eyebrow eyebrow--on-photo">Plan</span>
            <h2 className="band-title">Your week, drafted around your life.</h2>
            <p className="lede band-lede--on-photo">
              Set your goal, your diet, and what you won&rsquo;t eat — once. The week drafts
              itself from recipes you actually like.
            </p>
          </div>
        </div>
      </section>

      {/* 4 — Shop (eightsleep 144 feature-card row). */}
      <section className="band band--white" id="shop">
        <div className="container">
          <div className="band-copy band-copy--center" data-reveal="1">
            <span className="eyebrow eyebrow--accent">Shop</span>
            <h2 className="band-title">A grocery list that knows your kitchen.</h2>
          </div>
          <ShopCarousel cards={SHOP_CARDS} />
        </div>
      </section>

      {/* 5 — Live (dark app-moment band: the change feed is the artifact,
          white-on-charcoal per the eightsleep data treatment). */}
      <section className="band band--dark" id="live">
        <div className="container live-inner">
          <div className="band-copy" data-reveal="1">
            <span className="eyebrow eyebrow--muted">Live</span>
            <h2 className="band-title">Life happens. The plan absorbs it.</h2>
            <p className="lede band-lede">
              Ate out, skipped a meal, said yes to a second round — log it in a sentence.
            </p>
          </div>
          <div className="live-feed">
            {LIVE_MOMENTS.map((moment, i) => (
              <div
                key={`${moment.who}-${i}`}
                className={`live-moment live-moment--${moment.who}`}
                data-reveal={String(Math.min(i + 1, 4))}
              >
                <span className="live-moment-when">{moment.when}</span>
                <p>{moment.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6 — Save: all four cards at once, nothing to page through
          (Jake 2026-08-04). */}
      <section className="band band--white" id="save">
        <div className="container">
          <div className="band-copy band-copy--center" data-reveal="1">
            <span className="eyebrow eyebrow--accent">Save</span>
            <h2 className="band-title">Found it anywhere? It&rsquo;s in the plan.</h2>
            <p className="lede band-lede">
              Drop in the TikTok, the screenshot, the blog link. It comes back a structured
              recipe.
            </p>
          </div>
          <div className="save-grid">
            {SAVE_CARDS.map((card) => (
              <div key={card.kind} className="save-card">
                <div className={`save-card-media save-card-media--${card.kind}`}>
                  <span className="save-card-source">{card.source}</span>
                </div>
                <div className="save-card-body">
                  <span className="save-card-result">{card.result}</span>
                  <p>{card.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7 — Persona grid (eightsleep sleep-challenges idiom, 040/056):
          six "this is me" cards before the ask. */}
      <section className="band band--cream" id="you">
        <div className="container">
          <div className="band-copy band-copy--center" data-reveal="1">
            <span className="eyebrow eyebrow--accent">For you</span>
            <h2 className="band-title">Built for the way you actually eat.</h2>
          </div>
          <div className="persona-grid">
            {PERSONAS.map((persona) => (
              <div key={persona.label} className="persona-card">
                <div className="persona-photo" style={{ backgroundImage: `url(${persona.photo})` }} />
                <div className="persona-text">
                  <span className="persona-label">{persona.label}</span>
                  <h3>{persona.headline}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8 — The close: the statement over the sunset, then the ask. */}
      <section className="cta-band">
        <div
          className="photo-slot photo-slot--photo"
          style={{ backgroundImage: "url(/photos/band-sunset-cheers.jpg)" }}
        />
        <div className="container cta-inner" data-reveal="1">
          <h2 className="cta-title">
            You&rsquo;re not logging food.
            <br />
            You&rsquo;re living your life.
          </h2>
          <p className="lede cta-lede">
            Cadence is the easy, flexible way to stay on top of your diet — with intention and
            balance — while you focus on everything else.
          </p>
          <CtaLink cta="closing" className="btn btn--white btn--hero">
            Join the waitlist
          </CtaLink>
          <p className="cta-footnote">Early members shape what gets built. One note a week.</p>
        </div>
      </section>
      </main>

      <SiteFooter />
    </div>
  );
}
